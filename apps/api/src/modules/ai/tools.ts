import type Anthropic from '@anthropic-ai/sdk';
import { ApprovalType, ItemType } from '@prisma/client';
import { z } from 'zod';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionService } from '../manufacturing/production.service';
import { ProcurementService } from '../procurement/procurement.service';
import { DashboardService } from '../reports/dashboard.service';
import { ReportsService } from '../reports/reports.service';
import { InsightsService } from './insights.service';
import { recordQuerySchema, runRecordQuery, QUERY_ENTITIES } from './record-query';

export interface ToolDeps {
  prisma: PrismaService;
  inventory: InventoryService;
  reports: ReportsService;
  dashboard: DashboardService;
  insights: InsightsService;
  procurement: ProcurementService;
  production: ProductionService;
  approvals: ApprovalsService;
}

export interface AiTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  /** user needs ANY of these permissions to see/use the tool */
  permissions: string[];
  /** write tools never execute: they create an approval request */
  kind: 'read' | 'propose';
  schema: S;
  run: (input: z.infer<S>, user: AuthUser, deps: ToolDeps) => Promise<unknown>;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const range = z.object({ from: isoDate.describe('Start date (YYYY-MM-DD, inclusive, IST)'), to: isoDate.describe('End date (YYYY-MM-DD, inclusive, IST)') });
const startOf = (d: string) => new Date(`${d}T00:00:00+05:30`);
const endOf = (d: string) => new Date(new Date(`${d}T00:00:00+05:30`).getTime() + 86_400_000 - 1);

function tool<S extends z.ZodTypeAny>(t: AiTool<S>): AiTool<S> {
  return t;
}

async function itemByCode(deps: ToolDeps, code: string) {
  const item = await deps.prisma.item.findFirst({ where: { code: { equals: code.trim(), mode: 'insensitive' } }, include: { uom: true } });
  if (!item) throw Errors.notFound('Item with code', code);
  return item;
}

