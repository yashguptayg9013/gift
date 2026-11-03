import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocStatus, InquiryStatus, InventoryTxType, ItemType, Prisma, QuotationStatus, SalesOrderStatus, StockBucket } from '@prisma/client';
import { D, Decimal, m2, q4, serialize, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryLedgerService, LedgerLine } from '../inventory/ledger.service';
import { ProductionService } from '../manufacturing/production.service';
import { SequenceService } from '../settings/sequence.service';

export const SO_SOURCE = 'SALES_ORDER';

export interface CustomerInput {
  code?: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  shippingAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  categoryId?: string | null;
  paymentTerms?: string;
  notes?: string;
  isActive?: boolean;
  contacts?: { name: string; role?: string; phone?: string; email?: string; isPrimary?: boolean }[];
}

export interface SalesLineInput {
  itemId: string;
  quantity: number;
  unitPrice?: number;
  discountPct?: number;
  taxRate?: number;
  description?: string;
  remarks?: string;
}

const OPEN_SO: SalesOrderStatus[] = [SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_FULFILLED];

export function lineAmounts(l: { quantity: Decimal | number; unitPrice: Decimal | number; discountPct?: Decimal | number; taxRate?: Decimal | number }) {
  const gross = D(l.quantity).mul(l.unitPrice);
  const discount = m2(gross.mul(D(l.discountPct ?? 0)).div(100));
  const net = m2(gross.minus(discount));
  const tax = m2(net.mul(D(l.taxRate ?? 0)).div(100));
  return { gross: m2(gross), discount, net, tax };
}

