import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Severity } from '@prisma/client';
import { NOTIFICATION_TYPES, NotificationType } from '@puja/shared';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryService } from './delivery.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  severity?: Severity;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** de-duplicates per user (e.g. one low-stock alert per item per day) */
  dedupeKey?: string;
  recipients: { permissions?: string[]; userIds?: string[] };
}

const istDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly delivery: DeliveryService,
  ) {}

  /** Active users holding any of the permissions (via roles), or the explicit ids. */
  async resolveRecipients(r: NotifyInput['recipients']) {
    const or = [];
    if (r.userIds?.length) or.push({ id: { in: r.userIds } });
    if (r.permissions?.length) or.push({ roles: { some: { role: { permissions: { some: { permission: { in: r.permissions } } } } } } });
    if (!or.length) return [];
    return this.prisma.user.findMany({ where: { isActive: true, OR: or }, select: { id: true, email: true, name: true, phone: true, notificationPrefs: true } });
  }

  async notify(n: NotifyInput) {
    const users = await this.resolveRecipients(n.recipients);
    if (!users.length) return { created: 0 };
    const pref = (u: (typeof users)[number]) => u.notificationPrefs.find((p) => p.type === n.type) ?? { inApp: true, email: false, whatsapp: false };
    const inApp = users.filter((u) => pref(u).inApp);
    const res = await this.prisma.notification.createMany({
      data: inApp.map((u) => ({ userId: u.id, type: n.type, title: n.title, body: n.body, severity: n.severity ?? Severity.INFO, link: n.link, entityType: n.entityType, entityId: n.entityId, dedupeKey: n.dedupeKey })),
      skipDuplicates: true,
    });
    // Only deliver externally when the in-app row was new (avoids repeated emails for deduped alerts).
    if (res.count > 0 || !n.dedupeKey) {
      for (const u of users) {
        const p = pref(u);
        if (p.email && u.email) await this.delivery.enqueue({ channel: 'email', to: u.email, subject: n.title, text: `${n.body ?? ''}${n.link ? `\n\nOpen: ${n.link}` : ''}` });
        if (p.whatsapp && u.phone) await this.delivery.enqueue({ channel: 'whatsapp', to: u.phone, subject: n.title, text: n.body ?? n.title });
      }
    }
    return { created: res.count };
  }

  // ─── user-facing ───────────────────────────────────────────────

  async list(user: AuthUser, q: { unreadOnly?: boolean; skip: number; take: number }) {
    const where = { userId: user.id, ...(q.unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.notification.count({ where }),
    ]);
    return { rows, total };
  }

  unreadCount(user: AuthUser) {
    return this.prisma.notification.count({ where: { userId: user.id, readAt: null } }).then((count) => ({ count }));
  }

  async markRead(user: AuthUser, id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.findFirst({ where: { id, userId: user.id } }))) throw Errors.notFound('Notification', id);
  }

  async markAllRead(user: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  async preferences(user: AuthUser) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId: user.id } });
    return {
      channels: { email: this.delivery.emailConfigured, whatsapp: this.delivery.whatsappConfigured },
      types: Object.entries(NOTIFICATION_TYPES).map(([type, label]) => {
        const r = rows.find((x) => x.type === type);
        return { type, label, inApp: r?.inApp ?? true, email: r?.email ?? false, whatsapp: r?.whatsapp ?? false };
      }),
    };
  }

  async setPreferences(user: AuthUser, prefs: { type: string; inApp: boolean; email: boolean; whatsapp: boolean }[]) {
    for (const p of prefs) if (!(p.type in NOTIFICATION_TYPES)) throw Errors.validation(`Unknown notification type ${p.type}`);
    await this.prisma.$transaction(
      prefs.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId: user.id, type: p.type } },
          create: { userId: user.id, ...p },
          update: { inApp: p.inApp, email: p.email, whatsapp: p.whatsapp },
        }),
      ),
    );
    return this.preferences(user);
  }

  // ─── domain events → notifications ────────────────────────────

  @OnEvent('inventory.changed', { async: true, promisify: true })
  async onInventoryChanged(e: { itemIds: string[] }) {
    try {
      await this.checkLowStock(e.itemIds);
    } catch (err) {
      this.logger.warn(`low-stock check failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Alerts once per item per day when available stock is at/below reorder level or minimum. */
  async checkLowStock(itemIds?: string[]) {
    const low = await this.inventory.stockSummary({ lowStockOnly: true, itemIds });
    let created = 0;
    for (const i of low) {
      const r = await this.notify({
        type: 'inventory.low_stock',
        title: `${i.stockStatus === 'OUT' ? 'Out of stock' : 'Low stock'}: ${i.code}`,
        body: `${i.name} — available ${i.available} ${i.uom} (reorder level ${i.reorderLevel}, minimum ${i.minStock}).`,
        severity: i.stockStatus === 'OUT' ? Severity.CRITICAL : Severity.WARNING,
        link: i.type === 'MATERIAL' ? `/inventory/materials/${i.id}` : `/inventory/products/variant/${i.id}`,
        entityType: 'Item',
        entityId: i.id,
        dedupeKey: `low:${i.id}:${istDate()}`,
        recipients: { permissions: ['inventory.item.manage', 'procurement.requisition.manage'] },
      });
      created += r.created;
    }
    return { lowItems: low.length, created };
  }

  @OnEvent('inventory.adjustment_posted', { async: true, promisify: true })
  async onAdjustment(e: { transactionId: string; number: string; actorId: string }) {
    await this.safe(() =>
      this.notify({ type: 'inventory.adjustment_posted', title: `Stock adjustment ${e.number} posted`, link: `/inventory/transactions/${e.transactionId}`, entityType: 'InventoryTransaction', entityId: e.transactionId, recipients: { permissions: ['inventory.adjust.approve'] } }),
    );
  }

  @OnEvent('production.stage_completed', { async: true, promisify: true })
  async onStageCompleted(e: { orderId: string; number: string; stageName?: string; good: number }) {
    await this.safe(() =>
      this.notify({ type: 'production.stage_completed', title: `${e.number}: ${e.stageName ?? 'stage'} completed`, body: `${e.good} good unit(s).`, severity: Severity.SUCCESS, link: `/manufacturing/orders/${e.orderId}`, entityType: 'ProductionOrder', entityId: e.orderId, recipients: { permissions: ['production.stage.update.any'] } }),
    );
  }

  @OnEvent('production.completed', { async: true, promisify: true })
  async onProductionCompleted(e: { orderId: string; number: string }) {
    await this.safe(() =>
      this.notify({ type: 'production.completed', title: `Production order ${e.number} completed`, severity: Severity.SUCCESS, link: `/manufacturing/orders/${e.orderId}`, entityType: 'ProductionOrder', entityId: e.orderId, recipients: { permissions: ['production.release', 'sales.order.manage'] } }),
    );
  }

  @OnEvent('approvals.pending', { async: true, promisify: true })
  async onApprovalPending(e: { approvalId: string; number: string; title: string; requiredPermission: string }) {
    await this.safe(() =>
      this.notify({ type: 'approvals.pending', title: `Approval needed: ${e.title}`, body: e.number, severity: Severity.WARNING, link: `/approvals?id=${e.approvalId}`, entityType: 'ApprovalRequest', entityId: e.approvalId, recipients: { permissions: [e.requiredPermission] } }),
    );
  }

  @OnEvent('approvals.decided', { async: true, promisify: true })
  async onApprovalDecided(e: { approvalId: string; number: string; title: string; status: string; requestedById: string }) {
    await this.safe(() =>
      this.notify({
        type: 'approvals.decided',
        title: `${e.number} ${e.status.toLowerCase()}`,
        body: e.title,
        severity: e.status === 'EXECUTED' ? Severity.SUCCESS : e.status === 'FAILED' ? Severity.CRITICAL : Severity.INFO,
        link: `/approvals?id=${e.approvalId}`,
        entityType: 'ApprovalRequest',
        entityId: e.approvalId,
        recipients: { userIds: [e.requestedById] },
      }),
    );
  }

  @OnEvent('procurement.po_pending_approval', { async: true, promisify: true })
  async onPoPending(e: { purchaseOrderId: string; number: string; total: number; supplier: string }) {
    await this.safe(() =>
      this.notify({ type: 'procurement.po_pending_approval', title: `PO ${e.number} awaits approval`, body: `${e.supplier} · INR ${e.total.toLocaleString('en-IN')}`, severity: Severity.WARNING, link: `/procurement/orders/${e.purchaseOrderId}`, entityType: 'PurchaseOrder', entityId: e.purchaseOrderId, recipients: { permissions: ['procurement.po.approve'] } }),
    );
  }

  @OnEvent('quality.inspection_pending', { async: true, promisify: true })
  async onInspectionPending(e: { inspectionId: string; number: string; inspectorId?: string }) {
    await this.safe(() =>
      this.notify({ type: 'quality.inspection_pending', title: `Inspection ${e.number} pending`, severity: Severity.WARNING, link: `/quality/inspections/${e.inspectionId}`, entityType: 'QualityInspection', entityId: e.inspectionId, dedupeKey: `insp:${e.inspectionId}`, recipients: e.inspectorId ? { userIds: [e.inspectorId] } : { permissions: ['quality.inspect'] } }),
    );
  }

  @OnEvent('sales.order_created', { async: true, promisify: true })
  async onSalesOrder(e: { salesOrderId: string; number: string; customer: string; total: number }) {
    await this.safe(() =>
      this.notify({ type: 'sales.order_created', title: `New sales order ${e.number}`, body: `${e.customer} · INR ${e.total.toLocaleString('en-IN')}`, severity: Severity.INFO, link: `/sales/orders/${e.salesOrderId}`, entityType: 'SalesOrder', entityId: e.salesOrderId, recipients: { permissions: ['sales.order.manage', 'production.create'] } }),
    );
  }

  private async safe(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`notification failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