export const AI_TOOLS: AiTool[] = [
  tool({
    name: 'get_low_stock',
    description: 'List materials and/or finished goods at or below their reorder level or minimum stock, with available quantity (usable on-hand minus reserved).',
    permissions: ['inventory.view'],
    kind: 'read',
    schema: z.object({ itemType: z.enum(['MATERIAL', 'PRODUCT']).optional().describe('Limit to raw materials or finished goods') }),
    run: async (i, _u, d) => (await d.inventory.stockSummary({ type: i.itemType as ItemType | undefined, lowStockOnly: true })).map(slimStock),
  }),
  tool({
    name: 'search_stock',
    description: 'Search items by code, name or colour and return current stock (on hand, reserved, available, unit, status). Use to answer "how much X do we have".',
    permissions: ['inventory.view', 'product.view'],
    kind: 'read',
    schema: z.object({ query: z.string().min(1).max(100), itemType: z.enum(['MATERIAL', 'PRODUCT']).optional() }),
    run: async (i, _u, d) => (await d.inventory.stockSummary({ search: i.query, type: i.itemType as ItemType | undefined })).slice(0, 30).map(slimStock),
  }),
  tool({
    name: 'get_material_consumption',
    description: 'Net material consumption (production, issues, damage; returns and reversals netted off) per material for a date range. Optionally filter by material code or category code (e.g. PU_LEATHER).',
    permissions: ['reports.inventory'],
    kind: 'read',
    schema: range.extend({ itemCode: z.string().max(40).optional(), categoryCode: z.string().max(40).optional() }),
    run: async (i, _u, d) => {
      const item = i.itemCode ? await itemByCode(d, i.itemCode) : null;
      const cat = i.categoryCode ? await d.prisma.itemCategory.findUnique({ where: { code: i.categoryCode.toUpperCase() } }) : null;
      if (i.categoryCode && !cat) throw Errors.notFound('Category', i.categoryCode);
      return d.reports.consumption({ from: startOf(i.from), to: endOf(i.to), itemId: item?.id, categoryId: cat?.id });
    },
  }),
  tool({
    name: 'get_delayed_production_orders',
    description: 'Production orders past their due date that are not completed, with days late and current stage.',
    permissions: ['production.view'],
    kind: 'read',
    schema: z.object({}),
    run: (_i, _u, d) => d.insights.delayedOrders(),
  }),
  tool({
    name: 'get_pending_production_work',
    description: 'Open stages of active production orders with input available, processed and remaining quantities, due dates and assigned workers.',
    permissions: ['production.view'],
    kind: 'read',
    schema: z.object({}),
    run: (_i, _u, d) => d.reports.pendingWork(),
  }),
  tool({
    name: 'get_production_order',
    description: 'Full details of one production order by its number (e.g. MO/26-27/00012): stages, materials (required, reserved, consumed, wastage), outputs and recent events.',
    permissions: ['production.view'],
    kind: 'read',
    schema: z.object({ number: z.string().min(1).max(40) }),
    run: async (i, _u, d) => {
      const o = await d.prisma.productionOrder.findUnique({ where: { number: i.number.trim() } });
      if (!o) throw Errors.notFound('Production order', i.number);
      const full = (await d.production.get(o.id)) as unknown as Record<string, unknown> & { events: unknown[] };
      return { ...full, events: full.events.slice(0, 20) };
    },
  }),
  tool({
    name: 'analyze_production_bottlenecks',
    description: 'Stage-level bottleneck analysis for active production: queued units, remaining units, recent throughput per day, days of work, paused stages.',
    permissions: ['production.view'],
    kind: 'read',
    schema: z.object({ throughputDays: z.number().int().min(1).max(60).default(7) }),
    run: (i, _u, d) => d.insights.productionBottlenecks(i.throughputDays),
  }),
  tool({
    name: 'get_wastage_analysis',
    description: 'Reported material wastage versus the BOM wastage allowance per material for orders active in the date range.',
    permissions: ['reports.manufacturing'],
    kind: 'read',
    schema: range,
    run: (i, _u, d) => d.reports.wastage({ from: startOf(i.from), to: endOf(i.to) }),
  }),
  tool({
    name: 'get_sales_by_product',
    description: 'Ordered and dispatched quantity and value per finished-goods SKU for a date range, ranked by value. Use for fastest-moving / top products.',
    permissions: ['reports.sales'],
    kind: 'read',
    schema: range.extend({ limit: z.number().int().min(1).max(100).default(20) }),
    run: async (i, u, d) => (await d.reports.run('sales-by-sku', { from: startOf(i.from), to: endOf(i.to), limit: i.limit }, u)).rows.map(stripSource),
  }),
  tool({
    name: 'get_sales_trend',
    description: 'Monthly confirmed sales order count and value, and dispatched units, for a date range.',
    permissions: ['reports.sales'],
    kind: 'read',
    schema: range,
    run: async (i, u, d) => (await d.reports.run('sales-by-month', { from: startOf(i.from), to: endOf(i.to) }, u)).rows.map(stripSource),
  }),
  tool({
    name: 'get_reorder_recommendations',
    description: 'Material reorder recommendations: available, on order, open production need, average daily consumption, lead time and suggested quantity with the calculation basis. Recommendations only — nothing is ordered.',
    permissions: ['procurement.view', 'inventory.view'],
    kind: 'read',
    schema: z.object({}),
    run: (_i, _u, d) => d.procurement.reorderRecommendations(),
  }),
  tool({
    name: 'get_purchase_orders',
    description: 'Purchase orders, optionally only overdue ones or a given status (DRAFT, PENDING_APPROVAL, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED).',
    permissions: ['procurement.view'],
    kind: 'read',
    schema: z.object({ overdueOnly: z.boolean().default(false), status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED']).optional() }),
    run: async (i, _u, d) => (await d.procurement.pos({ overdue: i.overdueOnly, status: i.status ? [i.status] : undefined, skip: 0, take: 50 })).rows,
  }),
  tool({
    name: 'detect_inventory_anomalies',
    description: 'Statistical inventory anomaly detection: outward-consumption spikes (z-score), unusually large adjustments, negative balances, wastage over allowance.',
    permissions: ['inventory.view'],
    kind: 'read',
    schema: z.object({ lookbackDays: z.number().int().min(21).max(365).default(60), recentDays: z.number().int().min(1).max(14).default(7) }),
    run: (i, _u, d) => d.insights.inventoryAnomalies({ lookbackDays: i.lookbackDays, recentDays: i.recentDays }),
  }),
  tool({
    name: 'get_business_summary',
    description: 'Facts for one day (default today, IST): inventory transactions, production output, completed orders, sales, receipts, inspections, low stock, delayed orders, pending approvals.',
    permissions: ['dashboard.view'],
    kind: 'read',
    schema: z.object({ date: isoDate.optional() }),
    run: (i, _u, d) => d.insights.dailySummary(i.date),
  }),
  tool({
    name: 'get_dashboard_kpis',
    description: 'Executive KPIs for a date range: stock counts and value estimate, production, sales and procurement status counts.',
    permissions: ['dashboard.view'],
    kind: 'read',
    schema: range,
    run: async (i, _u, d) => {
      const r = await d.dashboard.get(startOf(i.from), endOf(i.to));
      return { rawMaterials: r.rawMaterials, finishedGoods: r.finishedGoods, production: r.production, sales: r.sales, procurement: r.procurement };
    },
  }),
  tool({
    name: 'query_records',
    description: `Structured, read-only query over whitelisted business records. Entities: ${Object.entries(QUERY_ENTITIES)
      .map(([k, v]) => `${k} (${v.description}; fields: ${Object.keys(v.fields).join(', ')})`)
      .join('; ')}. Filters use ops eq, neq, gt, gte, lt, lte, contains, in. Supports aggregate {fn: count|sum|avg|min|max, field, groupBy}. Max 100 rows.`,
    permissions: Object.values(QUERY_ENTITIES).map((e) => e.permission),
    kind: 'read',
    schema: recordQuerySchema,
    run: (i, u, d) => runRecordQuery(d.prisma, i, u),
  }),

  // ─── Proposals (human approval required) ───────────────────────────
  tool({
    name: 'propose_stock_adjustment',
    description: 'Propose a stock adjustment (positive or negative quantities in the item base unit) with a reason. Creates an approval request; nothing changes until an authorised person approves.',
    permissions: ['inventory.adjust'],
    kind: 'propose',
    schema: z.object({
      reason: z.string().min(5).max(300),
      lines: z.array(z.object({ itemCode: z.string().max(40), quantity: z.number().refine((v) => v !== 0, 'Quantity cannot be zero'), locationCode: z.string().max(20).optional() })).min(1).max(20),
    }),
    run: async (i, u, d) => {
      const lines = [];
      for (const l of i.lines) {
        const item = await itemByCode(d, l.itemCode);
        const loc = l.locationCode ? await d.prisma.location.findFirst({ where: { code: l.locationCode.toUpperCase() } }) : null;
        if (l.locationCode && !loc) throw Errors.notFound('Location', l.locationCode);
        lines.push({ itemId: item.id, itemCode: item.code, quantity: l.quantity, uom: item.uom.code, locationId: loc?.id });
      }
      return propose(d, u, 'stock_adjustment', 'inventory.adjust.approve', `AI-proposed stock adjustment (${lines.length} line${lines.length > 1 ? 's' : ''})`, `${lines.map((l) => `${l.itemCode} ${l.quantity > 0 ? '+' : ''}${l.quantity} ${l.uom}`).join(', ')}. Reason: ${i.reason}`, { reason: i.reason, lines });
    },
  }),
  tool({
    name: 'propose_purchase_requisition',
    description: 'Propose a purchase requisition for materials (quantities in base units). Creates an approval request; once approved it becomes a submitted requisition that still follows the normal approval and PO process.',
    permissions: ['procurement.requisition.manage'],
    kind: 'propose',
    schema: z.object({ remarks: z.string().max(500).optional(), lines: z.array(z.object({ itemCode: z.string().max(40), quantity: z.number().positive() })).min(1).max(50) }),
    run: async (i, u, d) => {
      const lines = [];
      for (const l of i.lines) {
        const item = await itemByCode(d, l.itemCode);
        lines.push({ itemId: item.id, itemCode: item.code, quantity: l.quantity, uom: item.uom.code });
      }
      return propose(d, u, 'create_purchase_requisition', 'procurement.requisition.manage', `AI-proposed purchase requisition (${lines.length} item${lines.length > 1 ? 's' : ''})`, lines.map((l) => `${l.itemCode}: ${l.quantity} ${l.uom}`).join(', '), { remarks: i.remarks, lines });
    },
  }),
  tool({
    name: 'propose_purchase_order',
    description: 'Propose a draft purchase order to a supplier (by supplier code) with lines (item code, quantity, unit price, optional purchase unit). Creates an approval request; when approved a DRAFT PO is created that still needs PO approval.',
    permissions: ['procurement.po.manage'],
    kind: 'propose',
    schema: z.object({
      supplierCode: z.string().max(20),
      expectedDate: isoDate.optional(),
      lines: z.array(z.object({ itemCode: z.string().max(40), quantity: z.number().positive(), unitPrice: z.number().min(0), uomCode: z.string().max(10).optional() })).min(1).max(50),
    }),
    run: async (i, u, d) => {
      const supplier = await d.prisma.supplier.findUnique({ where: { code: i.supplierCode.toUpperCase() } });
      if (!supplier) throw Errors.notFound('Supplier', i.supplierCode);
      const lines = [];
      for (const l of i.lines) {
        const item = await itemByCode(d, l.itemCode);
        lines.push({ itemId: item.id, itemCode: item.code, quantity: l.quantity, unitPrice: l.unitPrice, uomCode: l.uomCode });
      }
      const value = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      return propose(d, u, 'create_purchase_order', 'procurement.po.manage', `AI-proposed purchase order to ${supplier.name}`, `${lines.length} line(s), approx. INR ${value.toLocaleString('en-IN')} before tax`, {
        supplierId: supplier.id,
        supplierName: supplier.name,
        expectedDate: i.expectedDate,
        lines,
      });
    },
  }),
  tool({
    name: 'propose_cancel_production_order',
    description: 'Propose cancelling a production order (by number) with a reason. Creates an approval request; reservations are released only if approved.',
    permissions: ['production.cancel'],
    kind: 'propose',
    schema: z.object({ number: z.string().max(40), reason: z.string().min(5).max(500) }),
    run: async (i, u, d) => {
      const o = await d.prisma.productionOrder.findUnique({ where: { number: i.number.trim() } });
      if (!o) throw Errors.notFound('Production order', i.number);
      return propose(d, u, 'cancel_production_order', 'production.cancel', `AI-proposed cancellation of ${o.number}`, i.reason, { productionOrderId: o.id, number: o.number, reason: i.reason });
    },
  }),
  tool({
    name: 'propose_sales_order_change',
    description: 'Propose a change to a customer sales order (by number): new required-by date, customer PO number, remarks, or cancellation with a reason. Creates an approval request.',
    permissions: ['sales.order.manage', 'sales.order.cancel'],
    kind: 'propose',
    schema: z.object({
      number: z.string().max(40),
      requiredBy: isoDate.optional(),
      customerPoNumber: z.string().max(60).optional(),
      remarks: z.string().max(1000).optional(),
      cancel: z.boolean().default(false),
      reason: z.string().max(500).optional(),
    }),
    run: async (i, u, d) => {
      const so = await d.prisma.salesOrder.findUnique({ where: { number: i.number.trim() } });
      if (!so) throw Errors.notFound('Sales order', i.number);
      if (i.cancel && !i.reason?.trim()) throw Errors.validation('A reason is required to propose a cancellation');
      if (!i.cancel && !i.requiredBy && !i.customerPoNumber && !i.remarks) throw Errors.validation('Nothing to change');
      const perm = i.cancel ? 'sales.order.cancel' : 'sales.order.manage';
      if (!hasPermission(u, perm)) throw Errors.forbidden(`Missing permission: ${perm}`);
      return propose(d, u, 'update_sales_order', perm, i.cancel ? `AI-proposed cancellation of ${so.number}` : `AI-proposed change to ${so.number}`, i.cancel ? i.reason : JSON.stringify({ requiredBy: i.requiredBy, customerPoNumber: i.customerPoNumber, remarks: i.remarks }), {
        salesOrderId: so.id,
        number: so.number,
        cancel: i.cancel,
        reason: i.reason,
        requiredBy: i.requiredBy,
        customerPoNumber: i.customerPoNumber,
        remarks: i.remarks,
      });
    },
  }),
];

async function propose(d: ToolDeps, user: AuthUser, action: string, requiredPermission: string, title: string, description: string | undefined, args: Record<string, unknown>) {
  const req = await d.approvals.create({ type: ApprovalType.AI_ACTION, title, description, payload: { action, args }, requiredPermission, requestedBy: user, via: 'AI' });
  return { status: 'PENDING_APPROVAL', approvalId: req.id, approvalNumber: req.number, requiredPermission, message: 'Approval request created. Nothing has changed yet — an authorised user must approve it in Approvals.' };
}

function slimStock(s: { code: string; name: string; type: string; uom: string; onHand: number; reserved: number; available: number; nonUsable: number; reorderLevel: number; minStock: number; stockStatus: string }) {
  return { code: s.code, name: s.name, type: s.type, uom: s.uom, onHand: s.onHand, reserved: s.reserved, available: s.available, nonUsable: s.nonUsable, reorderLevel: s.reorderLevel, minStock: s.minStock, status: s.stockStatus };
}

function stripSource(r: Record<string, unknown>) {
  const { source: _s, ...rest } = r;
  return rest;
}

export function toolsFor(user: AuthUser) {
  return AI_TOOLS.filter((t) => t.permissions.some((p) => hasPermission(user, p)));
}

/** JSON schema for the API (zod 4 → JSON Schema, input side so defaults are optional). */
export function toApiTool(t: AiTool): Anthropic.Beta.BetaTool {
  const schema = z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: t.name,
    description: t.kind === 'propose' ? `${t.description} (Requires human approval.)` : t.description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
  };
}
