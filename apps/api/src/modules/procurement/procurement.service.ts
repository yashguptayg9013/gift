import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InspectionType, InventoryTxType, ItemType, LocationType, Prisma, PurchaseOrderStatus, RequisitionStatus } from '@prisma/client';
import { D, Decimal, m2, q4, serialize, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryLedgerService, LedgerLine } from '../inventory/ledger.service';
import { QualityService } from '../quality/quality.service';
import { SequenceService } from '../settings/sequence.service';
import { SettingsService } from '../settings/settings.service';

export interface SupplierInput {
  code?: string;
  name?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  notes?: string;
  isActive?: boolean;
  contacts?: { name: string; role?: string; phone?: string; email?: string; isPrimary?: boolean }[];
}

export interface PoLineInput {
  itemId: string;
  quantity: number;
  uomCode?: string;
  unitPrice: number;
  taxRate?: number;
  description?: string;
  expectedDate?: string;
}

export interface PoInput {
  supplierId?: string;
  expectedDate?: string;
  warehouseId?: string;
  terms?: string;
  remarks?: string;
  requisitionId?: string;
  lines?: PoLineInput[];
}

const OPEN_PO: PurchaseOrderStatus[] = [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED];

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly inventory: InventoryService,
    private readonly quality: QualityService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Suppliers ────────────────────────────────────────

  async suppliers(q: { search?: string; includeInactive?: boolean; skip: number; take: number }) {
    const where: Prisma.SupplierWhereInput = {
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }, { gstin: { contains: q.search, mode: 'insensitive' } }, { city: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip: q.skip, take: q.take, orderBy: { name: 'asc' }, include: { _count: { select: { items: true, purchaseOrders: true } } } }),
      this.prisma.supplier.count({ where }),
    ]);
    return { rows, total };
  }

  async supplier(id: string) {
    const s = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        contacts: true,
        items: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } } },
        purchaseOrders: { orderBy: { orderDate: 'desc' }, take: 20, select: { id: true, number: true, status: true, orderDate: true, expectedDate: true, total: true } },
      },
    });
    if (!s) throw Errors.notFound('Supplier', id);
    return serialize(s);
  }

  async upsertSupplier(id: string | null, dto: SupplierInput, actor: AuthUser) {
    if (dto.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(dto.gstin.toUpperCase())) throw Errors.validation('GSTIN must be 15 characters (state code + PAN based)');
    const data = { ...dto, gstin: dto.gstin?.toUpperCase(), contacts: undefined, code: undefined };
    const sid = await this.prisma.$transaction(async (tx) => {
      let sid = id;
      if (id) {
        const before = await tx.supplier.findUniqueOrThrow({ where: { id } });
        await tx.supplier.update({ where: { id }, data });
        await this.audit.record({ action: 'supplier.updated', entityType: 'Supplier', entityId: id, before, after: dto, actorId: actor.id }, tx);
      } else {
        if (!dto.code || !dto.name) throw Errors.validation('code and name are required');
        sid = (await tx.supplier.create({ data: { ...data, name: dto.name, code: dto.code.toUpperCase() } })).id;
        await this.audit.record({ action: 'supplier.created', entityType: 'Supplier', entityId: sid, after: dto, actorId: actor.id }, tx);
      }
      if (dto.contacts) {
        await tx.supplierContact.deleteMany({ where: { supplierId: sid! } });
        await tx.supplierContact.createMany({ data: dto.contacts.map((c) => ({ ...c, supplierId: sid! })) });
      }
      return sid!;
    });
    return this.supplier(sid);
  }

  async upsertSupplierItem(supplierId: string, dto: { itemId: string; supplierSku?: string; purchaseUomCode?: string; conversionFactor?: number; lastPrice?: number; leadTimeDays?: number; minOrderQty?: number; isPreferred?: boolean }) {
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item || item.type !== ItemType.MATERIAL) throw Errors.validation('Select a material');
    const r = await this.prisma.$transaction(async (tx) => {
      if (dto.isPreferred) await tx.supplierItem.updateMany({ where: { itemId: dto.itemId, NOT: { supplierId } }, data: { isPreferred: false } });
      const data = { supplierSku: dto.supplierSku, purchaseUomCode: dto.purchaseUomCode, conversionFactor: dto.conversionFactor ?? 1, lastPrice: dto.lastPrice, leadTimeDays: dto.leadTimeDays, minOrderQty: dto.minOrderQty, isPreferred: dto.isPreferred ?? false };
      return tx.supplierItem.upsert({ where: { supplierId_itemId: { supplierId, itemId: dto.itemId } }, create: { supplierId, itemId: dto.itemId, ...data }, update: data });
    });
    await this.audit.record({ action: 'supplier_item.upserted', entityType: 'SupplierItem', entityId: r.id, after: dto });
    return serialize(r);
  }

  async removeSupplierItem(supplierId: string, itemId: string) {
    await this.prisma.supplierItem.delete({ where: { supplierId_itemId: { supplierId, itemId } } });
    await this.audit.record({ action: 'supplier_item.removed', entityType: 'SupplierItem', metadata: { supplierId, itemId } });
  }

  // ─── Requisitions ─────────────────────────────────────

  async requisitions(q: { status?: RequisitionStatus; skip: number; take: number }) {
    const where = { status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.purchaseRequisition.findMany({ where, skip: q.skip, take: q.take, orderBy: { createdAt: 'desc' }, include: { lines: { include: { item: { select: { code: true, name: true } } } } } }),
      this.prisma.purchaseRequisition.count({ where }),
    ]);
    return { rows: serialize(rows), total };
  }

  async requisition(id: string) {
    const r = await this.prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } } } },
    });
    if (!r) throw Errors.notFound('Requisition', id);
    const users = await this.prisma.user.findMany({ where: { id: { in: [r.requestedById, r.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return serialize({ ...r, requestedBy: users.find((u) => u.id === r.requestedById), approvedBy: users.find((u) => u.id === r.approvedById) ?? null });
  }

  async createRequisition(dto: { neededBy?: string; remarks?: string; source?: string; submit?: boolean; lines: { itemId: string; quantity: number; suggestedSupplierId?: string; remarks?: string }[] }, actor: AuthUser) {
    if (!dto.lines.length) throw Errors.validation('Add at least one line');
    for (const l of dto.lines) if (!(l.quantity > 0)) throw Errors.validation('Quantities must be positive');
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.purchaseRequisition.create({
        data: {
          number: await this.sequences.next('requisition', tx),
          status: dto.submit ? RequisitionStatus.SUBMITTED : RequisitionStatus.DRAFT,
          source: dto.source ?? 'MANUAL',
          neededBy: dto.neededBy ? new Date(dto.neededBy) : undefined,
          remarks: dto.remarks,
          requestedById: actor.id,
          lines: { create: dto.lines.map((l) => ({ itemId: l.itemId, quantity: q4(l.quantity), suggestedSupplierId: l.suggestedSupplierId, remarks: l.remarks })) },
        },
      });
      await this.audit.record({ action: 'requisition.created', entityType: 'PurchaseRequisition', entityId: r.id, summary: r.number, after: dto }, tx);
      return r;
    });
    return this.requisition(r.id);
  }

  async decideRequisition(id: string, action: 'submit' | 'approve' | 'reject' | 'cancel', actor: AuthUser, reason?: string) {
    const r = await this.prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!r) throw Errors.notFound('Requisition', id);
    const transitions: Record<string, { from: RequisitionStatus[]; to: RequisitionStatus; perm?: string }> = {
      submit: { from: [RequisitionStatus.DRAFT], to: RequisitionStatus.SUBMITTED },
      approve: { from: [RequisitionStatus.SUBMITTED], to: RequisitionStatus.APPROVED, perm: 'procurement.requisition.approve' },
      reject: { from: [RequisitionStatus.SUBMITTED], to: RequisitionStatus.REJECTED, perm: 'procurement.requisition.approve' },
      cancel: { from: [RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED, RequisitionStatus.APPROVED], to: RequisitionStatus.CANCELLED },
    };
    const t = transitions[action];
    if (t.perm && !hasPermission(actor, t.perm)) throw Errors.forbidden(`Missing permission: ${t.perm}`);
    if (action === 'approve' && r.requestedById === actor.id && (await this.settings.get('procurement')).segregationOfDuties) {
      throw Errors.forbidden('You cannot approve your own requisition');
    }
    if (action === 'reject' && !reason?.trim()) throw Errors.validation('A reason is required');
    const updated = await this.prisma.purchaseRequisition.updateMany({
      where: { id, status: { in: t.from } },
      data: { status: t.to, ...(action === 'approve' ? { approvedById: actor.id, approvedAt: new Date() } : {}), ...(action === 'reject' ? { rejectionReason: reason } : {}) },
    });
    if (!updated.count) throw Errors.invalidState(`Cannot ${action} a ${r.status.toLowerCase()} requisition`);
    await this.audit.record({ action: `requisition.${action}`, entityType: 'PurchaseRequisition', entityId: id, summary: r.number, metadata: { reason } });
    return this.requisition(id);
  }

  /** Convert an approved requisition into draft POs grouped by supplier. */
  async convertRequisition(id: string, dto: { supplierByLine?: Record<string, string>; warehouseId?: string }, actor: AuthUser) {
    const r = await this.prisma.purchaseRequisition.findUnique({ where: { id }, include: { lines: { include: { item: { include: { uom: true, supplierItems: true } } } } } });
    if (!r) throw Errors.notFound('Requisition', id);
    if (r.status !== RequisitionStatus.APPROVED) throw Errors.invalidState('Only approved requisitions can be converted');
    const groups = new Map<string, typeof r.lines>();
    for (const l of r.lines) {
      const supplierId = dto.supplierByLine?.[l.id] ?? l.suggestedSupplierId ?? l.item.supplierItems.find((s) => s.isPreferred)?.supplierId ?? l.item.supplierItems[0]?.supplierId;
      if (!supplierId) throw Errors.validation(`Choose a supplier for ${l.item.code}`);
      groups.set(supplierId, [...(groups.get(supplierId) ?? []), l]);
    }
    const poIds: string[] = [];
    for (const [supplierId, lines] of groups) {
      const po = await this.createPo(
        {
          supplierId,
          requisitionId: r.id,
          warehouseId: dto.warehouseId,
          remarks: `From requisition ${r.number}`,
          lines: lines.map((l) => {
            const si = l.item.supplierItems.find((s) => s.supplierId === supplierId);
            const factor = si && si.purchaseUomCode ? Number(si.conversionFactor) : 1;
            return { itemId: l.itemId, quantity: Number(D(l.quantity).div(factor).toDecimalPlaces(4, Decimal.ROUND_UP)), uomCode: si?.purchaseUomCode ?? l.item.uom.code, unitPrice: Number(si?.lastPrice ?? l.item.lastPurchasePrice ?? 0), taxRate: Number(l.item.taxRate ?? 0) };
          }),
        },
        actor,
      );
      poIds.push(po.id);
    }
    await this.prisma.purchaseRequisition.update({ where: { id }, data: { status: RequisitionStatus.ORDERED } });
    await this.audit.record({ action: 'requisition.converted', entityType: 'PurchaseRequisition', entityId: id, metadata: { poIds } });
    return { purchaseOrderIds: poIds };
  }

  // ─── Purchase orders ──────────────────────────────────

  private async buildPoLines(tx: Tx, supplierId: string, lines: PoLineInput[]) {
    if (!lines.length) throw Errors.validation('Add at least one line');
    const out = [];
    for (const [i, l] of lines.entries()) {
      if (!(l.quantity > 0)) throw Errors.validation(`Line ${i + 1}: quantity must be positive`);
      if (l.unitPrice < 0) throw Errors.validation(`Line ${i + 1}: price cannot be negative`);
      const item = await tx.item.findUnique({ where: { id: l.itemId }, include: { uom: true, uomConversions: true } });
      if (!item) throw Errors.validation(`Line ${i + 1}: item not found`);
      const uomCode = l.uomCode ?? item.uom.code;
      let factor = D(1);
      if (uomCode !== item.uom.code) {
        const si = await tx.supplierItem.findUnique({ where: { supplierId_itemId: { supplierId, itemId: item.id } } });
        const conv = si?.purchaseUomCode === uomCode ? si.conversionFactor : item.uomConversions.find((c) => c.uomCode === uomCode)?.factorToBase;
        if (!conv) throw Errors.validation(`Line ${i + 1}: no conversion from ${uomCode} to ${item.uom.code} for ${item.code}`);
        factor = D(conv);
      }
      out.push({ lineNo: i + 1, itemId: item.id, description: l.description, quantity: q4(l.quantity), uomCode, conversionFactor: factor, unitPrice: D(l.unitPrice), taxRate: D(l.taxRate ?? Number(item.taxRate ?? 0)), expectedDate: l.expectedDate ? new Date(l.expectedDate) : undefined });
    }
    return out;
  }

  private totals(lines: { quantity: Decimal; unitPrice: Decimal; taxRate: Decimal }[]) {
    let subtotal = ZERO;
    let tax = ZERO;
    for (const l of lines) {
      const net = m2(D(l.quantity).mul(l.unitPrice));
      subtotal = subtotal.plus(net);
      tax = tax.plus(m2(net.mul(l.taxRate).div(100)));
    }
    return { subtotal: m2(subtotal), taxTotal: m2(tax), total: m2(subtotal.plus(tax)) };
  }

  async createPo(dto: PoInput, actor: AuthUser) {
    if (!dto.supplierId) throw Errors.validation('supplierId is required');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) throw Errors.validation('Supplier not found or inactive');
    const warehouseId = dto.warehouseId ?? (await this.inventory.defaultLocation(this.prisma)).warehouseId;
    const po = await this.prisma.tx(async (tx) => {
      const lines = await this.buildPoLines(tx, supplier.id, dto.lines ?? []);
      const po = await tx.purchaseOrder.create({
        data: {
          number: await this.sequences.next('purchase_order', tx),
          supplierId: supplier.id,
          warehouseId,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
          terms: dto.terms,
          remarks: dto.remarks,
          requisitionId: dto.requisitionId,
          createdById: actor.id,
          ...this.totals(lines),
          lines: { create: lines },
        },
      });
      await this.audit.record({ action: 'purchase_order.created', entityType: 'PurchaseOrder', entityId: po.id, summary: `${po.number} ${supplier.name}`, after: dto }, tx);
      return po;
    });
    return this.po(po.id);
  }

  async updatePo(id: string, dto: PoInput, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const po = await this.lockPo(tx, id);
      if (po.status !== PurchaseOrderStatus.DRAFT) throw Errors.invalidState('Only draft purchase orders can be edited');
      const data: Prisma.PurchaseOrderUncheckedUpdateInput = {
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        terms: dto.terms,
        remarks: dto.remarks,
        warehouseId: dto.warehouseId,
      };
      if (dto.lines) {
        const lines = await this.buildPoLines(tx, po.supplierId, dto.lines);
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderLine.createMany({ data: lines.map((l) => ({ ...l, purchaseOrderId: id })) });
        Object.assign(data, this.totals(lines));
      }
      await tx.purchaseOrder.update({ where: { id }, data });
      await this.audit.record({ action: 'purchase_order.updated', entityType: 'PurchaseOrder', entityId: id, after: dto, actorId: actor.id }, tx);
    });
    return this.po(id);
  }

  private async lockPo(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw Errors.notFound('Purchase order', id);
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true, supplier: true } });
  }

  async submitPo(id: string, actor: AuthUser) {
    const s = await this.settings.get('procurement');
    const po = await this.prisma.tx(async (tx) => {
      const po = await this.lockPo(tx, id);
      if (po.status !== PurchaseOrderStatus.DRAFT) throw Errors.invalidState('Only draft orders can be submitted');
      if (!po.lines.length) throw Errors.validation('Purchase order has no lines');
      const next = s.poApprovalRequired ? PurchaseOrderStatus.PENDING_APPROVAL : PurchaseOrderStatus.APPROVED;
      await tx.purchaseOrder.update({ where: { id }, data: { status: next, submittedAt: new Date(), ...(next === 'APPROVED' ? { approvedAt: new Date(), approvedById: actor.id } : {}) } });
      await this.audit.record({ action: 'purchase_order.submitted', entityType: 'PurchaseOrder', entityId: id, summary: po.number }, tx);
      return { ...po, status: next };
    });
    if (po.status === PurchaseOrderStatus.PENDING_APPROVAL) this.events.emit('procurement.po_pending_approval', { purchaseOrderId: id, number: po.number, total: Number(po.total), supplier: po.supplier.name });
    return this.po(id);
  }

  async approvePo(id: string, decision: 'approve' | 'reject', actor: AuthUser, note?: string) {
    const s = await this.settings.get('procurement');
    await this.prisma.tx(async (tx) => {
      const po = await this.lockPo(tx, id);
      if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL) throw Errors.invalidState('Purchase order is not awaiting approval');
      if (s.segregationOfDuties && po.createdById === actor.id) throw Errors.forbidden('You cannot approve a purchase order you created');
      if (decision === 'reject' && !note?.trim()) throw Errors.validation('A reason is required to reject');
      await tx.purchaseOrder.update({
        where: { id },
        data: decision === 'approve' ? { status: PurchaseOrderStatus.APPROVED, approvedById: actor.id, approvedAt: new Date() } : { status: PurchaseOrderStatus.DRAFT, remarks: [po.remarks, `Returned for changes: ${note}`].filter(Boolean).join('\n') },
      });
      await this.audit.record({ action: `purchase_order.${decision === 'approve' ? 'approved' : 'rejected'}`, entityType: 'PurchaseOrder', entityId: id, summary: po.number, metadata: { note } }, tx);
    });
    return this.po(id);
  }

  async cancelPo(id: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A reason is required');
    await this.prisma.tx(async (tx) => {
      const po = await this.lockPo(tx, id);
      if (po.lines.some((l) => D(l.quantityReceived).gt(0))) throw Errors.invalidState('Goods were already received; close the order instead');
      if (([PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.RECEIVED] as PurchaseOrderStatus[]).includes(po.status)) throw Errors.invalidState(`Order is ${po.status.toLowerCase()}`);
      await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason } });
      await this.audit.record({ action: 'purchase_order.cancelled', entityType: 'PurchaseOrder', entityId: id, summary: `${po.number}: ${reason}`, actorId: actor.id }, tx);
    });
    return this.po(id);
  }

  /** Short-close: no further receipts expected. */
  async closePo(id: string, reason: string | undefined, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const po = await this.lockPo(tx, id);
      if (!([...OPEN_PO, PurchaseOrderStatus.RECEIVED] as PurchaseOrderStatus[]).includes(po.status)) throw Errors.invalidState(`Order is ${po.status.toLowerCase()}`);
      await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CLOSED, remarks: reason ? [po.remarks, `Closed: ${reason}`].filter(Boolean).join('\n') : po.remarks } });
      await this.audit.record({ action: 'purchase_order.closed', entityType: 'PurchaseOrder', entityId: id, summary: po.number, metadata: { reason }, actorId: actor.id }, tx);
    });
    return this.po(id);
  }

  async pos(q: { status?: PurchaseOrderStatus[]; supplierId?: string; search?: string; overdue?: boolean; skip: number; take: number }) {
    const where: Prisma.PurchaseOrderWhereInput = {
      status: q.overdue ? { in: OPEN_PO } : q.status?.length ? { in: q.status } : undefined,
      supplierId: q.supplierId,
      expectedDate: q.overdue ? { lt: new Date() } : undefined,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { supplier: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, skip: q.skip, take: q.take, orderBy: { orderDate: 'desc' }, include: { supplier: { select: { id: true, name: true, code: true } }, _count: { select: { lines: true } } } }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    const now = new Date();
    return { rows: serialize(rows.map((r) => ({ ...r, isOverdue: !!r.expectedDate && r.expectedDate < now && OPEN_PO.includes(r.status) }))), total };
  }

  async po(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        lines: { orderBy: { lineNo: 'asc' }, include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } } },
        receipts: { orderBy: { receivedAt: 'desc' }, select: { id: true, number: true, receivedAt: true, status: true, supplierInvoiceNo: true } },
      },
    });
    if (!po) throw Errors.notFound('Purchase order', id);
    const users = await this.prisma.user.findMany({ where: { id: { in: [po.createdById, po.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return serialize({
      ...po,
      createdBy: users.find((u) => u.id === po.createdById) ?? null,
      approvedBy: users.find((u) => u.id === po.approvedById) ?? null,
      lines: po.lines.map((l) => ({ ...l, pendingQty: Decimal.max(0, D(l.quantity).minus(l.quantityReceived)), baseUom: l.item.uom.code })),
      isOverdue: !!po.expectedDate && po.expectedDate < new Date() && OPEN_PO.includes(po.status),
    });
  }

  /** Lines still awaiting delivery across open POs. */
  async outstanding(q: { supplierId?: string; itemId?: string }) {
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { itemId: q.itemId, purchaseOrder: { status: { in: OPEN_PO }, supplierId: q.supplierId } },
      include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } }, purchaseOrder: { select: { id: true, number: true, expectedDate: true, supplier: { select: { id: true, name: true } } } } },
      orderBy: { purchaseOrder: { expectedDate: 'asc' } },
    });
    const now = new Date();
    return serialize(
      lines
        .map((l) => ({ ...l, pendingQty: D(l.quantity).minus(l.quantityReceived), isOverdue: !!(l.expectedDate ?? l.purchaseOrder.expectedDate) && (l.expectedDate ?? l.purchaseOrder.expectedDate)! < now }))
        .filter((l) => l.pendingQty.gt(0)),
    );
  }

  // ─── Goods receipts ───────────────────────────────────

  /**
   * Post a goods receipt. Supports partial deliveries; prevents over-receipt.
   * Items flagged requiresInspection are received into QC hold with a pending inspection.
   */
  async receive(
    dto: {
      purchaseOrderId?: string;
      supplierId?: string;
      warehouseId?: string;
      supplierInvoiceNo?: string;
      supplierChallanNo?: string;
      vehicleNo?: string;
      remarks?: string;
      idempotencyKey?: string;
      lines: { purchaseOrderLineId?: string; itemId?: string; quantity: number; uomCode?: string; unitPrice?: number; batchNumber?: string; locationId?: string }[];
    },
    actor: AuthUser,
  ) {
    if (!dto.lines.length) throw Errors.validation('Add at least one line');
    const touched: string[] = [];
    const grnId = await this.ledger.runIdempotent(
      async (tx) => {
        if (dto.idempotencyKey) {
          const ex = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
          if (ex) return ex.id;
        }
        const po = dto.purchaseOrderId ? await this.lockPo(tx, dto.purchaseOrderId) : null;
        if (po && !OPEN_PO.includes(po.status)) throw Errors.invalidState(`Purchase order ${po.number} is ${po.status.toLowerCase().replace('_', ' ')} — it must be approved and open to receive goods`);
        const supplierId = po?.supplierId ?? dto.supplierId;
        if (!supplierId) throw Errors.validation('supplierId is required for receipts without a purchase order');
        const warehouseId = po?.warehouseId ?? dto.warehouseId ?? (await this.inventory.defaultLocation(tx)).warehouseId;
        const grn = await tx.goodsReceipt.create({
          data: {
            number: await this.sequences.next('grn', tx),
            purchaseOrderId: po?.id,
            supplierId,
            warehouseId,
            supplierInvoiceNo: dto.supplierInvoiceNo,
            supplierChallanNo: dto.supplierChallanNo,
            vehicleNo: dto.vehicleNo,
            remarks: dto.remarks,
            receivedById: actor.id,
            idempotencyKey: dto.idempotencyKey,
          },
        });
        const ledgerLines: LedgerLine[] = [];
        const inspections: { lineId: string; itemId: string; qty: Decimal }[] = [];
        for (const [i, l] of dto.lines.entries()) {
          if (!(l.quantity > 0)) throw Errors.validation(`Line ${i + 1}: quantity must be positive`);
          const poLine = l.purchaseOrderLineId ? po?.lines.find((x) => x.id === l.purchaseOrderLineId) : undefined;
          if (l.purchaseOrderLineId && !poLine) throw Errors.validation(`Line ${i + 1}: PO line not found on this order`);
          const itemId = poLine?.itemId ?? l.itemId;
          if (!itemId) throw Errors.validation(`Line ${i + 1}: itemId is required`);
          const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, include: { uom: true, uomConversions: true } });
          const qty = q4(l.quantity);
          const uomCode = l.uomCode ?? poLine?.uomCode ?? item.uom.code;
          let factor: Decimal;
          if (poLine && uomCode === poLine.uomCode) factor = D(poLine.conversionFactor);
          else if (uomCode === item.uom.code) factor = D(1);
          else {
            const c = item.uomConversions.find((x) => x.uomCode === uomCode);
            if (!c) throw Errors.validation(`Line ${i + 1}: no conversion from ${uomCode}`);
            factor = D(c.factorToBase);
          }
          if (poLine) {
            const inPoUnits = uomCode === poLine.uomCode ? qty : q4(qty.mul(factor).div(poLine.conversionFactor));
            const pending = D(poLine.quantity).minus(poLine.quantityReceived);
            if (inPoUnits.gt(pending)) throw Errors.rule('OVER_RECEIPT', `Line ${i + 1} (${item.code}): receiving ${inPoUnits} exceeds pending ${pending} ${poLine.uomCode}`);
            await tx.purchaseOrderLine.update({ where: { id: poLine.id }, data: { quantityReceived: { increment: inPoUnits } } });
            poLine.quantityReceived = D(poLine.quantityReceived).plus(inPoUnits);
          }
          const base = q4(qty.mul(factor));
          const unitPrice = l.unitPrice !== undefined ? D(l.unitPrice) : poLine ? D(poLine.unitPrice) : null;
          const baseUnitCost = unitPrice ? unitPrice.div(factor) : null;
          const batchId = await this.inventory.resolveBatch(tx, item, l.batchNumber, { supplierId, unitCost: baseUnitCost ?? undefined });
          const location = item.requiresInspection
            ? await this.inventory.locationOfType(tx, warehouseId, LocationType.QC_HOLD)
            : l.locationId
              ? await tx.location.findUniqueOrThrow({ where: { id: l.locationId } })
              : await this.inventory.defaultLocation(tx, warehouseId);
          const grnLine = await tx.goodsReceiptLine.create({
            data: {
              goodsReceiptId: grn.id,
              purchaseOrderLineId: poLine?.id,
              itemId,
              quantity: qty,
              uomCode,
              baseQuantity: base,
              unitPrice,
              batchNumber: l.batchNumber,
              batchId,
              locationId: location.id,
              requiresInspection: item.requiresInspection,
              quantityAccepted: item.requiresInspection ? null : base,
            },
          });
          ledgerLines.push({ itemId, locationId: location.id, batchId, quantity: base, unitCost: baseUnitCost });
          if (item.requiresInspection) inspections.push({ lineId: grnLine.id, itemId, qty: base });
          if (baseUnitCost) await tx.item.update({ where: { id: itemId }, data: { lastPurchasePrice: m2(baseUnitCost) } });
          if (unitPrice) await tx.supplierItem.updateMany({ where: { supplierId, itemId }, data: { lastPrice: unitPrice } });
          touched.push(itemId);
        }
        const { transaction } = await this.ledger.post(tx, {
          type: InventoryTxType.PURCHASE_RECEIPT,
          referenceType: 'GoodsReceipt',
          referenceId: grn.id,
          referenceNumber: grn.number,
          reason: po ? `Receipt against ${po.number}` : 'Direct supplier receipt',
          lines: ledgerLines,
          actor,
        });
        await tx.goodsReceipt.update({ where: { id: grn.id }, data: { inventoryTxId: transaction.id } });
        for (const insp of inspections) {
          await this.quality.createPending(tx, { type: InspectionType.MATERIAL_RECEIPT, itemId: insp.itemId, quantity: insp.qty, goodsReceiptLineId: insp.lineId, remarks: `GRN ${grn.number}` }, actor);
        }
        if (po) {
          const fresh = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
          const done = fresh.every((l) => D(l.quantityReceived).gte(l.quantity));
          await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: done ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED } });
        }
        await this.audit.record({ action: 'grn.posted', entityType: 'GoodsReceipt', entityId: grn.id, summary: `${grn.number}${po ? ` against ${po.number}` : ''}`, after: dto }, tx);
        return grn.id;
      },
      async () => (await this.prisma.goodsReceipt.findUniqueOrThrow({ where: { idempotencyKey: dto.idempotencyKey! } })).id,
    );
    this.inventory.emitChanged(touched);
    return this.grn(grnId);
  }

  async grns(q: { supplierId?: string; purchaseOrderId?: string; search?: string; skip: number; take: number }) {
    const where: Prisma.GoodsReceiptWhereInput = {
      supplierId: q.supplierId,
      purchaseOrderId: q.purchaseOrderId,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { supplierInvoiceNo: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({ where, skip: q.skip, take: q.take, orderBy: { receivedAt: 'desc' }, include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, number: true } }, _count: { select: { lines: true } } } }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return { rows, total };
  }

  async grn(id: string) {
    const g = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, number: true } },
        lines: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } } },
      },
    });
    if (!g) throw Errors.notFound('Goods receipt', id);
    const inspections = await this.prisma.qualityInspection.findMany({ where: { goodsReceiptLineId: { in: g.lines.map((l) => l.id) } }, select: { id: true, number: true, status: true, goodsReceiptLineId: true } });
    return serialize({ ...g, lines: g.lines.map((l) => ({ ...l, inspection: inspections.find((i) => i.goodsReceiptLineId === l.id) ?? null })) });
  }

  // ─── Supplier returns ─────────────────────────────────

  async supplierReturn(
    dto: { supplierId: string; goodsReceiptId?: string; purchaseOrderId?: string; reason: string; remarks?: string; idempotencyKey?: string; lines: { itemId: string; quantity: number; locationId: string; batchId?: string; purchaseOrderLineId?: string }[] },
    actor: AuthUser,
  ) {
    if (!dto.reason?.trim()) throw Errors.validation('A reason is required');
    const touched = dto.lines.map((l) => l.itemId);
    const id = await this.ledger.runIdempotent(
      async (tx) => {
        if (dto.idempotencyKey) {
          const ex = await tx.supplierReturn.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
          if (ex) return ex.id;
        }
        const loc = await tx.location.findUniqueOrThrow({ where: { id: dto.lines[0].locationId } });
        const sr = await tx.supplierReturn.create({
          data: {
            number: await this.sequences.next('supplier_return', tx),
            supplierId: dto.supplierId,
            goodsReceiptId: dto.goodsReceiptId,
            purchaseOrderId: dto.purchaseOrderId,
            warehouseId: loc.warehouseId,
            reason: dto.reason,
            remarks: dto.remarks,
            createdById: actor.id,
            idempotencyKey: dto.idempotencyKey,
            lines: { create: dto.lines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, batchId: l.batchId, quantity: q4(l.quantity), purchaseOrderLineId: l.purchaseOrderLineId })) },
          },
        });
        const { transaction } = await this.ledger.post(tx, {
          type: InventoryTxType.PURCHASE_RETURN,
          referenceType: 'SupplierReturn',
          referenceId: sr.id,
          referenceNumber: sr.number,
          reason: dto.reason,
          lines: dto.lines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, batchId: l.batchId ?? null, quantity: q4(l.quantity).neg() })),
          actor,
        });
        await tx.supplierReturn.update({ where: { id: sr.id }, data: { inventoryTxId: transaction.id } });
        for (const l of dto.lines) {
          if (!l.purchaseOrderLineId) continue;
          const pl = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: l.purchaseOrderLineId } });
          await tx.purchaseOrderLine.update({ where: { id: pl.id }, data: { quantityReturned: { increment: q4(D(l.quantity).div(pl.conversionFactor)) } } });
        }
        await this.audit.record({ action: 'supplier_return.posted', entityType: 'SupplierReturn', entityId: sr.id, summary: `${sr.number}: ${dto.reason}` }, tx);
        return sr.id;
      },
      async () => (await this.prisma.supplierReturn.findUniqueOrThrow({ where: { idempotencyKey: dto.idempotencyKey! } })).id,
    );
    this.inventory.emitChanged(touched);
    return serialize(await this.prisma.supplierReturn.findUniqueOrThrow({ where: { id }, include: { lines: { include: { item: { select: { code: true, name: true } } } }, supplier: { select: { name: true } } } }));
  }

  async supplierReturns(q: { supplierId?: string; skip: number; take: number }) {
    const where = { supplierId: q.supplierId };
    const [rows, total] = await Promise.all([
      this.prisma.supplierReturn.findMany({ where, skip: q.skip, take: q.take, orderBy: { createdAt: 'desc' }, include: { supplier: { select: { name: true } }, _count: { select: { lines: true } } } }),
      this.prisma.supplierReturn.count({ where }),
    ]);
    return { rows, total };
  }

  // ─── Reorder recommendations (never auto-orders) ──────

  /**
   * For each active material: projected = available + on order − open production need.
   * Average daily consumption is measured from the ledger over the lookback window.
   * Suggested qty brings projected stock up to min + demand over (lead time + cover days).
   */
  async reorderRecommendations(q: { warehouseId?: string; includeAll?: boolean } = {}) {
    const s = await this.settings.get('procurement');
    const since = new Date(Date.now() - s.reorderLookbackDays * 86_400_000);
    const [summary, consumption, onOrderRows, prodNeed, supplierItems] = await Promise.all([
      this.inventory.stockSummary({ type: ItemType.MATERIAL, warehouseId: q.warehouseId }),
      this.prisma.$queryRaw<{ itemId: string; consumed: Decimal }[]>`
        SELECT m."itemId", -SUM(m."quantity") AS "consumed"
        FROM "StockMovement" m JOIN "InventoryTransaction" t ON t."id" = m."transactionId"
        WHERE m."bucket" = 'ON_HAND' AND m."createdAt" >= ${since}
          AND t."type" IN ('ISSUE', 'PRODUCTION_CONSUMPTION', 'DAMAGE', 'SALES_DISPATCH', 'PRODUCTION_RETURN')
        GROUP BY m."itemId"`,
      this.prisma.purchaseOrderLine.findMany({ where: { purchaseOrder: { status: { in: OPEN_PO } } }, select: { itemId: true, quantity: true, quantityReceived: true, conversionFactor: true } }),
      this.prisma.productionMaterial.findMany({
        where: { productionOrder: { status: { in: ['DRAFT', 'RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'] } } },
        select: { itemId: true, requiredQty: true, consumedQty: true, reservedQty: true },
      }),
      this.prisma.supplierItem.findMany({ include: { supplier: { select: { id: true, name: true, leadTimeDays: true, isActive: true } } } }),
    ]);
    const out = [];
    for (const it of summary) {
      const consumed = D(consumption.find((c) => c.itemId === it.id)?.consumed ?? 0);
      const avgDaily = Decimal.max(0, consumed).div(s.reorderLookbackDays);
      const onOrder = onOrderRows.filter((l) => l.itemId === it.id).reduce((acc, l) => acc.plus(Decimal.max(0, D(l.quantity).minus(l.quantityReceived)).mul(l.conversionFactor)), ZERO);
      // Unreserved, unconsumed requirement of open production orders (reserved stock is already excluded from available).
      const openNeed = prodNeed.filter((p) => p.itemId === it.id).reduce((acc, p) => acc.plus(Decimal.max(0, D(p.requiredQty).minus(p.consumedQty).minus(p.reservedQty))), ZERO);
      const sis = supplierItems.filter((x) => x.itemId === it.id && x.supplier.isActive);
      const preferred = sis.find((x) => x.isPreferred) ?? sis[0];
      const leadTime = preferred?.leadTimeDays ?? preferred?.supplier.leadTimeDays ?? s.defaultLeadTimeDays;
      const projected = D(it.available).plus(onOrder).minus(openNeed);
      const demandHorizon = avgDaily.mul(leadTime + s.reorderCoverDays);
      const target = D(it.minStock).plus(demandHorizon);
      const trigger = D(it.reorderLevel).gt(0) ? projected.lte(it.reorderLevel) : D(it.minStock).gt(0) ? projected.lt(it.minStock) : openNeed.gt(0) && projected.lt(0);
      let suggested = trigger ? Decimal.max(D(it.reorderQty), target.minus(projected)) : ZERO;
      if (preferred?.minOrderQty && suggested.gt(0)) suggested = Decimal.max(suggested, D(preferred.minOrderQty).mul(preferred.conversionFactor));
      suggested = suggested.toDecimalPlaces(2, Decimal.ROUND_UP);
      if (!trigger && !q.includeAll) continue;
      out.push({
        item: { id: it.id, code: it.code, name: it.name, uom: it.uom, category: it.category },
        available: it.available,
        onOrder: Number(onOrder),
        openProductionNeed: Number(openNeed),
        projected: Number(projected),
        minStock: it.minStock,
        reorderLevel: it.reorderLevel,
        reorderQty: it.reorderQty,
        consumedInWindow: Number(consumed),
        avgDailyConsumption: Number(avgDaily.toDecimalPlaces(4)),
        leadTimeDays: leadTime,
        coverDays: s.reorderCoverDays,
        suggestedQty: Number(suggested),
        triggered: trigger,
        preferredSupplier: preferred ? { id: preferred.supplier.id, name: preferred.supplier.name, lastPrice: preferred.lastPrice ? Number(preferred.lastPrice) : null } : null,
        basis: `Available ${it.available} + on order ${onOrder} − open production need ${openNeed} = ${projected.toDecimalPlaces(2)} ${it.uom}; avg use ${avgDaily.toDecimalPlaces(3)}/day over ${s.reorderLookbackDays} days; lead time ${leadTime}d + cover ${s.reorderCoverDays}d.`,
      });
    }
    return { generatedAt: new Date(), lookbackDays: s.reorderLookbackDays, recommendations: out.sort((a, b) => b.suggestedQty - a.suggestedQty) };
  }

  /** Create a SUBMITTED requisition from selected recommendations (requires approval to order). */
  async requisitionFromRecommendations(lines: { itemId: string; quantity: number; suggestedSupplierId?: string }[], actor: AuthUser) {
    return this.createRequisition({ source: 'REORDER_RECOMMENDATION', submit: true, remarks: 'Created from reorder recommendations', lines }, actor);
  }
}
