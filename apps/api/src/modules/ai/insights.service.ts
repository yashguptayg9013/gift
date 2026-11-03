import { Injectable } from '@nestjs/common';
import { Decimal } from '../../common/decimal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';
import { daysBetween, istDay, TZ } from '../reports/dashboard.service';

/**
 * Deterministic business analytics. These are plain, testable computations over
 * source records; the AI copilot calls them as tools and narrates the results.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Inventory anomalies:
   *  - daily outward quantity in the recent window with z-score > threshold vs the baseline window
   *  - adjustments/damage larger than `largeAdjustmentPct` of current on-hand
   *  - negative balances
   *  - wastage above the BOM allowance
   */
  async inventoryAnomalies(opts: { lookbackDays?: number; recentDays?: number; zThreshold?: number; largeAdjustmentPct?: number } = {}) {
    const lookback = opts.lookbackDays ?? 60;
    const recent = opts.recentDays ?? 7;
    const z = opts.zThreshold ?? 3;
    const bigPct = opts.largeAdjustmentPct ?? 0.2;
    const since = new Date(Date.now() - lookback * 86_400_000);
    const recentStart = istDay(new Date(Date.now() - recent * 86_400_000));

    const daily = await this.prisma.$queryRaw<{ itemId: string; day: string; qty: Decimal }[]>`
      SELECT m."itemId", to_char(m."createdAt" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS "day", -SUM(m."quantity") AS "qty"
      FROM "StockMovement" m JOIN "InventoryTransaction" t ON t."id" = m."transactionId"
      WHERE m."bucket" = 'ON_HAND' AND m."quantity" < 0 AND m."createdAt" >= ${since}
        AND t."type" IN ('ISSUE', 'PRODUCTION_CONSUMPTION', 'DAMAGE', 'SALES_DISPATCH')
      GROUP BY 1, 2`;
    const days = daysBetween(since, new Date());
    const baselineDays = days.filter((d) => d < recentStart);
    const items = await this.prisma.item.findMany({ where: { id: { in: [...new Set(daily.map((d) => d.itemId))] } }, select: { id: true, code: true, name: true, uom: { select: { code: true } } } });
    const spikes = [];
    for (const item of items) {
      const series = new Map(daily.filter((d) => d.itemId === item.id).map((d) => [d.day, Number(d.qty)]));
      const base = baselineDays.map((d) => series.get(d) ?? 0);
      if (base.length < 14) continue;
      const mean = base.reduce((a, b) => a + b, 0) / base.length;
      const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
      for (const d of days.filter((x) => x >= recentStart)) {
        const v = series.get(d) ?? 0;
        if (v <= 0) continue;
        const score = sd > 0 ? (v - mean) / sd : v > mean * 3 && mean > 0 ? Infinity : 0;
        if (score > z) spikes.push({ item: { id: item.id, code: item.code, name: item.name, uom: item.uom.code }, day: d, outward: v, baselineMean: round(mean), baselineStdDev: round(sd), zScore: Number.isFinite(score) ? round(score) : null });
      }
    }

    const stock = await this.inventory.stockSummary({});
    const adjustments = await this.prisma.stockMovement.findMany({
      where: { createdAt: { gte: since }, bucket: 'ON_HAND', transaction: { type: { in: ['ADJUSTMENT', 'DAMAGE', 'RECONCILIATION'] } } },
      include: { transaction: { select: { id: true, number: true, type: true, reason: true, postedAt: true } }, item: { select: { code: true, name: true } } },
    });
    const largeAdjustments = adjustments
      .filter((m) => {
        const onHand = stock.find((s) => s.id === m.itemId)?.onHand ?? 0;
        const before = Math.abs(Number(m.onHandAfter) - Number(m.quantity));
        const ref = Math.max(onHand, before, 1e-9);
        return Math.abs(Number(m.quantity)) / ref >= bigPct;
      })
      .map((m) => ({ transaction: m.transaction, item: m.item, quantity: Number(m.quantity), onHandAfter: Number(m.onHandAfter) }));

    const wastage = (await this.reports.wastage({ from: since, to: new Date() })).filter((w) => w.overAllowance > 0);
    return {
      method: `Outward spikes: daily outward quantity in the last ${recent} days with z-score > ${z} against the previous ${lookback - recent} days. Large adjustments: adjustment/damage/count lines ≥ ${bigPct * 100}% of stock.`,
      consumptionSpikes: spikes.sort((a, b) => (b.zScore ?? 999) - (a.zScore ?? 999)).slice(0, 50),
      largeAdjustments: largeAdjustments.slice(0, 50),
      negativeBalances: stock.filter((s) => s.onHand < 0).map((s) => ({ id: s.id, code: s.code, name: s.name, onHand: s.onHand, uom: s.uom })),
      wastageOverAllowance: wastage.slice(0, 50),
    };
  }

  /** Stage-level queue (units waiting), throughput (last N days) and pause signals for active orders. */
  async productionBottlenecks(throughputDays = 7) {
    const since = new Date(Date.now() - throughputDays * 86_400_000);
    const [pending, throughput, paused] = await Promise.all([
      this.reports.pendingWork(),
      this.prisma.$queryRaw<{ stage: string; good: Decimal; entries: bigint }[]>`
        SELECT sd."name" AS "stage", SUM(o."qtyGood") AS "good", COUNT(*) AS "entries"
        FROM "ProductionOutput" o JOIN "ProductionOrderStage" s ON s."id" = o."stageId" JOIN "StageDefinition" sd ON sd."id" = s."stageDefinitionId"
        WHERE o."reversedAt" IS NULL AND o."recordedAt" >= ${since} GROUP BY sd."name"`,
      this.prisma.productionOrderStage.findMany({
        where: { status: 'PAUSED', productionOrder: { status: { in: ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'] } } },
        include: { stageDefinition: { select: { name: true } }, productionOrder: { select: { number: true } } },
      }),
    ]);
    const byStage = new Map<string, { stage: string; openOrders: number; queuedUnits: number; remainingUnits: number }>();
    for (const p of pending) {
      const cur = byStage.get(p.stage) ?? { stage: p.stage, openOrders: 0, queuedUnits: 0, remainingUnits: 0 };
      cur.openOrders++;
      cur.queuedUnits += Math.max(0, p.input - p.processed);
      cur.remainingUnits += p.remaining;
      byStage.set(p.stage, cur);
    }
    const stages = [...byStage.values()].map((s) => {
      const t = throughput.find((x) => x.stage === s.stage);
      const perDay = t ? Number(t.good) / throughputDays : 0;
      return {
        ...s,
        throughputPerDay: round(perDay),
        daysOfWork: perDay > 0 ? round(s.remainingUnits / perDay) : null,
        pausedStages: paused.filter((p) => p.stageDefinition.name === s.stage).map((p) => p.productionOrder.number),
      };
    });
    stages.sort((a, b) => (b.daysOfWork ?? (b.remainingUnits > 0 ? 9999 : 0)) - (a.daysOfWork ?? (a.remainingUnits > 0 ? 9999 : 0)));
    return {
      method: `Queue = units released by the previous stage but not yet processed. Days of work = remaining units ÷ average good output per day over the last ${throughputDays} days. Stages with work but no recent output rank highest.`,
      likelyBottleneck: stages[0]?.remainingUnits ? stages[0].stage : null,
      stages,
    };
  }

  async delayedOrders() {
    const now = new Date();
    const rows = await this.prisma.productionOrder.findMany({
      where: { dueDate: { lt: now }, status: { in: ['DRAFT', 'RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'] } },
      include: { item: { select: { code: true, name: true } }, stages: { select: { status: true, stageDefinition: { select: { name: true } } }, orderBy: { sequence: 'asc' } } },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });
    return rows.map((o) => ({
      id: o.id,
      number: o.number,
      sku: o.item.code,
      product: o.item.name,
      status: o.status,
      priority: o.priority,
      dueDate: o.dueDate,
      daysLate: Math.floor((now.getTime() - o.dueDate!.getTime()) / 86_400_000),
      planned: Number(o.quantityPlanned),
      completed: Number(o.quantityCompleted),
      currentStage: o.stages.find((s) => ['IN_PROGRESS', 'PAUSED'].includes(s.status))?.stageDefinition.name ?? o.stages.find((s) => s.status === 'PENDING')?.stageDefinition.name ?? null,
    }));
  }

  /** Facts for one IST calendar day (defaults to today). */
  async dailySummary(day?: string) {
    const d = day ?? istDay(new Date());
    const start = new Date(`${d}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 86_400_000 - 1);
    const range = { gte: start, lte: end };
    const [txByType, outputs, completed, newProd, salesOrders, challans, grns, inspections, lowStock, delayed, pendingApprovals] = await Promise.all([
      this.prisma.inventoryTransaction.groupBy({ by: ['type'], where: { postedAt: range, type: { notIn: ['RESERVATION', 'RELEASE'] } }, _count: { _all: true } }),
      this.prisma.productionOutput.aggregate({ where: { recordedAt: range, reversedAt: null }, _sum: { qtyGood: true, qtyRejected: true, qtyRework: true }, _count: { _all: true } }),
      this.prisma.productionOrder.findMany({ where: { completedAt: range }, select: { number: true, quantityCompleted: true, item: { select: { code: true } } } }),
      this.prisma.productionOrder.count({ where: { createdAt: range } }),
      this.prisma.salesOrder.aggregate({ where: { orderDate: range, status: { notIn: ['DRAFT', 'CANCELLED'] } }, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.deliveryChallan.count({ where: { postedAt: range, status: 'POSTED' } }),
      this.prisma.goodsReceipt.count({ where: { receivedAt: range } }),
      this.prisma.qualityInspection.aggregate({ where: { completedAt: range, status: 'COMPLETED' }, _sum: { quantityAccepted: true, quantityRejected: true }, _count: { _all: true } }),
      this.inventory.stockSummary({ lowStockOnly: true }),
      this.delayedOrders(),
      this.prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      date: d,
      inventoryTransactions: Object.fromEntries(txByType.map((t) => [t.type, t._count._all])),
      production: {
        entries: outputs._count._all,
        good: Number(outputs._sum.qtyGood ?? 0),
        rejected: Number(outputs._sum.qtyRejected ?? 0),
        rework: Number(outputs._sum.qtyRework ?? 0),
        ordersCompleted: completed.map((c) => ({ number: c.number, sku: c.item.code, quantity: Number(c.quantityCompleted) })),
        ordersCreated: newProd,
      },
      sales: { ordersConfirmed: salesOrders._count._all, orderValue: Number(salesOrders._sum.total ?? 0), challansPosted: challans },
      procurement: { goodsReceipts: grns },
      quality: { inspections: inspections._count._all, accepted: Number(inspections._sum.quantityAccepted ?? 0), rejected: Number(inspections._sum.quantityRejected ?? 0) },
      attention: {
        lowStockItems: lowStock.slice(0, 20).map((s) => ({ code: s.code, name: s.name, available: s.available, reorderLevel: s.reorderLevel, uom: s.uom })),
        lowStockCount: lowStock.length,
        delayedOrders: delayed.slice(0, 20),
        delayedCount: delayed.length,
        pendingApprovals,
      },
    };
  }

  /** Plain-language summary without AI (used when the copilot is not configured). */
  templateSummary(s: Awaited<ReturnType<InsightsService['dailySummary']>>) {
    const lines = [
      `Business summary for ${s.date}`,
      `Production: ${s.production.good} good, ${s.production.rejected} rejected across ${s.production.entries} entries; ${s.production.ordersCompleted.length} order(s) completed, ${s.production.ordersCreated} created.`,
      `Sales: ${s.sales.ordersConfirmed} order(s) worth INR ${s.sales.orderValue.toLocaleString('en-IN')}; ${s.sales.challansPosted} challan(s) dispatched.`,
      `Procurement: ${s.procurement.goodsReceipts} goods receipt(s). Quality: ${s.quality.inspections} inspection(s), ${s.quality.rejected} rejected.`,
      `Attention: ${s.attention.lowStockCount} low-stock item(s), ${s.attention.delayedCount} delayed production order(s), ${s.attention.pendingApprovals} pending approval(s).`,
    ];
    return lines.join('\n');
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
