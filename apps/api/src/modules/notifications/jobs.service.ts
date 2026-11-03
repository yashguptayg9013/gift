import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Severity } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AiService } from '../ai/ai.service';
import { InsightsService } from '../ai/insights.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DELIVERY_QUEUE, DeliveryJob, DeliveryService } from './delivery.service';
import { NotificationsService } from './notifications.service';

export const SCAN_QUEUE = 'puja-scans';
export const JOB_NAMES = ['low-stock-scan', 'production-delay-scan', 'po-overdue-scan', 'inspection-pending-scan', 'daily-summary'] as const;
export type JobName = (typeof JOB_NAMES)[number];

const istDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Scheduled scans and the daily summary. With JOBS_ENABLED, BullMQ job schedulers
 * run them (cron, Asia/Kolkata) and a worker processes deliveries. Every job can
 * also be triggered manually (Administration → Jobs) and is idempotent through
 * notification dedupe keys.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue: Queue | null = null;
  private workers: Worker[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly delivery: DeliveryService,
    private readonly insights: InsightsService,
    private readonly ai: AiService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.redis.enabled || process.env.JOBS_WORKER === 'false') return;
    const connection = this.redis.getClient()!;
    this.queue = new Queue(SCAN_QUEUE, { connection, defaultJobOptions: { removeOnComplete: 200, removeOnFail: 1000, attempts: 2 } });
    const n = await this.settings.get('notifications');
    const schedules: [JobName, string][] = [
      ['low-stock-scan', '7 * * * *'],
      ['production-delay-scan', '17 8,14 * * *'],
      ['po-overdue-scan', '23 9 * * *'],
      ['inspection-pending-scan', '37 */4 * * *'],
      ['daily-summary', `41 ${n.dailySummaryHour} * * *`],
    ];
    for (const [name, pattern] of schedules) {
      await this.queue.upsertJobScheduler(name, { pattern, tz: 'Asia/Kolkata' }, { name });
    }
    this.workers.push(
      new Worker(SCAN_QUEUE, (job: Job) => this.run(job.name as JobName), { connection: connection.duplicate(), concurrency: 1 }),
      new Worker(DELIVERY_QUEUE, (job: Job<DeliveryJob>) => this.delivery.deliver(job.data), { connection: connection.duplicate(), concurrency: 5 }),
    );
    for (const w of this.workers) w.on('failed', (job, err) => this.logger.warn(`job ${job?.name} failed: ${err.message}`));
    this.logger.log('Background jobs scheduled');
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
    await this.queue?.close().catch(() => undefined);
  }

  async run(name: JobName): Promise<unknown> {
    switch (name) {
      case 'low-stock-scan': {
        if (!(await this.settings.get('inventory')).lowStockScanEnabled) return { skipped: true };
        return this.notifications.checkLowStock();
      }
      case 'production-delay-scan':
        return this.delayScan();
      case 'po-overdue-scan':
        return this.poOverdueScan();
      case 'inspection-pending-scan':
        return this.inspectionScan();
      case 'daily-summary':
        return this.dailySummary();
    }
  }

  private async delayScan() {
    if (!(await this.settings.get('production')).delayScanEnabled) return { skipped: true };
    const delayed = await this.insights.delayedOrders();
    for (const o of delayed) {
      await this.notifications.notify({
        type: 'production.delayed',
        title: `${o.number} is ${o.daysLate} day(s) late`,
        body: `${o.sku} — ${o.completed}/${o.planned} completed${o.currentStage ? `, at ${o.currentStage}` : ''}.`,
        severity: o.daysLate > 3 ? Severity.CRITICAL : Severity.WARNING,
        link: `/manufacturing/orders/${o.id}`,
        entityType: 'ProductionOrder',
        entityId: o.id,
        dedupeKey: `delay:${o.id}:${istDate()}`,
        recipients: { permissions: ['production.stage.update.any', 'production.release'] },
      });
    }
    return { delayed: delayed.length };
  }

  private async poOverdueScan() {
    const pos = await this.prisma.purchaseOrder.findMany({ where: { status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: new Date() } }, include: { supplier: { select: { name: true } } } });
    for (const po of pos) {
      await this.notifications.notify({
        type: 'procurement.po_overdue',
        title: `PO ${po.number} is overdue`,
        body: `${po.supplier.name} — expected ${po.expectedDate!.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
        severity: Severity.WARNING,
        link: `/procurement/orders/${po.id}`,
        entityType: 'PurchaseOrder',
        entityId: po.id,
        dedupeKey: `po-overdue:${po.id}:${istDate()}`,
        recipients: { permissions: ['procurement.po.manage'] },
      });
    }
    return { overdue: pos.length };
  }

  private async inspectionScan() {
    const old = await this.prisma.qualityInspection.findMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } }, select: { id: true, number: true, inspectorId: true } });
    for (const i of old) {
      await this.notifications.notify({
        type: 'quality.inspection_pending',
        title: `Inspection ${i.number} pending for over 24 hours`,
        severity: Severity.WARNING,
        link: `/quality/inspections/${i.id}`,
        entityType: 'QualityInspection',
        entityId: i.id,
        dedupeKey: `insp-old:${i.id}:${istDate()}`,
        recipients: i.inspectorId ? { userIds: [i.inspectorId] } : { permissions: ['quality.inspect'] },
      });
    }
    return { pending: old.length };
  }

  /** Facts are deterministic; the AI (if configured) only writes the narrative. */
  async dailySummary(day?: string) {
    if (!(await this.settings.get('notifications')).dailySummaryEnabled && !day) return { skipped: true };
    const facts = await this.insights.dailySummary(day);
    const narrated = await this.ai.narrate(facts);
    const content = narrated?.text ?? this.insights.templateSummary(facts);
    const date = new Date(`${facts.date}T00:00:00.000Z`);
    const row = await this.prisma.aiSummary.upsert({
      where: { date },
      create: { date, content, data: facts as unknown as Prisma.InputJsonValue, model: narrated?.model },
      update: { content, data: facts as unknown as Prisma.InputJsonValue, model: narrated?.model },
    });
    await this.notifications.notify({
      type: 'ai.daily_summary',
      title: `Business summary for ${facts.date}`,
      body: content.slice(0, 1500),
      link: '/copilot?tab=summaries',
      entityType: 'AiSummary',
      entityId: row.id,
      dedupeKey: `summary:${facts.date}`,
      recipients: { permissions: ['dashboard.view'] },
    });
    await this.audit.record({ action: 'ai.daily_summary', entityType: 'AiSummary', entityId: row.id, actorId: 'system', metadata: { aiNarrated: !!narrated } });
    return { date: facts.date, aiNarrated: !!narrated };
  }
}
