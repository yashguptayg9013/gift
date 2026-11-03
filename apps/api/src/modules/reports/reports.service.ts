import { Injectable } from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { D, Decimal, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PdfService } from '../../infra/pdf/pdf.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProcurementService } from '../procurement/procurement.service';
import { SettingsService } from '../settings/settings.service';
import { TZ } from './dashboard.service';

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';
export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}
export interface ReportParams {
  from?: Date;
  to?: Date;
  itemId?: string;
  categoryId?: string;
  itemType?: ItemType;
  supplierId?: string;
  customerId?: string;
  limit?: number;
}
/** Every row carries a `source` describing the records it was computed from. */
export interface ReportRow {
  [k: string]: unknown;
  source?: { type: string; ids?: string[]; filter?: Record<string, unknown>; href?: string };
}
export interface ReportResult {
  key: string;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  params: ReportParams;
  generatedAt: Date;
}
interface ReportDef {
  key: string;
  title: string;
  group: 'inventory' | 'manufacturing' | 'sales' | 'procurement';
  description: string;
  permission: string;
  params: (keyof ReportParams)[];
  columns: ReportColumn[];
  run: (p: Required<Pick<ReportParams, 'from' | 'to'>> & ReportParams) => Promise<ReportRow[]>;
}

const n = (v: Decimal | number | bigint | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

@Injectable()
export class ReportsService {
  private readonly defs: ReportDef[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly procurement: ProcurementService,
    private readonly settings: SettingsService,
    private readonly pdf: PdfService,
  ) {
    this.defs = this.define();
  }

  catalog(user: AuthUser) {
    return this.defs
      .filter((d) => hasPermission(user, d.permission))
      .map(({ key, title, group, description, params, columns }) => ({ key, title, group, description, params, columns }));
  }

  async run(key: string, params: ReportParams, user: AuthUser): Promise<ReportResult> {
    const def = this.defs.find((d) => d.key === key);
    if (!def) throw Errors.notFound('Report', key);
    if (!hasPermission(user, def.permission)) throw Errors.forbidden(`Missing permission: ${def.permission}`);
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(to.getTime() - 30 * 86_400_000);
    if (from > to) throw Errors.validation('"from" must be before "to"');
    const rows = await def.run({ ...params, from, to });
    return { key, title: def.title, description: def.description, columns: def.columns, rows, params: { ...params, from, to }, generatedAt: new Date() };
  }

  // ─── Exports ────────────────────────────────────────

  toCsv(r: ReportResult): Buffer {
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      // neutralise spreadsheet formula injection
      const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [r.columns.map((c) => esc(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(','))];
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  async toXlsx(r: ReportResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PUJA OS';
    const ws = wb.addWorksheet(r.title.slice(0, 31));
    ws.addRow([r.title]).font = { bold: true, size: 13 };
    ws.addRow([`Period: ${r.params.from?.toISOString().slice(0, 10)} to ${r.params.to?.toISOString().slice(0, 10)} · Generated ${r.generatedAt.toISOString()}`]).font = { color: { argb: 'FF6B7280' }, size: 9 };
    ws.addRow([]);
    const header = ws.addRow(r.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }));
    for (const row of r.rows) {
      ws.addRow(r.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return null;
        if (c.type === 'date') return v instanceof Date ? v : new Date(String(v));
        if (c.type === 'number' || c.type === 'money' || c.type === 'percent') return Number(v);
        return String(v);
      }));
    }
    r.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(48, Math.max(12, c.label.length + 4));
      if (c.type === 'money') col.numFmt = '#,##,##0.00';
      if (c.type === 'percent') col.numFmt = '0.0%';
      if (c.type === 'date') col.numFmt = 'dd-mmm-yyyy';
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async toPdf(r: ReportResult): Promise<Buffer> {
    const c = await this.settings.get('company');
    const fmt = (v: unknown, t?: ColumnType) => {
      if (v === null || v === undefined) return '';
      if (t === 'money') return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (t === 'number') return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
      if (t === 'percent') return `${(Number(v) * 100).toFixed(1)}%`;
      if (t === 'date') return new Date(String(v)).toLocaleDateString('en-IN', { timeZone: TZ });
      return String(v);
    };
    return this.pdf.render({
      title: r.title,
      company: { name: c.tradeName || c.legalName, lines: [r.description] },
      meta: [
        ['From', r.params.from ? r.params.from.toISOString().slice(0, 10) : '—'],
        ['To', r.params.to ? r.params.to.toISOString().slice(0, 10) : '—'],
        ['Rows', String(r.rows.length)],
      ],
      columns: r.columns.map((col) => ({ key: col.key, label: col.label, width: col.type === 'text' || !col.type ? 3 : 2, align: col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left' })),
      rows: r.rows.slice(0, 2000).map((row) => Object.fromEntries(r.columns.map((col) => [col.key, fmt(row[col.key], col.type)]))),
      landscape: r.columns.length > 6,
      footer: `PUJA OS report "${r.key}" · generated ${r.generatedAt.toISOString()} · figures are computed from ledger and document records`,
    });
  }

  // ─── Report definitions ─────────────────────────────

  private define(): ReportDef[] {
    const p = this.prisma;
    return [
      // Inventory
      {
        key: 'current-stock',
        title: 'Current stock',
        group: 'inventory',
        description: 'On hand, reserved and available stock per item with estimated value.',
        permission: 'reports.inventory',
        params: ['itemType', 'categoryId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
          { key: 'uom', label: 'Unit' },
          { key: 'onHand', label: 'On hand', type: 'number' },
          { key: 'reserved', label: 'Reserved', type: 'number' },
          { key: 'available', label: 'Available', type: 'number' },
          { key: 'nonUsable', label: 'Non-usable (QC/rejected/WIP)', type: 'number' },
          { key: 'unitCost', label: 'Unit cost', type: 'money' },
          { key: 'value', label: 'Value (usable)', type: 'money' },
          { key: 'status', label: 'Status' },
        ],
        run: async (q) =>
          (await this.inventory.stockSummary({ type: q.itemType, categoryId: q.categoryId })).map((i) => {
            const cost = i.lastPurchasePrice ?? i.standardCost;
            return {
              code: i.code,
              name: i.name,
              category: i.category?.name ?? '',
              uom: i.uom,
              onHand: i.onHand,
              reserved: i.reserved,
              available: i.available,
              nonUsable: i.nonUsable,
              unitCost: cost,
              value: cost !== null ? Math.round(i.usableOnHand * cost * 100) / 100 : null,
              status: i.stockStatus,
              source: { type: 'StockBalance', filter: { itemId: i.id }, href: `/inventory/materials/${i.id}` },
            };
          }),
      },
      {
        key: 'low-stock',
        title: 'Low stock',
        group: 'inventory',
        description: 'Items at or below reorder level / minimum stock.',
        permission: 'reports.inventory',
        params: ['itemType', 'categoryId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'uom', label: 'Unit' },
          { key: 'available', label: 'Available', type: 'number' },
          { key: 'minStock', label: 'Minimum', type: 'number' },
          { key: 'reorderLevel', label: 'Reorder level', type: 'number' },
          { key: 'reorderQty', label: 'Reorder qty', type: 'number' },
          { key: 'status', label: 'Status' },
        ],
        run: async (q) =>
          (await this.inventory.stockSummary({ type: q.itemType, categoryId: q.categoryId, lowStockOnly: true })).map((i) => ({
            code: i.code,
            name: i.name,
            uom: i.uom,
            available: i.available,
            minStock: i.minStock,
            reorderLevel: i.reorderLevel,
            reorderQty: i.reorderQty,
            status: i.stockStatus,
            source: { type: 'StockBalance', filter: { itemId: i.id } },
          })),
      },
      {
        key: 'stock-movement',
        title: 'Stock movement',
        group: 'inventory',
        description: 'Opening, inward, outward and closing on-hand quantity per item from the ledger.',
        permission: 'reports.inventory',
        params: ['from', 'to', 'itemType', 'categoryId', 'itemId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'uom', label: 'Unit' },
          { key: 'opening', label: 'Opening', type: 'number' },
          { key: 'inward', label: 'Inward', type: 'number' },
          { key: 'outward', label: 'Outward', type: 'number' },
          { key: 'closing', label: 'Closing', type: 'number' },
          { key: 'movements', label: 'Ledger lines', type: 'number' },
        ],
        run: async (q) => {
          const rows = await p.$queryRaw<{ itemId: string; code: string; name: string; uom: string; opening: Decimal; inward: Decimal; outward: Decimal; lines: bigint }[]>`
            SELECT i."id" AS "itemId", i."code", i."name", u."code" AS "uom",
                   COALESCE(SUM(CASE WHEN m."createdAt" < ${q.from} THEN m."quantity" END), 0) AS "opening",
                   COALESCE(SUM(CASE WHEN m."createdAt" BETWEEN ${q.from} AND ${q.to} AND m."quantity" > 0 THEN m."quantity" END), 0) AS "inward",
                   COALESCE(-SUM(CASE WHEN m."createdAt" BETWEEN ${q.from} AND ${q.to} AND m."quantity" < 0 THEN m."quantity" END), 0) AS "outward",
                   COUNT(CASE WHEN m."createdAt" BETWEEN ${q.from} AND ${q.to} THEN 1 END) AS "lines"
            FROM "Item" i JOIN "Uom" u ON u."id" = i."uomId"
            LEFT JOIN "StockMovement" m ON m."itemId" = i."id" AND m."bucket" = 'ON_HAND' AND m."createdAt" <= ${q.to}
            WHERE i."isActive" = true
              ${q.itemType ? Prisma.sql`AND i."type" = ${q.itemType}::"ItemType"` : Prisma.empty}
              ${q.categoryId ? Prisma.sql`AND i."categoryId" = ${q.categoryId}` : Prisma.empty}
              ${q.itemId ? Prisma.sql`AND i."id" = ${q.itemId}` : Prisma.empty}
            GROUP BY i."id", i."code", i."name", u."code" ORDER BY i."code"`;
          return rows
            .filter((r) => n(r.lines) > 0 || n(r.opening) !== 0)
            .map((r) => ({
              code: r.code,
              name: r.name,
              uom: r.uom,
              opening: n(r.opening),
              inward: n(r.inward),
              outward: n(r.outward),
              closing: n(D(r.opening).plus(r.inward).minus(r.outward)),
              movements: n(r.lines),
              source: { type: 'StockMovement', filter: { itemId: r.itemId, from: q.from, to: q.to } },
            }));
        },
      },
      {
        key: 'material-consumption',
        title: 'Material consumption',
        group: 'inventory',
        description: 'Net consumption by production, issues and damage (returns and reversals netted off).',
        permission: 'reports.inventory',
        params: ['from', 'to', 'categoryId', 'itemId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Material' },
          { key: 'category', label: 'Category' },
          { key: 'uom', label: 'Unit' },
          { key: 'production', label: 'Production', type: 'number' },
          { key: 'issues', label: 'Issues', type: 'number' },
          { key: 'damage', label: 'Damaged', type: 'number' },
          { key: 'total', label: 'Net consumed', type: 'number' },
          { key: 'value', label: 'Value', type: 'money' },
        ],
        run: (q) => this.consumption(q),
      },
      {
        key: 'stock-ageing',
        title: 'Stock ageing',
        group: 'inventory',
        description: 'Age of on-hand stock using FIFO receipt layers (or batch receipt dates).',
        permission: 'reports.inventory',
        params: ['itemType', 'categoryId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'uom', label: 'Unit' },
          { key: 'onHand', label: 'On hand', type: 'number' },
          { key: 'd0_30', label: '0–30 days', type: 'number' },
          { key: 'd31_60', label: '31–60 days', type: 'number' },
          { key: 'd61_90', label: '61–90 days', type: 'number' },
          { key: 'd90', label: '> 90 days', type: 'number' },
          { key: 'oldestDays', label: 'Oldest (days)', type: 'number' },
        ],
        run: (q) => this.ageing(q),
      },
      {
        key: 'dead-stock',
        title: 'Dead stock',
        group: 'inventory',
        description: 'Items with stock on hand and no outward movement in the configured period.',
        permission: 'reports.inventory',
        params: ['itemType', 'categoryId'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'uom', label: 'Unit' },
          { key: 'onHand', label: 'On hand', type: 'number' },
          { key: 'lastOutward', label: 'Last outward', type: 'date' },
          { key: 'daysIdle', label: 'Days idle', type: 'number' },
          { key: 'value', label: 'Value', type: 'money' },
        ],
        run: async (q) => {
          const { deadStockDays } = await this.settings.get('inventory');
          const cutoff = new Date(Date.now() - deadStockDays * 86_400_000);
          const stock = (await this.inventory.stockSummary({ type: q.itemType, categoryId: q.categoryId })).filter((s) => s.onHand > 0);
          const last = await p.$queryRaw<{ itemId: string; last: Date }[]>`
            SELECT "itemId", MAX("createdAt") AS "last" FROM "StockMovement" WHERE "bucket" = 'ON_HAND' AND "quantity" < 0 GROUP BY "itemId"`;
          return stock
            .map((s) => ({ s, last: last.find((l) => l.itemId === s.id)?.last ?? null }))
            .filter(({ last: l }) => !l || l < cutoff)
            .map(({ s, last: l }) => {
              const cost = s.lastPurchasePrice ?? s.standardCost;
              return {
                code: s.code,
                name: s.name,
                uom: s.uom,
                onHand: s.onHand,
                lastOutward: l,
                daysIdle: l ? Math.floor((Date.now() - l.getTime()) / 86_400_000) : null,
                value: cost !== null ? Math.round(s.onHand * cost * 100) / 100 : null,
                source: { type: 'StockMovement', filter: { itemId: s.id } },
              };
            });
        },
      },
      // Manufacturing
      {
        key: 'production-output',
        title: 'Production output',
        group: 'manufacturing',
        description: 'Finished output per SKU at the final stage (non-reversed entries).',
        permission: 'reports.manufacturing',
        params: ['from', 'to', 'itemId'],
        columns: [
          { key: 'code', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'good', label: 'Good', type: 'number' },
          { key: 'rejected', label: 'Rejected', type: 'number' },
          { key: 'rework', label: 'Rework', type: 'number' },
          { key: 'rejectionRate', label: 'Rejection rate', type: 'percent' },
        ],
        run: async (q) => {
          const rows = await p.$queryRaw<{ itemId: string; code: string; name: string; orders: bigint; good: Decimal; rejected: Decimal; rework: Decimal; ids: string[] }[]>`
            SELECT i."id" AS "itemId", i."code", i."name", COUNT(DISTINCT o."productionOrderId") AS "orders",
                   SUM(o."qtyGood") AS "good", SUM(o."qtyRejected") AS "rejected", SUM(o."qtyRework") AS "rework", ARRAY_AGG(o."id") AS "ids"
            FROM "ProductionOutput" o
            JOIN "ProductionOrderStage" s ON s."id" = o."stageId"
            JOIN "ProductionOrder" po ON po."id" = o."productionOrderId"
            JOIN "Item" i ON i."id" = po."itemId"
            WHERE o."reversedAt" IS NULL AND o."recordedAt" BETWEEN ${q.from} AND ${q.to}
              AND s."sequence" = (SELECT MAX(s2."sequence") FROM "ProductionOrderStage" s2 WHERE s2."productionOrderId" = s."productionOrderId" AND s2."status" NOT IN ('SKIPPED','CANCELLED'))
              ${q.itemId ? Prisma.sql`AND i."id" = ${q.itemId}` : Prisma.empty}
            GROUP BY i."id", i."code", i."name" ORDER BY SUM(o."qtyGood") DESC`;
          return rows.map((r) => {
            const processed = n(r.good) + n(r.rejected);
            return { code: r.code, name: r.name, orders: n(r.orders), good: n(r.good), rejected: n(r.rejected), rework: n(r.rework), rejectionRate: processed ? n(r.rejected) / processed : null, source: { type: 'ProductionOutput', ids: r.ids } };
          });
        },
      },
      {
        key: 'stage-wise',
        title: 'Stage-wise production',
        group: 'manufacturing',
        description: 'Output, rejection and rework per manufacturing stage.',
        permission: 'reports.manufacturing',
        params: ['from', 'to'],
        columns: [
          { key: 'stage', label: 'Stage' },
          { key: 'entries', label: 'Entries', type: 'number' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'good', label: 'Good', type: 'number' },
          { key: 'rejected', label: 'Rejected', type: 'number' },
          { key: 'rework', label: 'Rework', type: 'number' },
          { key: 'rejectionRate', label: 'Rejection rate', type: 'percent' },
        ],
        run: async (q) => {
          const rows = await p.$queryRaw<{ stage: string; code: string; entries: bigint; orders: bigint; good: Decimal; rejected: Decimal; rework: Decimal }[]>`
            SELECT sd."name" AS "stage", sd."code", COUNT(*) AS "entries", COUNT(DISTINCT o."productionOrderId") AS "orders",
                   SUM(o."qtyGood") AS "good", SUM(o."qtyRejected") AS "rejected", SUM(o."qtyRework") AS "rework"
            FROM "ProductionOutput" o JOIN "ProductionOrderStage" s ON s."id" = o."stageId" JOIN "StageDefinition" sd ON sd."id" = s."stageDefinitionId"
            WHERE o."reversedAt" IS NULL AND o."recordedAt" BETWEEN ${q.from} AND ${q.to}
            GROUP BY sd."id", sd."name", sd."code", sd."defaultSequence" ORDER BY sd."defaultSequence"`;
          return rows.map((r) => {
            const processed = n(r.good) + n(r.rejected);
            return { stage: r.stage, entries: n(r.entries), orders: n(r.orders), good: n(r.good), rejected: n(r.rejected), rework: n(r.rework), rejectionRate: processed ? n(r.rejected) / processed : null, source: { type: 'ProductionOutput', filter: { stage: r.code, from: q.from, to: q.to } } };
          });
        },
      },
      {
        key: 'pending-work',
        title: 'Pending production work',
        group: 'manufacturing',
        description: 'Open stages of active orders with remaining quantity to process.',
        permission: 'reports.manufacturing',
        params: [],
        columns: [
          { key: 'order', label: 'Order' },
          { key: 'sku', label: 'SKU' },
          { key: 'stage', label: 'Stage' },
          { key: 'status', label: 'Status' },
          { key: 'input', label: 'Input available', type: 'number' },
          { key: 'processed', label: 'Processed', type: 'number' },
          { key: 'remaining', label: 'Remaining', type: 'number' },
          { key: 'dueDate', label: 'Due', type: 'date' },
          { key: 'workers', label: 'Assigned' },
        ],
        run: () => this.pendingWork(),
      },
      {
        key: 'material-wastage',
        title: 'Material wastage',
        group: 'manufacturing',
        description: 'Reported wastage compared with the BOM wastage allowance per material.',
        permission: 'reports.manufacturing',
        params: ['from', 'to'],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Material' },
          { key: 'uom', label: 'Unit' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'standard', label: 'Standard use', type: 'number' },
          { key: 'allowance', label: 'Allowance', type: 'number' },
          { key: 'wastage', label: 'Reported wastage', type: 'number' },
          { key: 'wastagePct', label: 'Wastage % of standard', type: 'percent' },
          { key: 'overAllowance', label: 'Over allowance', type: 'number' },
        ],
        run: (q) => this.wastage(q),
      },
      // Sales
      {
        key: 'sales-by-month',
        title: 'Sales by month',
        group: 'sales',
        description: 'Confirmed order value and dispatched value per month.',
        permission: 'reports.sales',
        params: ['from', 'to', 'customerId'],
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'orderValue', label: 'Order value (incl. tax)', type: 'money' },
          { key: 'challans', label: 'Challans', type: 'number' },
          { key: 'dispatchedQty', label: 'Units dispatched', type: 'number' },
        ],
        run: async (q) => {
          const [orders, disp] = await Promise.all([
            p.$queryRaw<{ month: string; orders: bigint; value: Decimal }[]>`
              SELECT to_char("orderDate" AT TIME ZONE ${TZ}, 'YYYY-MM') AS "month", COUNT(*) AS "orders", SUM("total") AS "value"
              FROM "SalesOrder" WHERE "status" NOT IN ('DRAFT','CANCELLED') AND "orderDate" BETWEEN ${q.from} AND ${q.to}
              ${q.customerId ? Prisma.sql`AND "customerId" = ${q.customerId}` : Prisma.empty} GROUP BY 1`,
            p.$queryRaw<{ month: string; challans: bigint; qty: Decimal }[]>`
              SELECT to_char(c."postedAt" AT TIME ZONE ${TZ}, 'YYYY-MM') AS "month", COUNT(DISTINCT c."id") AS "challans", SUM(l."quantity") AS "qty"
              FROM "DeliveryChallan" c JOIN "DeliveryChallanLine" l ON l."challanId" = c."id"
              WHERE c."status" = 'POSTED' AND c."postedAt" BETWEEN ${q.from} AND ${q.to}
              ${q.customerId ? Prisma.sql`AND c."customerId" = ${q.customerId}` : Prisma.empty} GROUP BY 1`,
          ]);
          const months = [...new Set([...orders.map((o) => o.month), ...disp.map((d) => d.month)])].sort();
          return months.map((m) => {
            const o = orders.find((x) => x.month === m);
            const d = disp.find((x) => x.month === m);
            return { month: m, orders: n(o?.orders), orderValue: n(o?.value), challans: n(d?.challans), dispatchedQty: n(d?.qty), source: { type: 'SalesOrder', filter: { month: m } } };
          });
        },
      },
      {
        key: 'sales-by-sku',
        title: 'Sales by SKU / top products',
        group: 'sales',
        description: 'Ordered and dispatched quantity and value per SKU, ranked by value.',
        permission: 'reports.sales',
        params: ['from', 'to', 'customerId', 'limit'],
        columns: [
          { key: 'rank', label: '#', type: 'number' },
          { key: 'code', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'orderedQty', label: 'Ordered', type: 'number' },
          { key: 'dispatchedQty', label: 'Dispatched', type: 'number' },
          { key: 'value', label: 'Value (incl. tax)', type: 'money' },
          { key: 'customers', label: 'Customers', type: 'number' },
        ],
        run: async (q) => {
          const rows = await p.$queryRaw<{ itemId: string; code: string; name: string; ordered: Decimal; dispatched: Decimal; value: Decimal; customers: bigint }[]>`
            SELECT i."id" AS "itemId", i."code", i."name", SUM(l."quantity") AS "ordered", SUM(l."quantityFulfilled") AS "dispatched", SUM(l."lineTotal") AS "value", COUNT(DISTINCT so."customerId") AS "customers"
            FROM "SalesOrderLine" l JOIN "SalesOrder" so ON so."id" = l."salesOrderId" JOIN "Item" i ON i."id" = l."itemId"
            WHERE so."status" NOT IN ('DRAFT','CANCELLED') AND so."orderDate" BETWEEN ${q.from} AND ${q.to}
            ${q.customerId ? Prisma.sql`AND so."customerId" = ${q.customerId}` : Prisma.empty}
            GROUP BY i."id", i."code", i."name" ORDER BY SUM(l."lineTotal") DESC LIMIT ${q.limit ?? 500}`;
          return rows.map((r, i) => ({ rank: i + 1, code: r.code, name: r.name, orderedQty: n(r.ordered), dispatchedQty: n(r.dispatched), value: n(r.value), customers: n(r.customers), source: { type: 'SalesOrderLine', filter: { itemId: r.itemId } } }));
        },
      },
      {
        key: 'customer-performance',
        title: 'Customer performance',
        group: 'sales',
        description: 'Orders, value and fulfilment per customer.',
        permission: 'reports.sales',
        params: ['from', 'to'],
        columns: [
          { key: 'customer', label: 'Customer' },
          { key: 'category', label: 'Category' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'value', label: 'Order value', type: 'money' },
          { key: 'fulfilment', label: 'Fulfilment', type: 'percent' },
          { key: 'lastOrder', label: 'Last order', type: 'date' },
        ],
        run: async (q) => {
          const rows = await p.$queryRaw<{ customerId: string; name: string; category: string | null; orders: bigint; value: Decimal; qty: Decimal; done: Decimal; last: Date }[]>`
            SELECT c."id" AS "customerId", c."companyName" AS "name", cc."name" AS "category", COUNT(DISTINCT so."id") AS "orders", SUM(DISTINCT so."total") AS "value",
                   SUM(l."quantity") AS "qty", SUM(l."quantityFulfilled") AS "done", MAX(so."orderDate") AS "last"
            FROM "SalesOrder" so JOIN "Customer" c ON c."id" = so."customerId" LEFT JOIN "CustomerCategory" cc ON cc."id" = c."categoryId"
            JOIN "SalesOrderLine" l ON l."salesOrderId" = so."id"
            WHERE so."status" NOT IN ('DRAFT','CANCELLED') AND so."orderDate" BETWEEN ${q.from} AND ${q.to}
            GROUP BY c."id", c."companyName", cc."name" ORDER BY SUM(l."lineTotal") DESC`;
          const values = await p.salesOrder.groupBy({ by: ['customerId'], where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, orderDate: { gte: q.from, lte: q.to } }, _sum: { total: true } });
          return rows.map((r) => ({
            customer: r.name,
            category: r.category ?? '',
            orders: n(r.orders),
            value: n(values.find((v) => v.customerId === r.customerId)?._sum.total ?? 0),
            fulfilment: n(r.qty) ? n(r.done) / n(r.qty) : null,
            lastOrder: r.last,
            source: { type: 'SalesOrder', filter: { customerId: r.customerId }, href: `/customers/${r.customerId}` },
          }));
        },
      },
      {
        key: 'pending-orders',
        title: 'Pending sales orders',
        group: 'sales',
        description: 'Open order lines with quantity still to dispatch and current availability.',
        permission: 'reports.sales',
        params: ['customerId'],
        columns: [
          { key: 'order', label: 'Order' },
          { key: 'customer', label: 'Customer' },
          { key: 'sku', label: 'SKU' },
          { key: 'ordered', label: 'Ordered', type: 'number' },
          { key: 'dispatched', label: 'Dispatched', type: 'number' },
          { key: 'pending', label: 'Pending', type: 'number' },
          { key: 'available', label: 'Available stock', type: 'number' },
          { key: 'requiredBy', label: 'Required by', type: 'date' },
        ],
        run: async (q) => {
          const lines = await p.salesOrderLine.findMany({
            where: { salesOrder: { status: { in: ['CONFIRMED', 'PARTIALLY_FULFILLED'] }, customerId: q.customerId } },
            include: { salesOrder: { select: { id: true, number: true, requiredBy: true, customer: { select: { companyName: true } } } }, item: { select: { id: true, code: true } } },
            orderBy: { salesOrder: { requiredBy: 'asc' } },
          });
          const stock = await this.inventory.stockSummary({ itemIds: [...new Set(lines.map((l) => l.itemId))] });
          return lines
            .filter((l) => D(l.quantity).gt(l.quantityFulfilled))
            .map((l) => ({
              order: l.salesOrder.number,
              customer: l.salesOrder.customer.companyName,
              sku: l.item.code,
              ordered: n(l.quantity),
              dispatched: n(l.quantityFulfilled),
              pending: n(D(l.quantity).minus(l.quantityFulfilled)),
              available: stock.find((s) => s.id === l.itemId)?.available ?? 0,
              requiredBy: l.salesOrder.requiredBy,
              source: { type: 'SalesOrder', ids: [l.salesOrder.id], href: `/sales/orders/${l.salesOrder.id}` },
            }));
        },
      },
      // Procurement
      {
        key: 'supplier-performance',
        title: 'Supplier performance',
        group: 'procurement',
        description: 'On-time delivery, rejection and returns per supplier from receipts and inspections.',
        permission: 'reports.procurement',
        params: ['from', 'to', 'supplierId'],
        columns: [
          { key: 'supplier', label: 'Supplier' },
          { key: 'orders', label: 'POs', type: 'number' },
          { key: 'receipts', label: 'Receipts', type: 'number' },
          { key: 'onTimeRate', label: 'On-time receipts', type: 'percent' },
          { key: 'avgDelayDays', label: 'Avg delay (days)', type: 'number' },
          { key: 'inspected', label: 'Inspected qty', type: 'number' },
          { key: 'rejectionRate', label: 'Rejection rate', type: 'percent' },
          { key: 'returns', label: 'Returns', type: 'number' },
        ],
        run: (q) => this.supplierPerformance(q),
      },
      {
        key: 'purchase-history',
        title: 'Purchase history',
        group: 'procurement',
        description: 'Purchase order lines with ordered, received and pending quantities.',
        permission: 'reports.procurement',
        params: ['from', 'to', 'supplierId', 'itemId'],
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'po', label: 'PO' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'code', label: 'Item' },
          { key: 'quantity', label: 'Ordered', type: 'number' },
          { key: 'uom', label: 'Unit' },
          { key: 'unitPrice', label: 'Unit price', type: 'money' },
          { key: 'received', label: 'Received', type: 'number' },
          { key: 'pending', label: 'Pending', type: 'number' },
          { key: 'status', label: 'Status' },
        ],
        run: async (q) => {
          const lines = await p.purchaseOrderLine.findMany({
            where: { itemId: q.itemId, purchaseOrder: { orderDate: { gte: q.from, lte: q.to }, supplierId: q.supplierId, status: { not: 'CANCELLED' } } },
            include: { purchaseOrder: { select: { id: true, number: true, orderDate: true, status: true, supplier: { select: { name: true } } } }, item: { select: { code: true } } },
            orderBy: { purchaseOrder: { orderDate: 'desc' } },
          });
          return lines.map((l) => ({
            date: l.purchaseOrder.orderDate,
            po: l.purchaseOrder.number,
            supplier: l.purchaseOrder.supplier.name,
            code: l.item.code,
            quantity: n(l.quantity),
            uom: l.uomCode,
            unitPrice: n(l.unitPrice),
            received: n(l.quantityReceived),
            pending: n(Decimal.max(0, D(l.quantity).minus(l.quantityReceived))),
            status: l.purchaseOrder.status,
            source: { type: 'PurchaseOrder', ids: [l.purchaseOrder.id], href: `/procurement/orders/${l.purchaseOrder.id}` },
          }));
        },
      },
      {
        key: 'price-history',
        title: 'Material price history',
        group: 'procurement',
        description: 'Received unit prices per base unit from goods receipts.',
        permission: 'reports.procurement',
        params: ['from', 'to', 'itemId', 'supplierId'],
        columns: [
          { key: 'date', label: 'Received', type: 'date' },
          { key: 'code', label: 'Item' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'grn', label: 'GRN' },
          { key: 'quantity', label: 'Quantity (base)', type: 'number' },
          { key: 'uom', label: 'Base unit' },
          { key: 'pricePerBase', label: 'Price per base unit', type: 'money' },
        ],
        run: async (q) => {
          const lines = await p.goodsReceiptLine.findMany({
            where: { itemId: q.itemId, unitPrice: { not: null }, goodsReceipt: { receivedAt: { gte: q.from, lte: q.to }, supplierId: q.supplierId } },
            include: { goodsReceipt: { select: { id: true, number: true, receivedAt: true, supplier: { select: { name: true } } } }, item: { select: { code: true, uom: { select: { code: true } } } } },
            orderBy: { goodsReceipt: { receivedAt: 'desc' } },
          });
          return lines.map((l) => ({
            date: l.goodsReceipt.receivedAt,
            code: l.item.code,
            supplier: l.goodsReceipt.supplier.name,
            grn: l.goodsReceipt.number,
            quantity: n(l.baseQuantity),
            uom: l.item.uom.code,
            pricePerBase: l.baseQuantity.isZero() ? null : n(D(l.unitPrice).mul(l.quantity).div(l.baseQuantity).toDecimalPlaces(4)),
            source: { type: 'GoodsReceipt', ids: [l.goodsReceipt.id] },
          }));
        },
      },
      {
        key: 'pending-purchase-orders',
        title: 'Pending purchase orders',
        group: 'procurement',
        description: 'Approved purchase order lines awaiting delivery.',
        permission: 'reports.procurement',
        params: ['supplierId', 'itemId'],
        columns: [
          { key: 'po', label: 'PO' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'code', label: 'Item' },
          { key: 'pending', label: 'Pending', type: 'number' },
          { key: 'uom', label: 'Unit' },
          { key: 'expected', label: 'Expected', type: 'date' },
          { key: 'overdue', label: 'Overdue' },
        ],
        run: async (q) =>
          ((await this.procurement.outstanding({ supplierId: q.supplierId, itemId: q.itemId })) as unknown as {
            purchaseOrder: { id: string; number: string; expectedDate: Date | null; supplier: { name: string } };
            item: { code: string };
            pendingQty: number;
            uomCode: string;
            expectedDate: Date | null;
            isOverdue: boolean;
          }[]).map((l) => ({
            po: l.purchaseOrder.number,
            supplier: l.purchaseOrder.supplier.name,
            code: l.item.code,
            pending: l.pendingQty,
            uom: l.uomCode,
            expected: l.expectedDate ?? l.purchaseOrder.expectedDate,
            overdue: l.isOverdue ? 'Yes' : 'No',
            source: { type: 'PurchaseOrder', ids: [l.purchaseOrder.id] },
          })),
      },
    ];
  }

  // ─── Shared analytics (also used by the AI copilot) ──

  async consumption(q: { from: Date; to: Date; categoryId?: string; itemId?: string }) {
    const rows = await this.prisma.$queryRaw<{ itemId: string; code: string; name: string; category: string | null; uom: string; price: Decimal | null; production: Decimal; issues: Decimal; damage: Decimal; reversals: Decimal }[]>`
      SELECT i."id" AS "itemId", i."code", i."name", c."name" AS "category", u."code" AS "uom", COALESCE(i."lastPurchasePrice", i."standardCost") AS "price",
             COALESCE(-SUM(CASE WHEN t."type" IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_RETURN') THEN m."quantity" END), 0) AS "production",
             COALESCE(-SUM(CASE WHEN t."type" = 'ISSUE' THEN m."quantity" END), 0) AS "issues",
             COALESCE(-SUM(CASE WHEN t."type" = 'DAMAGE' THEN m."quantity" END), 0) AS "damage",
             COALESCE(-SUM(CASE WHEN t."type" = 'REVERSAL' AND orig."type" IN ('PRODUCTION_CONSUMPTION','ISSUE','DAMAGE') THEN m."quantity" END), 0) AS "reversals"
      FROM "StockMovement" m
      JOIN "InventoryTransaction" t ON t."id" = m."transactionId"
      LEFT JOIN "InventoryTransaction" orig ON orig."id" = t."reversalOfId"
      JOIN "Item" i ON i."id" = m."itemId" JOIN "Uom" u ON u."id" = i."uomId" LEFT JOIN "ItemCategory" c ON c."id" = i."categoryId"
      WHERE m."bucket" = 'ON_HAND' AND i."type" = 'MATERIAL' AND m."createdAt" BETWEEN ${q.from} AND ${q.to}
        AND (t."type" IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_RETURN', 'ISSUE', 'DAMAGE') OR (t."type" = 'REVERSAL' AND orig."type" IN ('PRODUCTION_CONSUMPTION','ISSUE','DAMAGE')))
        ${q.categoryId ? Prisma.sql`AND i."categoryId" = ${q.categoryId}` : Prisma.empty}
        ${q.itemId ? Prisma.sql`AND i."id" = ${q.itemId}` : Prisma.empty}
      GROUP BY i."id", i."code", i."name", c."name", u."code", i."lastPurchasePrice", i."standardCost"`;
    return rows
      .map((r) => {
        const total = D(r.production).plus(r.issues).plus(r.damage).plus(r.reversals);
        return {
          code: r.code,
          name: r.name,
          category: r.category ?? '',
          uom: r.uom,
          production: n(r.production),
          issues: n(r.issues),
          damage: n(r.damage),
          total: n(total),
          value: r.price !== null ? n(total.mul(r.price).toDecimalPlaces(2)) : null,
          source: { type: 'StockMovement', filter: { itemId: r.itemId, from: q.from, to: q.to, types: ['PRODUCTION_CONSUMPTION', 'PRODUCTION_RETURN', 'ISSUE', 'DAMAGE', 'REVERSAL'] } },
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  async ageing(q: { itemType?: ItemType; categoryId?: string }) {
    const stock = (await this.inventory.stockSummary({ type: q.itemType, categoryId: q.categoryId })).filter((s) => s.onHand > 0);
    if (!stock.length) return [];
    const receipts = await this.prisma.stockMovement.findMany({
      where: { itemId: { in: stock.map((s) => s.id) }, bucket: 'ON_HAND', quantity: { gt: 0 }, transaction: { type: { in: ['RECEIPT', 'PURCHASE_RECEIPT', 'PRODUCTION_OUTPUT', 'RETURN', 'PRODUCTION_RETURN', 'ADJUSTMENT', 'RECONCILIATION'] } } },
      select: { itemId: true, quantity: true, createdAt: true, transactionId: true },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    return stock.map((s) => {
      let remaining = D(s.onHand);
      const buckets = [ZERO, ZERO, ZERO, ZERO];
      let oldest = 0;
      const ids: string[] = [];
      for (const r of receipts.filter((x) => x.itemId === s.id)) {
        if (remaining.lte(0)) break;
        const take = Decimal.min(remaining, r.quantity);
        const age = Math.floor((now - r.createdAt.getTime()) / 86_400_000);
        const b = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
        buckets[b] = buckets[b].plus(take);
        oldest = Math.max(oldest, age);
        remaining = remaining.minus(take);
        ids.push(r.transactionId);
      }
      if (remaining.gt(0)) buckets[3] = buckets[3].plus(remaining); // stock older than recorded receipts
      return { code: s.code, name: s.name, uom: s.uom, onHand: s.onHand, d0_30: n(buckets[0]), d31_60: n(buckets[1]), d61_90: n(buckets[2]), d90: n(buckets[3]), oldestDays: oldest, source: { type: 'InventoryTransaction', ids } };
    });
  }

  async pendingWork() {
    const stages = await this.prisma.productionOrderStage.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED'] }, productionOrder: { status: { in: ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'] } } },
      include: {
        stageDefinition: { select: { name: true } },
        assignments: { include: { worker: { select: { name: true } } } },
        productionOrder: { select: { id: true, number: true, quantityPlanned: true, dueDate: true, item: { select: { code: true } }, stages: { select: { sequence: true, status: true, qtyGood: true }, orderBy: { sequence: 'asc' } } } },
      },
      orderBy: [{ productionOrder: { dueDate: 'asc' } }, { sequence: 'asc' }],
    });
    return stages.map((s) => {
      const prev = s.productionOrder.stages.filter((x) => x.sequence < s.sequence && !['SKIPPED', 'CANCELLED'].includes(x.status)).pop();
      const input = prev ? n(prev.qtyGood) : n(s.productionOrder.quantityPlanned);
      const processed = n(s.qtyGood) + n(s.qtyRejected);
      return {
        order: s.productionOrder.number,
        sku: s.productionOrder.item.code,
        stage: s.stageDefinition.name,
        status: s.status,
        input,
        processed,
        remaining: Math.max(0, (prev ? n(s.productionOrder.quantityPlanned) : input) - processed),
        dueDate: s.productionOrder.dueDate,
        workers: s.assignments.map((a) => a.worker.name).join(', '),
        source: { type: 'ProductionOrder', ids: [s.productionOrder.id], href: `/manufacturing/orders/${s.productionOrder.id}` },
      };
    });
  }

  async wastage(q: { from: Date; to: Date }) {
    const lines = await this.prisma.productionMaterial.findMany({
      where: { productionOrder: { OR: [{ startedAt: { gte: q.from, lte: q.to } }, { completedAt: { gte: q.from, lte: q.to } }, { status: 'IN_PROGRESS' }] } },
      include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } }, productionOrder: { select: { id: true, quantityPlanned: true } } },
    });
    const by = new Map<string, { item: (typeof lines)[number]['item']; orders: Set<string>; standard: Decimal; allowance: Decimal; wastage: Decimal }>();
    for (const l of lines) {
      const standard = D(l.qtyPerUnit).mul(l.productionOrder.quantityPlanned);
      const cur = by.get(l.itemId) ?? { item: l.item, orders: new Set(), standard: ZERO, allowance: ZERO, wastage: ZERO };
      cur.orders.add(l.productionOrderId);
      cur.standard = cur.standard.plus(standard);
      cur.allowance = cur.allowance.plus(Decimal.max(0, D(l.requiredQty).minus(standard)));
      cur.wastage = cur.wastage.plus(l.wastageQty);
      by.set(l.itemId, cur);
    }
    return [...by.values()]
      .map((v) => ({
        code: v.item.code,
        name: v.item.name,
        uom: v.item.uom.code,
        orders: v.orders.size,
        standard: n(v.standard.toDecimalPlaces(4)),
        allowance: n(v.allowance.toDecimalPlaces(4)),
        wastage: n(v.wastage),
        wastagePct: v.standard.gt(0) ? n(v.wastage.div(v.standard).toDecimalPlaces(4)) : null,
        overAllowance: n(Decimal.max(0, v.wastage.minus(v.allowance)).toDecimalPlaces(4)),
        source: { type: 'ProductionMaterial', ids: [...v.orders], filter: { itemId: v.item.id } },
      }))
      .sort((a, b) => (b.wastagePct ?? 0) - (a.wastagePct ?? 0));
  }

  async supplierPerformance(q: { from: Date; to: Date; supplierId?: string }) {
    const suppliers = await this.prisma.supplier.findMany({ where: { id: q.supplierId } });
    const out = [];
    for (const s of suppliers) {
      const [orders, grns, returns] = await Promise.all([
        this.prisma.purchaseOrder.count({ where: { supplierId: s.id, orderDate: { gte: q.from, lte: q.to }, status: { not: 'CANCELLED' } } }),
        this.prisma.goodsReceipt.findMany({ where: { supplierId: s.id, receivedAt: { gte: q.from, lte: q.to } }, include: { purchaseOrder: { select: { expectedDate: true } } } }),
        this.prisma.supplierReturn.count({ where: { supplierId: s.id, createdAt: { gte: q.from, lte: q.to } } }),
      ]);
      // inspections are linked via GRN lines; filter to this supplier
      const lineIds = (await this.prisma.goodsReceiptLine.findMany({ where: { goodsReceipt: { supplierId: s.id } }, select: { id: true } })).map((l) => l.id);
      const supInsp = lineIds.length
        ? await this.prisma.qualityInspection.aggregate({ where: { goodsReceiptLineId: { in: lineIds }, status: 'COMPLETED', completedAt: { gte: q.from, lte: q.to } }, _sum: { quantityInspected: true, quantityRejected: true } })
        : { _sum: { quantityInspected: null, quantityRejected: null } };
      const withDue = grns.filter((g) => g.purchaseOrder?.expectedDate);
      const onTime = withDue.filter((g) => g.receivedAt <= g.purchaseOrder!.expectedDate!).length;
      const delays = withDue.map((g) => Math.max(0, (g.receivedAt.getTime() - g.purchaseOrder!.expectedDate!.getTime()) / 86_400_000));
      if (!orders && !grns.length && !returns) continue;
      const inspected = n(supInsp._sum.quantityInspected);
      out.push({
        supplier: s.name,
        orders,
        receipts: grns.length,
        onTimeRate: withDue.length ? onTime / withDue.length : null,
        avgDelayDays: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
        inspected,
        rejectionRate: inspected ? n(supInsp._sum.quantityRejected) / inspected : null,
        returns,
        source: { type: 'GoodsReceipt', ids: grns.map((g) => g.id), href: `/suppliers/${s.id}` },
      });
    }
    return out;
  }
}