export function docTotals(lines: { quantity: Decimal | number; unitPrice: Decimal | number; discountPct?: Decimal | number; taxRate?: Decimal | number }[]) {
  let subtotal = ZERO;
  let discount = ZERO;
  let tax = ZERO;
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal = subtotal.plus(a.gross);
    discount = discount.plus(a.discount);
    tax = tax.plus(a.tax);
  }
  return { subtotal: m2(subtotal), discountTotal: m2(discount), taxTotal: m2(tax), total: m2(subtotal.minus(discount).plus(tax)) };
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly inventory: InventoryService,
    private readonly production: ProductionService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Customers ────────────────────────────────────────

  customerCategories() {
    return this.prisma.customerCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { customers: true } } } });
  }

  async upsertCustomerCategory(id: string | null, dto: { code?: string; name: string }) {
    if (id) return this.prisma.customerCategory.update({ where: { id }, data: { name: dto.name } });
    if (!dto.code) throw Errors.validation('code is required');
    return this.prisma.customerCategory.create({ data: { code: dto.code.toUpperCase(), name: dto.name } });
  }

  async customers(q: { search?: string; categoryId?: string; includeInactive?: boolean; skip: number; take: number }) {
    const where: Prisma.CustomerWhereInput = {
      categoryId: q.categoryId,
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search
        ? { OR: [{ companyName: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }, { gstin: { contains: q.search, mode: 'insensitive' } }, { contactPerson: { contains: q.search, mode: 'insensitive' } }, { city: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip: q.skip, take: q.take, orderBy: { companyName: 'asc' }, include: { category: { select: { id: true, name: true } }, _count: { select: { salesOrders: true } } } }),
      this.prisma.customer.count({ where }),
    ]);
    return { rows, total };
  }

  async customer(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        category: true,
        contacts: true,
        prices: { include: { item: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        salesOrders: { orderBy: { orderDate: 'desc' }, take: 50, select: { id: true, number: true, status: true, orderDate: true, total: true } },
        quotations: { orderBy: { quoteDate: 'desc' }, take: 20, select: { id: true, number: true, status: true, quoteDate: true, total: true } },
      },
    });
    if (!c) throw Errors.notFound('Customer', id);
    return serialize(c);
  }

  async upsertCustomer(id: string | null, dto: CustomerInput, actor: AuthUser) {
    if (dto.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(dto.gstin.toUpperCase())) throw Errors.validation('GSTIN must be 15 characters (state code + PAN based)');
    const data = { ...dto, gstin: dto.gstin?.toUpperCase() || undefined, contacts: undefined, code: undefined };
    const cid = await this.prisma.$transaction(async (tx) => {
      let cid = id;
      if (id) {
        const before = await tx.customer.findUniqueOrThrow({ where: { id } });
        await tx.customer.update({ where: { id }, data });
        await this.audit.record({ action: 'customer.updated', entityType: 'Customer', entityId: id, before, after: dto, actorId: actor.id }, tx);
      } else {
        if (!dto.code || !dto.companyName) throw Errors.validation('code and companyName are required');
        cid = (await tx.customer.create({ data: { ...data, companyName: dto.companyName, code: dto.code.toUpperCase() } })).id;
        await this.audit.record({ action: 'customer.created', entityType: 'Customer', entityId: cid, after: dto, actorId: actor.id }, tx);
      }
      if (dto.contacts) {
        await tx.customerContact.deleteMany({ where: { customerId: cid! } });
        await tx.customerContact.createMany({ data: dto.contacts.map((c) => ({ ...c, customerId: cid! })) });
      }
      return cid!;
    });
    return this.customer(cid);
  }

  async setCustomerPrice(customerId: string, dto: { itemId: string; unitPrice: number; minQty?: number; validFrom?: string; validTo?: string }, actor: AuthUser) {
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item || item.type !== ItemType.PRODUCT) throw Errors.validation('Customer prices apply to finished-goods SKUs');
    const p = await this.prisma.customerPrice.create({
      data: { customerId, itemId: dto.itemId, unitPrice: dto.unitPrice, minQty: dto.minQty ?? 0, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined },
    });
    await this.audit.record({ action: 'customer_price.created', entityType: 'CustomerPrice', entityId: p.id, after: dto, actorId: actor.id });
    return serialize(p);
  }

  async deleteCustomerPrice(priceId: string) {
    await this.prisma.customerPrice.delete({ where: { id: priceId } });
    await this.audit.record({ action: 'customer_price.deleted', entityType: 'CustomerPrice', entityId: priceId });
  }

  /** Customer-specific price (valid, highest qualifying min qty) or the SKU selling price. */
  async resolvePrice(customerId: string, itemId: string, quantity: number, db: Tx | PrismaService = this.prisma) {
    const now = new Date();
    const cp = await db.customerPrice.findFirst({
      where: { customerId, itemId, minQty: { lte: quantity }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }] },
      orderBy: [{ minQty: 'desc' }, { createdAt: 'desc' }],
    });
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    return { unitPrice: cp ? D(cp.unitPrice) : item.sellingPrice ? D(item.sellingPrice) : null, source: cp ? 'CUSTOMER_PRICE' : item.sellingPrice ? 'LIST_PRICE' : 'NONE', taxRate: D(item.taxRate ?? 0) };
  }

  private async buildLines(tx: Tx, customerId: string, lines: SalesLineInput[]) {
    if (!lines.length) throw Errors.validation('Add at least one product');
    const out = [];
    for (const [i, l] of lines.entries()) {
      if (!(l.quantity > 0)) throw Errors.validation(`Line ${i + 1}: quantity must be positive`);
      const item = await tx.item.findUnique({ where: { id: l.itemId } });
      if (!item || item.type !== ItemType.PRODUCT) throw Errors.validation(`Line ${i + 1}: select a finished-goods SKU`);
      const price = await this.resolvePrice(customerId, item.id, l.quantity, tx);
      const unitPrice = l.unitPrice !== undefined ? D(l.unitPrice) : price.unitPrice;
      if (!unitPrice) throw Errors.validation(`Line ${i + 1}: no price set for ${item.code}; enter a unit price`);
      const taxRate = l.taxRate !== undefined ? D(l.taxRate) : price.taxRate;
      const discountPct = D(l.discountPct ?? 0);
      if (discountPct.lt(0) || discountPct.gt(100)) throw Errors.validation(`Line ${i + 1}: discount must be 0–100%`);
      const a = lineAmounts({ quantity: l.quantity, unitPrice, discountPct, taxRate });
      out.push({ lineNo: i + 1, itemId: item.id, description: l.description ?? item.name, quantity: q4(l.quantity), unitPrice, discountPct, taxRate, lineTotal: a.net.plus(a.tax), remarks: l.remarks });
    }
    return out;
  }

  // ─── Inquiries ────────────────────────────────────────

  async inquiries(q: { status?: InquiryStatus; customerId?: string; search?: string; skip: number; take: number }) {
    const where: Prisma.SalesInquiryWhereInput = {
      status: q.status,
      customerId: q.customerId,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { customer: { companyName: { contains: q.search, mode: 'insensitive' } } }, { requirements: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesInquiry.findMany({ where, skip: q.skip, take: q.take, orderBy: { receivedAt: 'desc' }, include: { customer: { select: { id: true, companyName: true } }, _count: { select: { lines: true, quotations: true } } } }),
      this.prisma.salesInquiry.count({ where }),
    ]);
    return { rows, total };
  }

  async inquiry(id: string) {
    const r = await this.prisma.salesInquiry.findUnique({ where: { id }, include: { customer: true, lines: true, quotations: { select: { id: true, number: true, status: true, total: true } } } });
    if (!r) throw Errors.notFound('Inquiry', id);
    return serialize(r);
  }

  async upsertInquiry(id: string | null, dto: { customerId?: string; source?: string; receivedAt?: string; requirements?: string; assignedToId?: string; status?: InquiryStatus; lostReason?: string; lines?: { itemId?: string; description: string; quantity: number; targetPrice?: number }[] }, actor: AuthUser) {
    if (dto.status === InquiryStatus.LOST && !dto.lostReason?.trim()) throw Errors.validation('Provide a reason when marking an inquiry as lost');
    const iid = await this.prisma.$transaction(async (tx) => {
      const data = { source: dto.source, receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined, requirements: dto.requirements, assignedToId: dto.assignedToId, status: dto.status, lostReason: dto.lostReason };
      let iid = id;
      if (id) await tx.salesInquiry.update({ where: { id }, data });
      else {
        if (!dto.customerId) throw Errors.validation('customerId is required');
        iid = (await tx.salesInquiry.create({ data: { ...data, number: await this.sequences.next('inquiry', tx), customerId: dto.customerId, createdById: actor.id } })).id;
      }
      if (dto.lines) {
        await tx.salesInquiryLine.deleteMany({ where: { inquiryId: iid! } });
        await tx.salesInquiryLine.createMany({ data: dto.lines.map((l) => ({ ...l, inquiryId: iid! })) });
      }
      await this.audit.record({ action: id ? 'inquiry.updated' : 'inquiry.created', entityType: 'SalesInquiry', entityId: iid!, after: dto }, tx);
      return iid!;
    });
    return this.inquiry(iid);
  }

  // ─── Quotations ───────────────────────────────────────

  async quotations(q: { status?: QuotationStatus; customerId?: string; search?: string; skip: number; take: number }) {
    const where: Prisma.QuotationWhereInput = {
      status: q.status,
      customerId: q.customerId,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { customer: { companyName: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, skip: q.skip, take: q.take, orderBy: { quoteDate: 'desc' }, include: { customer: { select: { id: true, companyName: true } }, _count: { select: { lines: true } } } }),
      this.prisma.quotation.count({ where }),
    ]);
    return { rows: serialize(rows), total };
  }

  async quotation(id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { customer: true, inquiry: { select: { id: true, number: true } }, lines: { orderBy: { lineNo: 'asc' }, include: { item: { select: { id: true, code: true, name: true, hsnCode: true, uom: { select: { code: true } } } } } }, salesOrders: { select: { id: true, number: true } } },
    });
    if (!q) throw Errors.notFound('Quotation', id);
    return serialize(q);
  }

  async createQuotation(dto: { customerId: string; inquiryId?: string; validUntil?: string; terms?: string; notes?: string; lines: SalesLineInput[] }, actor: AuthUser) {
    const q = await this.prisma.tx(async (tx) => {
      const lines = await this.buildLines(tx, dto.customerId, dto.lines);
      const q = await tx.quotation.create({
        data: {
          number: await this.sequences.next('quotation', tx),
          customerId: dto.customerId,
          inquiryId: dto.inquiryId,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          terms: dto.terms,
          notes: dto.notes,
          createdById: actor.id,
          ...docTotals(lines),
          lines: { create: lines.map((l) => ({ ...l, remarks: undefined })) },
        },
      });
      if (dto.inquiryId) await tx.salesInquiry.update({ where: { id: dto.inquiryId }, data: { status: InquiryStatus.QUOTED } });
      await this.audit.record({ action: 'quotation.created', entityType: 'Quotation', entityId: q.id, summary: q.number, after: dto }, tx);
      return q;
    });
    return this.quotation(q.id);
  }

  async updateQuotation(id: string, dto: { validUntil?: string; terms?: string; notes?: string; lines?: SalesLineInput[] }) {
    await this.prisma.tx(async (tx) => {
      const q = await tx.quotation.findUniqueOrThrow({ where: { id } });
      if (q.status !== QuotationStatus.DRAFT) throw Errors.invalidState('Only draft quotations can be edited');
      const data: Prisma.QuotationUpdateInput = { validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined, terms: dto.terms, notes: dto.notes };
      if (dto.lines) {
        const lines = await this.buildLines(tx, q.customerId, dto.lines);
        await tx.quotationLine.deleteMany({ where: { quotationId: id } });
        await tx.quotationLine.createMany({ data: lines.map((l) => ({ ...l, remarks: undefined, quotationId: id })) });
        Object.assign(data, docTotals(lines));
      }
      await tx.quotation.update({ where: { id }, data });
      await this.audit.record({ action: 'quotation.updated', entityType: 'Quotation', entityId: id, after: dto }, tx);
    });
    return this.quotation(id);
  }

  async setQuotationStatus(id: string, status: QuotationStatus) {
    const allowed: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
      SENT: [QuotationStatus.DRAFT],
      ACCEPTED: [QuotationStatus.SENT, QuotationStatus.DRAFT],
      REJECTED: [QuotationStatus.SENT, QuotationStatus.DRAFT],
      EXPIRED: [QuotationStatus.SENT],
      DRAFT: [QuotationStatus.SENT],
    };
    const from = allowed[status];
    if (!from) throw Errors.validation(`Cannot set status ${status} directly`);
    const r = await this.prisma.quotation.updateMany({ where: { id, status: { in: from } }, data: { status } });
    if (!r.count) throw Errors.invalidState('Quotation status does not allow this change');
    await this.audit.record({ action: `quotation.${status.toLowerCase()}`, entityType: 'Quotation', entityId: id });
    return this.quotation(id);
  }

  async convertQuotation(id: string, dto: { requiredBy?: string; customerPoNumber?: string; warehouseId?: string }, actor: AuthUser) {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { lines: true } });
    if (!q) throw Errors.notFound('Quotation', id);
    if (!([QuotationStatus.ACCEPTED, QuotationStatus.SENT, QuotationStatus.DRAFT] as QuotationStatus[]).includes(q.status)) throw Errors.invalidState(`A ${q.status.toLowerCase()} quotation cannot be converted`);
    const so = await this.createOrder(
      {
        customerId: q.customerId,
        quotationId: q.id,
        requiredBy: dto.requiredBy,
        customerPoNumber: dto.customerPoNumber,
        warehouseId: dto.warehouseId,
        remarks: `From quotation ${q.number}`,
        lines: q.lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxRate: Number(l.taxRate), description: l.description ?? undefined })),
      },
      actor,
    );
    await this.prisma.quotation.update({ where: { id }, data: { status: QuotationStatus.CONVERTED } });
    if (q.inquiryId) await this.prisma.salesInquiry.update({ where: { id: q.inquiryId }, data: { status: InquiryStatus.WON } });
    return so;
  }

  // ─── Sales orders ─────────────────────────────────────

  async orders(q: { status?: SalesOrderStatus[]; customerId?: string; search?: string; from?: Date; to?: Date; skip: number; take: number }) {
    const where: Prisma.SalesOrderWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      customerId: q.customerId,
      orderDate: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { customerPoNumber: { contains: q.search, mode: 'insensitive' } }, { customer: { companyName: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { orderDate: 'desc' },
        include: { customer: { select: { id: true, companyName: true } }, lines: { select: { quantity: true, quantityFulfilled: true } } },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return {
      rows: serialize(
        rows.map((r) => {
          const qty = r.lines.reduce((s, l) => s.plus(l.quantity), ZERO);
          const done = r.lines.reduce((s, l) => s.plus(l.quantityFulfilled), ZERO);
          return { ...r, lines: undefined, lineCount: r.lines.length, fulfilment: qty.gt(0) ? Number(done.div(qty).toDecimalPlaces(4)) : 0 };
        }),
      ),
      total,
    };
  }

  async order(id: string) {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        lines: { orderBy: { lineNo: 'asc' }, include: { item: { select: { id: true, code: true, name: true, hsnCode: true, uom: { select: { code: true } } } } } },
        challans: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, challanDate: true } },
      },
    });
    if (!so) throw Errors.notFound('Sales order', id);
    const [reservations, productionOrders] = await Promise.all([
      this.prisma.stockReservation.findMany({ where: { sourceType: SO_SOURCE, sourceId: id, status: { in: ['ACTIVE', 'PARTIALLY_CONSUMED'] } } }),
      this.prisma.productionOrder.findMany({ where: { salesOrderLineId: { in: so.lines.map((l) => l.id) } }, select: { id: true, number: true, status: true, quantityPlanned: true, quantityCompleted: true, salesOrderLineId: true } }),
    ]);
    const lines = [];
    for (const l of so.lines) {
      const reserved = reservations.filter((r) => r.sourceLineId === l.id).reduce((s, r) => s.plus(D(r.quantity).minus(r.consumedQty).minus(r.releasedQty)), ZERO);
      const pending = Decimal.max(0, D(l.quantity).minus(l.quantityFulfilled));
      const available = await this.ledger.availableQty(this.prisma, l.itemId, so.warehouseId);
      lines.push({ ...l, pendingQty: pending, reservedQty: reserved, availableQty: available, productionOrders: productionOrders.filter((p) => p.salesOrderLineId === l.id) });
    }
    return serialize({ ...so, lines });
  }

  async createOrder(dto: { customerId: string; quotationId?: string; requiredBy?: string; customerPoNumber?: string; warehouseId?: string; remarks?: string; confirm?: boolean; lines: SalesLineInput[] }, actor: AuthUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) throw Errors.validation('Customer not found or inactive');
    const warehouseId = dto.warehouseId ?? (await this.inventory.defaultLocation(this.prisma)).warehouseId;
    const so = await this.prisma.tx(async (tx) => {
      const lines = await this.buildLines(tx, dto.customerId, dto.lines);
      const so = await tx.salesOrder.create({
        data: {
          number: await this.sequences.next('sales_order', tx),
          customerId: dto.customerId,
          quotationId: dto.quotationId,
          requiredBy: dto.requiredBy ? new Date(dto.requiredBy) : undefined,
          customerPoNumber: dto.customerPoNumber,
          warehouseId,
          remarks: dto.remarks,
          createdById: actor.id,
          status: dto.confirm ? SalesOrderStatus.CONFIRMED : SalesOrderStatus.DRAFT,
          confirmedAt: dto.confirm ? new Date() : undefined,
          ...docTotals(lines),
          lines: { create: lines },
        },
      });
      await this.audit.record({ action: 'sales_order.created', entityType: 'SalesOrder', entityId: so.id, summary: `${so.number} ${customer.companyName}`, after: dto }, tx);
      return so;
    });
    if (dto.confirm) this.events.emit('sales.order_created', { salesOrderId: so.id, number: so.number, customer: customer.companyName, total: Number(so.total) });
    return this.order(so.id);
  }

  private async lockOrder(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SalesOrder" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw Errors.notFound('Sales order', id);
    return tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true, customer: true } });
  }

  async updateOrder(id: string, dto: { requiredBy?: string; customerPoNumber?: string; remarks?: string; lines?: SalesLineInput[] }, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const so = await this.lockOrder(tx, id);
      if (([SalesOrderStatus.CLOSED, SalesOrderStatus.CANCELLED, SalesOrderStatus.FULFILLED] as SalesOrderStatus[]).includes(so.status)) throw Errors.invalidState(`Order is ${so.status.toLowerCase()}`);
      const data: Prisma.SalesOrderUpdateInput = { requiredBy: dto.requiredBy ? new Date(dto.requiredBy) : undefined, customerPoNumber: dto.customerPoNumber, remarks: dto.remarks };
      if (dto.lines) {
        if (so.status !== SalesOrderStatus.DRAFT) throw Errors.invalidState('Lines can only be changed while the order is a draft');
        const lines = await this.buildLines(tx, so.customerId, dto.lines);
        await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
        await tx.salesOrderLine.createMany({ data: lines.map((l) => ({ ...l, salesOrderId: id })) });
        Object.assign(data, docTotals(lines));
      }
      await tx.salesOrder.update({ where: { id }, data });
      await this.audit.record({ action: 'sales_order.updated', entityType: 'SalesOrder', entityId: id, before: { requiredBy: so.requiredBy, remarks: so.remarks }, after: dto, actorId: actor.id }, tx);
    });
    return this.order(id);
  }

  async confirmOrder(id: string, actor: AuthUser) {
    const so = await this.prisma.tx(async (tx) => {
      const so = await this.lockOrder(tx, id);
      if (so.status !== SalesOrderStatus.DRAFT) throw Errors.invalidState('Only draft orders can be confirmed');
      await tx.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.CONFIRMED, confirmedAt: new Date() } });
      await this.audit.record({ action: 'sales_order.confirmed', entityType: 'SalesOrder', entityId: id, summary: so.number, actorId: actor.id }, tx);
      return so;
    });
    this.events.emit('sales.order_created', { salesOrderId: id, number: so.number, customer: so.customer.companyName, total: Number(so.total) });
    return this.order(id);
  }

  /** Reserve available finished goods for open order lines (partial allowed). */
  async reserveStock(id: string, actor: AuthUser) {
    const itemIds: string[] = [];
    const results = await this.ledger.runIdempotent(async (tx) => {
      const so = await this.lockOrder(tx, id);
      if (!OPEN_SO.includes(so.status)) throw Errors.invalidState('Confirm the order before reserving stock');
      const open = await tx.stockReservation.findMany({ where: { sourceType: SO_SOURCE, sourceId: id, status: { in: ['ACTIVE', 'PARTIALLY_CONSUMED'] } } });
      const out = [];
      for (const l of so.lines) {
        const reserved = open.filter((r) => r.sourceLineId === l.id).reduce((s, r) => s.plus(D(r.quantity).minus(r.consumedQty).minus(r.releasedQty)), ZERO);
        const need = D(l.quantity).minus(l.quantityFulfilled).minus(reserved);
        if (need.lte(0)) continue;
        const r = await this.ledger.reserve(tx, { itemId: l.itemId, warehouseId: so.warehouseId, quantity: need, sourceType: SO_SOURCE, sourceId: so.id, sourceLineId: l.id, referenceNumber: so.number, allowPartial: true, actor });
        itemIds.push(l.itemId);
        out.push({ lineId: l.id, itemId: l.itemId, requested: Number(need), reserved: Number(r.reserved) });
      }
      return out;
    });
    this.inventory.emitChanged(itemIds);
    return { results, order: await this.order(id) };
  }

  async releaseStock(id: string, actor: AuthUser) {
    await this.ledger.runIdempotent((tx) => this.ledger.release(tx, { sourceType: SO_SOURCE, sourceId: id, actor, reason: 'Released from sales order' }));
    return this.order(id);
  }

  /** Create production orders for the unreserved, unfulfilled shortage of each line. */
  async planProduction(id: string, dto: { lineIds?: string[]; dueDate?: string }, actor: AuthUser) {
    const so = await this.order(id);
    if (!OPEN_SO.includes(so.status as SalesOrderStatus)) throw Errors.invalidState('Confirm the order first');
    const created = [];
    for (const l of so.lines as unknown as { id: string; itemId: string; pendingQty: number; reservedQty: number; availableQty: number; productionOrders: { status: string; quantityPlanned: number; quantityCompleted: number }[] }[]) {
      if (dto.lineIds && !dto.lineIds.includes(l.id)) continue;
      const planned = l.productionOrders.filter((p) => !['CANCELLED', 'CLOSED'].includes(p.status)).reduce((s, p) => s + (p.quantityPlanned - p.quantityCompleted), 0);
      const shortage = l.pendingQty - l.reservedQty - Math.max(0, l.availableQty) - planned;
      if (shortage <= 0) continue;
      created.push(await this.production.create({ itemId: l.itemId, quantity: Math.ceil(shortage), salesOrderLineId: l.id, dueDate: dto.dueDate ?? (so.requiredBy as unknown as string | undefined), warehouseId: so.warehouseId, remarks: `For sales order ${so.number}` }, actor));
    }
    return { created: created.map((p) => ({ id: p.id, number: p.number, quantityPlanned: p.quantityPlanned })), order: await this.order(id) };
  }

  async cancelOrder(id: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A reason is required');
    await this.prisma.tx(async (tx) => {
      const so = await this.lockOrder(tx, id);
      if (so.lines.some((l) => D(l.quantityFulfilled).gt(0))) throw Errors.invalidState('Goods were already dispatched; close the order instead');
      if (([SalesOrderStatus.CANCELLED, SalesOrderStatus.CLOSED] as SalesOrderStatus[]).includes(so.status)) throw Errors.invalidState(`Order is ${so.status.toLowerCase()}`);
      await this.ledger.release(tx, { sourceType: SO_SOURCE, sourceId: id, actor, reason: `Order cancelled: ${reason}`, referenceNumber: so.number });
      await tx.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason } });
      await this.audit.record({ action: 'sales_order.cancelled', entityType: 'SalesOrder', entityId: id, summary: `${so.number}: ${reason}`, actorId: actor.id }, tx);
    });
    return this.order(id);
  }

  async closeOrder(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const so = await this.lockOrder(tx, id);
      if (!([...OPEN_SO, SalesOrderStatus.FULFILLED] as SalesOrderStatus[]).includes(so.status)) throw Errors.invalidState(`Order is ${so.status.toLowerCase()}`);
      await this.ledger.release(tx, { sourceType: SO_SOURCE, sourceId: id, actor, reason: 'Order closed', referenceNumber: so.number });
      await tx.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.CLOSED } });
      await this.audit.record({ action: 'sales_order.closed', entityType: 'SalesOrder', entityId: id, summary: so.number, actorId: actor.id }, tx);
    });
    return this.order(id);
  }

  // ─── Delivery challans (stock out, partial fulfilment) ─

  async challans(q: { salesOrderId?: string; customerId?: string; status?: DocStatus; search?: string; skip: number; take: number }) {
    const where: Prisma.DeliveryChallanWhereInput = {
      salesOrderId: q.salesOrderId,
      customerId: q.customerId,
      status: q.status,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { customer: { companyName: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.deliveryChallan.findMany({ where, skip: q.skip, take: q.take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, companyName: true } }, salesOrder: { select: { id: true, number: true } }, _count: { select: { lines: true } } } }),
      this.prisma.deliveryChallan.count({ where }),
    ]);
    return { rows, total };
  }

  async challan(id: string) {
    const c = await this.prisma.deliveryChallan.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: { select: { id: true, number: true, customerPoNumber: true, orderDate: true } },
        lines: { include: { item: { select: { id: true, code: true, name: true, hsnCode: true, uom: { select: { code: true } } } }, salesOrderLine: { select: { unitPrice: true, discountPct: true, taxRate: true, quantity: true } } } },
      },
    });
    if (!c) throw Errors.notFound('Challan', id);
    return serialize(c);
  }

  async createChallan(dto: { salesOrderId: string; challanDate?: string; vehicleNo?: string; transporter?: string; remarks?: string; post?: boolean; lines: { salesOrderLineId: string; quantity: number; locationId?: string; batchId?: string }[] }, actor: AuthUser, idempotencyKey?: string) {
    const so = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId }, include: { lines: true } });
    if (!so) throw Errors.notFound('Sales order', dto.salesOrderId);
    if (!OPEN_SO.includes(so.status)) throw Errors.invalidState('Only confirmed, unfulfilled orders can be dispatched');
    for (const l of dto.lines) {
      const sol = so.lines.find((x) => x.id === l.salesOrderLineId);
      if (!sol) throw Errors.validation('Line does not belong to this order');
      if (!(l.quantity > 0)) throw Errors.validation('Quantities must be positive');
    }
    const c = await this.prisma.deliveryChallan.create({
      data: {
        number: await this.sequences.next('challan'),
        salesOrderId: so.id,
        customerId: so.customerId,
        warehouseId: so.warehouseId,
        challanDate: dto.challanDate ? new Date(dto.challanDate) : undefined,
        vehicleNo: dto.vehicleNo,
        transporter: dto.transporter,
        remarks: dto.remarks,
        createdById: actor.id,
        lines: { create: dto.lines.map((l) => ({ salesOrderLineId: l.salesOrderLineId, itemId: so.lines.find((x) => x.id === l.salesOrderLineId)!.itemId, quantity: q4(l.quantity), locationId: l.locationId, batchId: l.batchId })) },
      },
    });
    await this.audit.record({ action: 'challan.created', entityType: 'DeliveryChallan', entityId: c.id, summary: c.number, after: dto });
    if (dto.post) return this.postChallan(c.id, actor, idempotencyKey);
    return this.challan(c.id);
  }

  /** Post: stock leaves (consuming the SO reservation first), order lines are fulfilled. */
  async postChallan(id: string, actor: AuthUser, idempotencyKey?: string) {
    const itemIds: string[] = [];
    await this.ledger.runIdempotent(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "DeliveryChallan" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) throw Errors.notFound('Challan', id);
      if (locked[0].status === DocStatus.POSTED) return null;
      if (locked[0].status !== DocStatus.DRAFT) throw Errors.invalidState('Challan is cancelled');
      const c = await tx.deliveryChallan.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const so = await this.lockOrder(tx, c.salesOrderId);
      if (!OPEN_SO.includes(so.status)) throw Errors.invalidState(`Sales order is ${so.status.toLowerCase()}`);
      const ledgerLines: LedgerLine[] = [];
      for (const l of c.lines) {
        const sol = so.lines.find((x) => x.id === l.salesOrderLineId)!;
        const pending = D(sol.quantity).minus(sol.quantityFulfilled);
        if (D(l.quantity).gt(pending)) throw Errors.rule('OVER_DISPATCH', `Dispatch of ${l.quantity} exceeds pending ${pending} for line ${sol.lineNo}`);
        if (l.locationId) {
          // explicit pick location: consume own reservation there first, else free stock
          const open = await tx.stockReservation.findMany({ where: { sourceType: SO_SOURCE, sourceId: so.id, sourceLineId: sol.id, locationId: l.locationId, status: { in: ['ACTIVE', 'PARTIALLY_CONSUMED'] } } });
          let remaining = D(l.quantity);
          for (const r of open) {
            const take = Decimal.min(D(r.quantity).minus(r.consumedQty).minus(r.releasedQty), remaining);
            if (take.lte(0)) continue;
            await tx.stockReservation.update({ where: { id: r.id }, data: { consumedQty: { increment: take }, status: D(r.consumedQty).plus(take).plus(r.releasedQty).gte(r.quantity) ? 'CONSUMED' : 'PARTIALLY_CONSUMED' } });
            ledgerLines.push({ itemId: l.itemId, locationId: l.locationId, batchId: r.batchId, bucket: StockBucket.RESERVED, quantity: take.neg(), reservationId: r.id });
            ledgerLines.push({ itemId: l.itemId, locationId: l.locationId, batchId: r.batchId, quantity: take.neg() });
            remaining = remaining.minus(take);
          }
          if (remaining.gt(0)) ledgerLines.push({ itemId: l.itemId, locationId: l.locationId, batchId: l.batchId ?? null, quantity: remaining.neg() });
        } else {
          const cons = await this.ledger.buildConsumption(tx, { itemId: l.itemId, warehouseId: so.warehouseId, quantity: D(l.quantity), sourceType: SO_SOURCE, sourceId: so.id, sourceLineId: sol.id });
          ledgerLines.push(...cons.lines);
        }
        await tx.salesOrderLine.update({ where: { id: sol.id }, data: { quantityFulfilled: { increment: l.quantity } } });
        sol.quantityFulfilled = D(sol.quantityFulfilled).plus(l.quantity);
        itemIds.push(l.itemId);
      }
      const { transaction } = await this.ledger.post(tx, {
        type: InventoryTxType.SALES_DISPATCH,
        referenceType: 'DeliveryChallan',
        referenceId: c.id,
        referenceNumber: c.number,
        reason: `Dispatch against ${so.number}`,
        lines: ledgerLines,
        actor,
        idempotencyKey,
      });
      const fulfilled = so.lines.every((l) => D(l.quantityFulfilled).gte(l.quantity));
      await tx.salesOrder.update({ where: { id: so.id }, data: { status: fulfilled ? SalesOrderStatus.FULFILLED : SalesOrderStatus.PARTIALLY_FULFILLED } });
      await tx.deliveryChallan.update({ where: { id }, data: { status: DocStatus.POSTED, postedAt: new Date(), inventoryTxId: transaction.id } });
      if (fulfilled) await this.ledger.release(tx, { sourceType: SO_SOURCE, sourceId: so.id, actor, reason: 'Order fulfilled', referenceNumber: so.number });
      await this.audit.record({ action: 'challan.posted', entityType: 'DeliveryChallan', entityId: id, summary: `${c.number} for ${so.number}` }, tx);
      return null;
    });
    this.inventory.emitChanged(itemIds);
    return this.challan(id);
  }

  /** Cancel a challan. A posted challan is reversed: stock returns and fulfilment is reduced. */
  async cancelChallan(id: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A reason is required');
    const itemIds: string[] = [];
    await this.ledger.runIdempotent(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "DeliveryChallan" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) throw Errors.notFound('Challan', id);
      const c = await tx.deliveryChallan.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (c.status === DocStatus.CANCELLED) throw Errors.invalidState('Challan is already cancelled');
      if (c.status === DocStatus.POSTED && c.inventoryTxId) {
        const so = await this.lockOrder(tx, c.salesOrderId);
        const orig = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: c.inventoryTxId }, include: { movements: true } });
        const lines = orig.movements.filter((m) => m.bucket === StockBucket.ON_HAND).map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId, quantity: D(m.quantity).neg() }));
        await this.ledger.post(tx, { type: InventoryTxType.REVERSAL, reversalOfId: orig.id, referenceType: 'DeliveryChallan', referenceId: c.id, referenceNumber: c.number, reason: `Challan cancelled: ${reason}`, lines, actor });
        await tx.inventoryTransaction.update({ where: { id: orig.id }, data: { status: 'REVERSED' } });
        for (const l of c.lines) {
          await tx.salesOrderLine.update({ where: { id: l.salesOrderLineId }, data: { quantityFulfilled: { decrement: l.quantity } } });
          itemIds.push(l.itemId);
        }
        const fresh = await tx.salesOrderLine.findMany({ where: { salesOrderId: so.id } });
        const any = fresh.some((l) => D(l.quantityFulfilled).gt(0));
        const all = fresh.every((l) => D(l.quantityFulfilled).gte(l.quantity));
        await tx.salesOrder.update({ where: { id: so.id }, data: { status: all ? SalesOrderStatus.FULFILLED : any ? SalesOrderStatus.PARTIALLY_FULFILLED : SalesOrderStatus.CONFIRMED } });
      }
      await tx.deliveryChallan.update({ where: { id }, data: { status: DocStatus.CANCELLED, remarks: [c.remarks, `Cancelled: ${reason}`].filter(Boolean).join('\n') } });
      await this.audit.record({ action: 'challan.cancelled', entityType: 'DeliveryChallan', entityId: id, summary: `${c.number}: ${reason}` }, tx);
      return null;
    });
    this.inventory.emitChanged(itemIds);
    return this.challan(id);
  }
}
