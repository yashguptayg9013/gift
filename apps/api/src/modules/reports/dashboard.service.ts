import { Injectable } from '@nestjs/common';
import { ItemType, Prisma, ProductionStatus, PurchaseOrderStatus, SalesOrderStatus } from '@prisma/client';
import { D, Decimal, ZERO } from '../../common/decimal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

export const TZ = 'Asia/Kolkata';

/** YYYY-MM-DD in IST for a Date. */
export function istDay(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function daysBetween(from: Date, to: Date) {
  const out: string[] = [];
  const end = istDay(to);
  for (let t = from.getTime(); ; t += 86_400_000) {
    const day = istDay(new Date(t));
    if (!out.includes(day)) out.push(day);
    if (day >= end || out.length > 400) break;
  }
  return out;
}

const RECEIPT_TYPES = ['RECEIPT', 'PURCHASE_RECEIPT', 'RETURN', 'PRODUCTION_RETURN'];
const ISSUE_TYPES = ['ISSUE', 'DAMAGE', 'PURCHASE_RETURN', 'ADJUSTMENT', 'RECONCILIATION', 'TRANSFER', 'QC_DISPOSITION'];
const PRODUCTION_TYPES = ['PRODUCTION_CONSUMPTION', 'PRODUCTION_OUTPUT'];

/** Executive dashboard. Every figure is a query over source records — nothing is hard-coded. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async get(from: Date, to: Date) {
    const now = new Date();
    const [materials, products] = await Promise.all([this.inventory.stockSummary({ type: ItemType.MATERIAL }), this.inventory.stockSummary({ type: ItemType.PRODUCT })]);

    // Raw materials
    const byCat = new Map<string, { categoryId: string | null; name: string; skuCount: number; q: Map<string, Decimal> }>();
    let valueEstimate = ZERO;
    let valuedSkuCount = 0;
    for (const m of materials) {
      const key = m.category?.id ?? 'none';
      const cur = byCat.get(key) ?? { categoryId: m.category?.id ?? null, name: m.category?.name ?? 'Uncategorised', skuCount: 0, q: new Map() };
      cur.skuCount++;
      cur.q.set(m.uom, (cur.q.get(m.uom) ?? ZERO).plus(m.usableOnHand));
      byCat.set(key, cur);
      const price = m.lastPurchasePrice ?? m.standardCost;
      if (price !== null && m.usableOnHand > 0) {
        valueEstimate = valueEstimate.plus(D(m.usableOnHand).mul(price));
        valuedSkuCount++;
      }
    }

    const [prodCounts, completedInRange, delayed, pendingSales, salesInRange, openPos, overduePos, pendingPoApproval] = await Promise.all([
      this.prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.productionOrder.count({ where: { completedAt: { gte: from, lte: to } } }),
      this.prisma.productionOrder.count({ where: { dueDate: { lt: now }, status: { in: [ProductionStatus.DRAFT, ProductionStatus.RELEASED, ProductionStatus.MATERIALS_RESERVED, ProductionStatus.IN_PROGRESS] } } }),
      this.prisma.salesOrder.count({ where: { status: { in: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_FULFILLED] } } }),
      this.prisma.salesOrder.count({ where: { orderDate: { gte: from, lte: to }, status: { notIn: [SalesOrderStatus.DRAFT, SalesOrderStatus.CANCELLED] } } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED] } } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED] }, expectedDate: { lt: now } } }),
      this.prisma.purchaseOrder.count({ where: { status: PurchaseOrderStatus.PENDING_APPROVAL } }),
    ]);
    const countOf = (...s: ProductionStatus[]) => prodCounts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count._all, 0);

    const days = daysBetween(from, to);
    const [perf, moves, monthly, recent] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; completed: Decimal; rejected: Decimal }[]>`
        SELECT to_char(o."recordedAt" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS "day", SUM(o."qtyGood") AS "completed", SUM(o."qtyRejected") AS "rejected"
        FROM "ProductionOutput" o JOIN "ProductionOrderStage" s ON s."id" = o."stageId"
        WHERE o."reversedAt" IS NULL AND o."recordedAt" BETWEEN ${from} AND ${to}
          AND s."sequence" = (SELECT MAX(s2."sequence") FROM "ProductionOrderStage" s2 WHERE s2."productionOrderId" = s."productionOrderId" AND s2."status" NOT IN ('SKIPPED', 'CANCELLED'))
        GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; type: string; n: bigint }[]>`
        SELECT to_char("postedAt" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS "day", "type"::text AS "type", COUNT(*) AS "n"
        FROM "InventoryTransaction" WHERE "postedAt" BETWEEN ${from} AND ${to} AND "type" NOT IN ('RESERVATION', 'RELEASE')
        GROUP BY 1, 2`,
      this.monthlyActivity(),
      this.prisma.inventoryTransaction.findMany({ orderBy: { postedAt: 'desc' }, take: 10, include: { _count: { select: { movements: true } } } }),
    ]);

    const lowStock = [...materials, ...products]
      .filter((i) => i.stockStatus !== 'OK' && (i.reorderLevel > 0 || i.minStock > 0))
      .sort((a, b) => a.available - a.reorderLevel - (b.available - b.reorderLevel))
      .slice(0, 10)
      .map((i) => ({ id: i.id, code: i.code, name: i.name, available: i.available, reorderLevel: i.reorderLevel, uom: i.uom }));

    return {
      range: { from, to },
      rawMaterials: {
        skuCount: materials.length,
        inStockSkuCount: materials.filter((m) => m.usableOnHand > 0).length,
        lowStockCount: materials.filter((m) => m.stockStatus !== 'OK' && (m.reorderLevel > 0 || m.minStock > 0)).length,
        valueEstimate: Number(valueEstimate.toDecimalPlaces(2)),
        valuedSkuCount,
        valueBasis: 'Usable on-hand × last purchase price (or standard cost) where available',
        byCategory: [...byCat.values()].map((c) => ({ categoryId: c.categoryId, name: c.name, skuCount: c.skuCount, quantities: [...c.q.entries()].map(([uom, q]) => ({ uom, onHand: Number(q) })) })),
      },
      finishedGoods: {
        skuCount: products.length,
        units: products.reduce((s, p) => s + p.usableOnHand, 0),
        available: products.reduce((s, p) => s + p.available, 0),
        reserved: products.reduce((s, p) => s + p.reserved, 0),
        nonSaleable: products.reduce((s, p) => s + p.nonUsable, 0),
      },
      production: {
        active: countOf(ProductionStatus.IN_PROGRESS),
        pending: countOf(ProductionStatus.DRAFT, ProductionStatus.RELEASED, ProductionStatus.MATERIALS_RESERVED),
        completedInRange,
        delayed,
      },
      sales: { pendingOrders: pendingSales, ordersInRange: salesInRange },
      procurement: { openOrders: openPos, overdueOrders: overduePos, pendingApproval: pendingPoApproval },
      productionPerformance: days.map((d) => {
        const r = perf.find((p) => p.day === d);
        return { date: d, completed: Number(r?.completed ?? 0), rejected: Number(r?.rejected ?? 0) };
      }),
      inventoryMovement: days.map((d) => {
        const sumOf = (types: string[]) => moves.filter((m) => m.day === d && types.includes(m.type)).reduce((s, m) => s + Number(m.n), 0);
        return { date: d, receipts: sumOf(RECEIPT_TYPES), issues: sumOf(ISSUE_TYPES), production: sumOf(PRODUCTION_TYPES), sales: sumOf(['SALES_DISPATCH']) };
      }),
      monthlyActivity: monthly,
      recentTransactions: recent.map((t) => ({ id: t.id, number: t.number, type: t.type, postedAt: t.postedAt, referenceNumber: t.referenceNumber, reason: t.reason, lineCount: t._count.movements })),
      lowStock,
    };
  }

  private async monthlyActivity() {
    const since = new Date();
    since.setMonth(since.getMonth() - 11, 1);
    since.setHours(0, 0, 0, 0);
    const q = (table: Prisma.Sql, col: Prisma.Sql, extra: Prisma.Sql = Prisma.empty) =>
      this.prisma.$queryRaw<{ month: string; n: bigint }[]>`
        SELECT to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM') AS "month", COUNT(*) AS "n" FROM ${table}
        WHERE ${col} >= ${since} ${extra} GROUP BY 1`;
    const [po, so, pu, it] = await Promise.all([
      q(Prisma.sql`"ProductionOrder"`, Prisma.sql`"createdAt"`),
      q(Prisma.sql`"SalesOrder"`, Prisma.sql`"orderDate"`, Prisma.sql`AND "status" <> 'CANCELLED'`),
      q(Prisma.sql`"PurchaseOrder"`, Prisma.sql`"orderDate"`, Prisma.sql`AND "status" <> 'CANCELLED'`),
      q(Prisma.sql`"InventoryTransaction"`, Prisma.sql`"postedAt"`, Prisma.sql`AND "type" NOT IN ('RESERVATION', 'RELEASE')`),
    ]);
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const v = (rows: { month: string; n: bigint }[], m: string) => Number(rows.find((r) => r.month === m)?.n ?? 0);
    return months.map((m) => ({ month: m, productionOrders: v(po, m), salesOrders: v(so, m), purchaseOrders: v(pu, m), inventoryTransactions: v(it, m) }));
  }
}
