import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InspectionStatus, InspectionType, InventoryTxType, LocationType, Prisma, QcCheckType, QcScope } from '@prisma/client';
import { D, q4, serialize, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryLedgerService, LedgerLine } from '../inventory/ledger.service';
import { SequenceService } from '../settings/sequence.service';

export interface ChecklistInput {
  name: string;
  description?: string;
  appliesTo?: QcScope;
  itemId?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  isActive?: boolean;
  items: { label: string; type?: QcCheckType; minValue?: number; maxValue?: number; unit?: string; isRequired?: boolean }[];
}

export interface CompleteInspectionInput {
  quantityAccepted: number;
  quantityRejected: number;
  quantityRework?: number;
  remarks?: string;
  results?: { checklistItemId: string; passed?: boolean; numericValue?: number; textValue?: string; note?: string }[];
  defects?: { defectCategoryId: string; quantity: number; note?: string }[];
}

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly inventory: InventoryService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Defect categories ─────────────────────────────────

  defectCategories(includeInactive = false) {
    return this.prisma.defectCategory.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } });
  }

  async upsertDefectCategory(id: string | null, dto: { code?: string; name: string; description?: string; appliesTo?: QcScope; isActive?: boolean }) {
    if (id) return this.prisma.defectCategory.update({ where: { id }, data: { ...dto, code: undefined } });
    if (!dto.code) throw Errors.validation('code is required');
    const d = await this.prisma.defectCategory.create({ data: { ...dto, code: dto.code.toUpperCase() } as Prisma.DefectCategoryCreateInput });
    await this.audit.record({ action: 'defect_category.created', entityType: 'DefectCategory', entityId: d.id, after: d });
    return d;
  }

  // ─── Checklists ───────────────────────────────────────

  checklists() {
    return this.prisma.qcChecklist.findMany({ orderBy: { name: 'asc' }, include: { items: { orderBy: { sequence: 'asc' } } } });
  }

  async upsertChecklist(id: string | null, dto: ChecklistInput) {
    if (!dto.items.length) throw Errors.validation('A checklist needs at least one check');
    for (const it of dto.items) {
      if (it.type === 'NUMERIC' && it.minValue !== undefined && it.maxValue !== undefined && it.minValue > it.maxValue) throw Errors.validation(`${it.label}: min exceeds max`);
    }
    const cid = await this.prisma.$transaction(async (tx) => {
      const data = { name: dto.name, description: dto.description, appliesTo: dto.appliesTo ?? QcScope.PRODUCT, itemId: dto.itemId, productId: dto.productId, categoryId: dto.categoryId, isActive: dto.isActive };
      let cid = id;
      if (id) {
        await tx.qcChecklist.update({ where: { id }, data });
        await tx.qcChecklistItem.deleteMany({ where: { checklistId: id } });
      } else cid = (await tx.qcChecklist.create({ data })).id;
      await tx.qcChecklistItem.createMany({
        data: dto.items.map((it, i) => ({ checklistId: cid!, sequence: i + 1, label: it.label, type: it.type ?? QcCheckType.PASS_FAIL, minValue: it.minValue, maxValue: it.maxValue, unit: it.unit, isRequired: it.isRequired ?? true })),
      });
      await this.audit.record({ action: id ? 'checklist.updated' : 'checklist.created', entityType: 'QcChecklist', entityId: cid!, after: dto }, tx);
      return cid!;
    });
    return this.prisma.qcChecklist.findUniqueOrThrow({ where: { id: cid }, include: { items: { orderBy: { sequence: 'asc' } } } });
  }

  /** Most specific active checklist: item → product → category → generic for the scope. */
  async checklistFor(itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw Errors.notFound('Item', itemId);
    const scope = item.type === 'MATERIAL' ? QcScope.MATERIAL : QcScope.PRODUCT;
    const candidates = await this.prisma.qcChecklist.findMany({
      where: {
        isActive: true,
        appliesTo: { in: [scope, QcScope.BOTH] },
        OR: [{ itemId: item.id }, ...(item.productId ? [{ productId: item.productId }] : []), ...(item.categoryId ? [{ categoryId: item.categoryId }] : []), { itemId: null, productId: null, categoryId: null }],
      },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    const rank = (c: (typeof candidates)[number]) => (c.itemId ? 0 : c.productId ? 1 : c.categoryId ? 2 : 3);
    return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? null;
  }

  // ─── Inspections ──────────────────────────────────────

  async list(q: { status?: InspectionStatus; type?: InspectionType; itemId?: string; productionOrderId?: string; from?: Date; to?: Date; skip: number; take: number }) {
    const where: Prisma.QualityInspectionWhereInput = {
      status: q.status,
      type: q.type,
      itemId: q.itemId,
      productionOrderId: q.productionOrderId,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.qualityInspection.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { createdAt: 'desc' },
        include: { item: { select: { id: true, code: true, name: true } }, inspector: { select: { id: true, name: true } }, productionOrder: { select: { id: true, number: true } } },
      }),
      this.prisma.qualityInspection.count({ where }),
    ]);
    return { rows: serialize(rows), total };
  }

  async get(id: string) {
    const i = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } },
        inspector: { select: { id: true, name: true } },
        productionOrder: { select: { id: true, number: true } },
        checklist: { include: { items: { orderBy: { sequence: 'asc' } } } },
        results: true,
        defects: { include: { defectCategory: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!i) throw Errors.notFound('Inspection', id);
    let grn = null;
    if (i.goodsReceiptLineId) {
      grn = await this.prisma.goodsReceiptLine.findUnique({ where: { id: i.goodsReceiptLineId }, select: { id: true, goodsReceipt: { select: { id: true, number: true, supplier: { select: { name: true } } } } } });
    }
    return serialize({ ...i, goodsReceiptLine: grn });
  }

  /** Create a pending inspection (also used by GRN for materials that require inspection). */
  async createPending(
    db: Tx,
    dto: { type: InspectionType; itemId: string; quantity: number | Prisma.Decimal; goodsReceiptLineId?: string; productionOrderId?: string; inspectorId?: string; remarks?: string },
    actor: AuthUser,
  ) {
    const checklist = await this.checklistFor(dto.itemId);
    const insp = await db.qualityInspection.create({
      data: {
        number: await this.sequences.next('inspection', db),
        type: dto.type,
        status: InspectionStatus.PENDING,
        itemId: dto.itemId,
        goodsReceiptLineId: dto.goodsReceiptLineId,
        productionOrderId: dto.productionOrderId,
        checklistId: checklist?.id,
        inspectorId: dto.inspectorId,
        quantityInspected: dto.quantity,
        remarks: dto.remarks,
        createdById: actor.id === 'system' ? null : actor.id,
      },
    });
    this.events.emit('quality.inspection_pending', { inspectionId: insp.id, number: insp.number, inspectorId: dto.inspectorId });
    return insp;
  }

  async createManual(dto: { type: InspectionType; itemId: string; quantity: number; productionOrderId?: string; inspectorId?: string; remarks?: string }, actor: AuthUser) {
    if (dto.type === InspectionType.MATERIAL_RECEIPT) throw Errors.validation('Material receipt inspections are created from goods receipts');
    const insp = await this.prisma.$transaction((tx) => this.createPending(tx, dto, actor));
    await this.audit.record({ action: 'inspection.created', entityType: 'QualityInspection', entityId: insp.id, summary: insp.number });
    return this.get(insp.id);
  }

  async assign(id: string, inspectorId: string | null) {
    const i = await this.prisma.qualityInspection.update({ where: { id }, data: { inspectorId } });
    await this.audit.record({ action: 'inspection.assigned', entityType: 'QualityInspection', entityId: id, metadata: { inspectorId } });
    if (inspectorId) this.events.emit('quality.inspection_pending', { inspectionId: i.id, number: i.number, inspectorId });
    return this.get(id);
  }

  async start(id: string, actor: AuthUser) {
    const r = await this.prisma.qualityInspection.updateMany({ where: { id, status: InspectionStatus.PENDING }, data: { status: InspectionStatus.IN_PROGRESS, startedAt: new Date(), inspectorId: actor.id } });
    if (!r.count) throw Errors.invalidState('Only pending inspections can be started');
    return this.get(id);
  }

  /**
   * Complete an inspection. For material receipts the held stock is dispositioned:
   * accepted → storage, rejected → REJECTED location (never saleable/usable).
   */
  async complete(id: string, dto: CompleteInspectionInput, actor: AuthUser) {
    const accepted = q4(dto.quantityAccepted);
    const rejected = q4(dto.quantityRejected);
    const rework = q4(dto.quantityRework ?? 0);
    if (accepted.lt(0) || rejected.lt(0) || rework.lt(0)) throw Errors.validation('Quantities cannot be negative');
    const touched: string[] = [];
    await this.ledger.runIdempotent(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "QualityInspection" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) throw Errors.notFound('Inspection', id);
      const insp = await tx.qualityInspection.findUniqueOrThrow({ where: { id }, include: { checklist: { include: { items: true } } } });
      if (!([InspectionStatus.PENDING, InspectionStatus.IN_PROGRESS] as InspectionStatus[]).includes(insp.status)) throw Errors.invalidState('Inspection is already closed');
      if (insp.checklist) {
        for (const ci of insp.checklist.items.filter((c) => c.isRequired)) {
          const r = dto.results?.find((x) => x.checklistItemId === ci.id);
          const answered = r && (r.passed !== undefined || r.numericValue !== undefined || (r.textValue ?? '').trim() !== '');
          if (!answered) throw Errors.validation(`Checklist item "${ci.label}" is required`);
        }
      }
      if ((dto.defects ?? []).reduce((s, d) => s.plus(D(d.quantity)), ZERO).gt(rejected.plus(rework))) throw Errors.validation('Defect quantities exceed rejected + rework');

      if (insp.type === InspectionType.MATERIAL_RECEIPT && insp.goodsReceiptLineId) {
        const line = await tx.goodsReceiptLine.findUniqueOrThrow({ where: { id: insp.goodsReceiptLineId }, include: { goodsReceipt: true } });
        if (!accepted.plus(rejected).eq(line.baseQuantity)) {
          throw Errors.validation(`Accepted + rejected must equal the received quantity (${line.baseQuantity})`);
        }
        const wh = line.goodsReceipt.warehouseId;
        const lines: LedgerLine[] = [];
        if (accepted.gt(0)) {
          const target = await this.inventory.defaultLocation(tx, wh);
          lines.push({ itemId: line.itemId, locationId: line.locationId, batchId: line.batchId, quantity: accepted.neg() }, { itemId: line.itemId, locationId: target.id, batchId: line.batchId, quantity: accepted });
        }
        if (rejected.gt(0)) {
          const rej = await this.inventory.locationOfType(tx, wh, LocationType.REJECTED);
          lines.push({ itemId: line.itemId, locationId: line.locationId, batchId: line.batchId, quantity: rejected.neg() }, { itemId: line.itemId, locationId: rej.id, batchId: line.batchId, quantity: rejected });
        }
        if (lines.length) {
          await this.ledger.post(tx, {
            type: InventoryTxType.QC_DISPOSITION,
            referenceType: 'QualityInspection',
            referenceId: insp.id,
            referenceNumber: insp.number,
            reason: `Inspection ${insp.number}: accepted ${accepted}, rejected ${rejected}`,
            lines,
            actor,
          });
          touched.push(line.itemId);
        }
        await tx.goodsReceiptLine.update({ where: { id: line.id }, data: { quantityAccepted: accepted, quantityRejected: rejected } });
        if (line.purchaseOrderLineId && rejected.gt(0)) {
          const factor = line.baseQuantity.isZero() ? D(1) : D(line.quantity).div(line.baseQuantity);
          await tx.purchaseOrderLine.update({ where: { id: line.purchaseOrderLineId }, data: { quantityRejected: { increment: q4(rejected.mul(factor)) } } });
        }
      }

      await tx.qualityInspection.update({
        where: { id },
        data: {
          status: InspectionStatus.COMPLETED,
          quantityInspected: accepted.plus(rejected).plus(rework),
          quantityAccepted: accepted,
          quantityRejected: rejected,
          quantityRework: rework,
          remarks: dto.remarks,
          inspectorId: insp.inspectorId ?? actor.id,
          startedAt: insp.startedAt ?? new Date(),
          completedAt: new Date(),
          results: dto.results?.length
            ? { create: dto.results.map((r) => ({ checklistItemId: r.checklistItemId, passed: r.passed, numericValue: r.numericValue, textValue: r.textValue, note: r.note })) }
            : undefined,
          defects: dto.defects?.length ? { create: dto.defects.map((d) => ({ defectCategoryId: d.defectCategoryId, quantity: d.quantity, note: d.note })) } : undefined,
        },
      });
      await this.audit.record({ action: 'inspection.completed', entityType: 'QualityInspection', entityId: id, summary: `${insp.number}: accepted ${accepted}, rejected ${rejected}, rework ${rework}` }, tx);
      return null;
    });
    this.inventory.emitChanged(touched);
    return this.get(id);
  }

  async cancel(id: string, reason: string) {
    const insp = await this.prisma.qualityInspection.findUnique({ where: { id } });
    if (!insp) throw Errors.notFound('Inspection', id);
    if (insp.type === InspectionType.MATERIAL_RECEIPT) throw Errors.rule('CANNOT_CANCEL', 'Receipt inspections must be completed to release held stock');
    const r = await this.prisma.qualityInspection.updateMany({ where: { id, status: { in: [InspectionStatus.PENDING, InspectionStatus.IN_PROGRESS] } }, data: { status: InspectionStatus.CANCELLED, remarks: reason } });
    if (!r.count) throw Errors.invalidState('Inspection is already closed');
    await this.audit.record({ action: 'inspection.cancelled', entityType: 'QualityInspection', entityId: id, summary: reason });
    return this.get(id);
  }

  /** Quality history summary per item for a period. */
  async summary(q: { from: Date; to: Date; itemId?: string }) {
    const rows = await this.prisma.qualityInspection.groupBy({
      by: ['itemId', 'type'],
      where: { status: InspectionStatus.COMPLETED, completedAt: { gte: q.from, lte: q.to }, itemId: q.itemId },
      _sum: { quantityInspected: true, quantityAccepted: true, quantityRejected: true, quantityRework: true },
      _count: { _all: true },
    });
    const items = await this.prisma.item.findMany({ where: { id: { in: rows.map((r) => r.itemId) } }, select: { id: true, code: true, name: true } });
    const defects = await this.prisma.qualityInspectionDefect.groupBy({
      by: ['defectCategoryId'],
      where: { inspection: { status: InspectionStatus.COMPLETED, completedAt: { gte: q.from, lte: q.to }, itemId: q.itemId } },
      _sum: { quantity: true },
    });
    const cats = await this.prisma.defectCategory.findMany({ where: { id: { in: defects.map((d) => d.defectCategoryId) } } });
    return {
      byItem: rows.map((r) => {
        const inspected = Number(r._sum.quantityInspected ?? 0);
        return {
          item: items.find((i) => i.id === r.itemId),
          type: r.type,
          inspections: r._count._all,
          inspected,
          accepted: Number(r._sum.quantityAccepted ?? 0),
          rejected: Number(r._sum.quantityRejected ?? 0),
          rework: Number(r._sum.quantityRework ?? 0),
          rejectionRate: inspected ? Number(r._sum.quantityRejected ?? 0) / inspected : null,
        };
      }),
      byDefect: defects.map((d) => ({ defectCategory: cats.find((c) => c.id === d.defectCategoryId), quantity: Number(d._sum.quantity ?? 0) })).sort((a, b) => b.quantity - a.quantity),
    };
  }
}
