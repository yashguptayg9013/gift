import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  InspectionStatus,
  InspectionType,
  InventoryTxType,
  ItemType,
  LocationType,
  Prisma,
  Priority,
  ProductionStatus,
  StageStatus,
  StockBucket,
} from '@prisma/client';
import { D, Decimal, q4, q4up, serialize, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission, RequestContextStore } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BomService } from '../bom/bom.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryLedgerService, LedgerLine } from '../inventory/ledger.service';
import { SequenceService } from '../settings/sequence.service';
import { SettingsService } from '../settings/settings.service';

export const PO_SOURCE = 'PRODUCTION_ORDER';
const ACTIVE: ProductionStatus[] = [ProductionStatus.RELEASED, ProductionStatus.MATERIALS_RESERVED, ProductionStatus.IN_PROGRESS];
const OPEN_STAGE: StageStatus[] = [StageStatus.PENDING, StageStatus.IN_PROGRESS, StageStatus.PAUSED];

export interface CreateOrderInput {
  itemId: string;
  quantity: number;
  priority?: Priority;
  dueDate?: string;
  plannedStart?: string;
  warehouseId?: string;
  outputLocationId?: string;
  remarks?: string;
  salesOrderLineId?: string;
  parameters?: Record<string, number>;
}

export interface OutputInput {
  qtyGood: number;
  qtyRejected?: number;
  qtyRework?: number;
  workerId?: string;
  defectCategoryId?: string;
  remarks?: string;
  startedAt?: string;
  endedAt?: string;
  idempotencyKey?: string;
  checklistId?: string;
  checklistResults?: { checklistItemId: string; passed?: boolean; numericValue?: number; textValue?: string; note?: string }[];
  defects?: { defectCategoryId: string; quantity: number; note?: string }[];
}

type OrderWithStages = Prisma.ProductionOrderGetPayload<{ include: { stages: { include: { assignments: true } }; materials: true } }>;
type Stage = OrderWithStages['stages'][number];

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly inventory: InventoryService,
    private readonly boms: BomService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── helpers ───────────────────────────────────────────────────────

  private async lockOrder(tx: Tx, id: string): Promise<OrderWithStages> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ProductionOrder" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw Errors.notFound('Production order', id);
    return tx.productionOrder.findUniqueOrThrow({
      where: { id },
      include: { stages: { include: { assignments: true }, orderBy: { sequence: 'asc' } }, materials: true },
    });
  }

  private async event(tx: Tx, orderId: string, type: string, data: { stageId?: string; quantity?: Decimal | number; workerId?: string | null; message?: string; payload?: unknown; actor: AuthUser }) {
    await tx.productionEvent.create({
      data: {
        productionOrderId: orderId,
        stageId: data.stageId,
        type,
        quantity: data.quantity !== undefined ? D(data.quantity) : undefined,
        workerId: data.workerId ?? undefined,
        message: data.message,
        payload: data.payload === undefined ? undefined : (JSON.parse(JSON.stringify(serialize(data.payload))) as Prisma.InputJsonValue),
        createdById: data.actor.id === 'system' ? null : data.actor.id,
        actorType: RequestContextStore.get()?.actorType ?? ActorType.USER,
      },
    });
  }

  private assertActive(order: { status: ProductionStatus; number: string }) {
    if (!ACTIVE.includes(order.status)) throw Errors.invalidState(`Production order ${order.number} is ${order.status.toLowerCase().replace('_', ' ')}`);
  }

  /** Workers may only act on stages they are assigned to; supervisors on any. */
  private assertStageAccess(actor: AuthUser, stage: Stage) {
    if (hasPermission(actor, 'production.stage.update.any')) return;
    if (hasPermission(actor, 'production.stage.update.own') && actor.workerId && stage.assignments.some((a) => a.workerId === actor.workerId)) return;
    throw Errors.forbidden('You can only update production stages assigned to you');
  }

  /** Previous non-skipped stage. */
  private previousStage(order: OrderWithStages, stage: Stage) {
    return [...order.stages].filter((s) => s.sequence < stage.sequence && s.status !== StageStatus.SKIPPED && s.status !== StageStatus.CANCELLED).pop() ?? null;
  }

  private nextStage(order: OrderWithStages, stage: Stage) {
    return order.stages.find((s) => s.sequence > stage.sequence && s.status !== StageStatus.SKIPPED && s.status !== StageStatus.CANCELLED) ?? null;
  }

  private isLastStage(order: OrderWithStages, stage: Stage) {
    return !this.nextStage(order, stage);
  }

  private async stageInput(order: OrderWithStages, stage: Stage): Promise<Decimal> {
    const prev = this.previousStage(order, stage);
    if (prev) return D(prev.qtyGood);
    const { overProductionPercent } = await this.settings.get('production');
    return D(order.quantityPlanned).mul(D(1).plus(D(overProductionPercent).div(100)));
  }

  private async outputLocation(tx: Tx, order: { outputLocationId: string | null; warehouseId: string }) {
    if (order.outputLocationId) return tx.location.findUniqueOrThrow({ where: { id: order.outputLocationId } });
    return this.inventory.defaultLocation(tx, order.warehouseId);
  }

  // ─── create / update / release ─────────────────────────────────────

  async create(dto: CreateOrderInput, actor: AuthUser) {
    if (!(dto.quantity > 0)) throw Errors.validation('Quantity must be greater than zero');
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item || item.type !== ItemType.PRODUCT) throw Errors.validation('Select a finished-goods SKU');
    if (!item.isActive || item.status === 'DISCONTINUED') throw Errors.validation(`${item.code} is not active`);
    const warehouseId = dto.warehouseId ?? (await this.inventory.defaultLocation(this.prisma)).warehouseId;
    if (dto.outputLocationId) {
      const loc = await this.prisma.location.findUnique({ where: { id: dto.outputLocationId } });
      if (!loc || loc.warehouseId !== warehouseId || loc.type !== LocationType.STORAGE) throw Errors.validation('Output location must be a storage location in the order warehouse');
    }
    const order = await this.prisma.tx(async (tx) => {
      const o = await tx.productionOrder.create({
        data: {
          number: await this.sequences.next('production_order', tx),
          itemId: item.id,
          warehouseId,
          outputLocationId: dto.outputLocationId,
          quantityPlanned: q4(dto.quantity),
          priority: dto.priority ?? Priority.NORMAL,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
          remarks: dto.remarks,
          salesOrderLineId: dto.salesOrderLineId,
          parameters: (dto.parameters ?? {}) as Prisma.InputJsonValue,
          createdById: actor.id,
        },
      });
      await this.event(tx, o.id, 'CREATED', { quantity: o.quantityPlanned, actor, message: `Planned ${dto.quantity} × ${item.code}` });
      await this.audit.record({ action: 'production.created', entityType: 'ProductionOrder', entityId: o.id, summary: `${o.number} ${item.code} × ${dto.quantity}`, after: o }, tx);
      return o;
    });
    return this.get(order.id);
  }

  async update(id: string, dto: Partial<CreateOrderInput>, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (([ProductionStatus.COMPLETED, ProductionStatus.CLOSED, ProductionStatus.CANCELLED] as ProductionStatus[]).includes(o.status)) throw Errors.invalidState('Order can no longer be edited');
      if (o.status !== ProductionStatus.DRAFT && (dto.quantity !== undefined || dto.itemId || dto.parameters || dto.warehouseId)) {
        throw Errors.invalidState('Quantity, SKU and parameters can only change while the order is a draft');
      }
      const data: Prisma.ProductionOrderUncheckedUpdateInput = {
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
        remarks: dto.remarks,
        quantityPlanned: dto.quantity !== undefined ? q4(dto.quantity) : undefined,
        parameters: dto.parameters as Prisma.InputJsonValue | undefined,
      };
      await tx.productionOrder.update({ where: { id }, data });
      await this.audit.record({ action: 'production.updated', entityType: 'ProductionOrder', entityId: id, before: { priority: o.priority, dueDate: o.dueDate, quantityPlanned: o.quantityPlanned, remarks: o.remarks }, after: dto }, tx);
      await this.event(tx, id, 'UPDATED', { actor, payload: dto });
    });
    return this.get(id);
  }

  /** Freeze BOM version and route; create material requirements and stage rows. */
  async release(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (o.status !== ProductionStatus.DRAFT) throw Errors.invalidState('Only draft orders can be released');
      const item = await tx.item.findUniqueOrThrow({ where: { id: o.itemId }, include: { product: true, bom: { include: { versions: { where: { status: 'ACTIVE' } } } } } });
      const version = item.bom?.versions[0];
      if (!version) throw Errors.rule('NO_ACTIVE_BOM', `${item.code} has no active BOM version`);
      const routeId = item.routeId ?? item.product?.defaultRouteId;
      if (!routeId) throw Errors.rule('NO_ROUTE', `${item.code} has no manufacturing route. Assign a route to the SKU or its product.`);
      const route = await tx.route.findUniqueOrThrow({ where: { id: routeId }, include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: true } } } });
      if (!route.isActive || !route.steps.length) throw Errors.rule('NO_ROUTE', `Route ${route.code} is inactive or has no steps`);

      const req = await this.boms.computeRequirements(version.id, Number(o.quantityPlanned), { db: tx, parameters: o.parameters as Record<string, number>, withAvailability: false });
      const routeStageIds = route.steps.map((s) => s.stageDefinitionId);
      for (const l of req.lines) {
        if (l.stageDefinitionId && !routeStageIds.includes(l.stageDefinitionId)) {
          throw Errors.rule('STAGE_NOT_IN_ROUTE', `BOM line ${l.lineNo} (${l.material.code}) is consumed at ${l.stage?.name}, which is not part of route ${route.code}`);
        }
      }
      await tx.productionMaterial.createMany({
        data: req.lines.map((l) => ({
          productionOrderId: id,
          bomLineId: l.bomLineId,
          itemId: l.materialId,
          stageDefinitionId: l.stageDefinitionId ?? routeStageIds[0],
          consumptionMode: l.consumptionMode,
          qtyPerUnit: l.qtyPerUnit,
          wastagePercent: l.wastagePercent,
          requiredQty: l.requiredQty,
          uomCode: l.uom,
        })),
      });
      await tx.productionOrderStage.createMany({
        data: route.steps.map((s) => ({
          productionOrderId: id,
          sequence: s.sequence,
          stageDefinitionId: s.stageDefinitionId,
          workstationId: s.workstationId,
          isQcStage: s.stageDefinition.isQcStage,
          instructions: s.instructions,
        })),
      });
      await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.RELEASED, bomVersionId: version.id, routeId, parameters: req.variables as Prisma.InputJsonValue } });
      await this.event(tx, id, 'RELEASED', { actor, message: `BOM v${version.version}, route ${route.code}`, payload: { bomVersionId: version.id, routeId } });
      await this.audit.record({ action: 'production.released', entityType: 'ProductionOrder', entityId: id, summary: o.number }, tx);
    });
    return this.get(id);
  }

  // ─── materials ─────────────────────────────────────────────────────

  async availability(id: string) {
    const o = await this.prisma.productionOrder.findUnique({ where: { id }, include: { materials: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } } } } });
    if (!o) throw Errors.notFound('Production order', id);
    const bomLines = await this.prisma.bomLine.findMany({
      where: { id: { in: o.materials.map((m) => m.bomLineId).filter((x): x is string => !!x) } },
      include: { alternatives: { include: { material: { select: { id: true, code: true, name: true } } }, orderBy: { priority: 'asc' } } },
    });
    const lines = [];
    for (const m of o.materials) {
      const remaining = Decimal.max(0, D(m.requiredQty).minus(m.consumedQty));
      const toReserve = Decimal.max(0, remaining.minus(m.reservedQty));
      const free = await this.ledger.availableQty(this.prisma, m.itemId, o.warehouseId);
      const alts = [];
      for (const a of bomLines.find((b) => b.id === m.bomLineId)?.alternatives ?? []) {
        alts.push({ materialId: a.materialId, material: a.material, conversionFactor: Number(a.conversionFactor), available: Number(await this.ledger.availableQty(this.prisma, a.materialId, o.warehouseId)) });
      }
      lines.push({
        id: m.id,
        item: m.item,
        stageDefinitionId: m.stageDefinitionId,
        consumptionMode: m.consumptionMode,
        requiredQty: Number(m.requiredQty),
        reservedQty: Number(m.reservedQty),
        consumedQty: Number(m.consumedQty),
        wastageQty: Number(m.wastageQty),
        remainingQty: Number(remaining),
        toReserve: Number(toReserve),
        freeAvailable: Number(free),
        shortage: Number(Decimal.max(0, toReserve.minus(free))),
        status: toReserve.isZero() ? 'COVERED' : free.gte(toReserve) ? 'AVAILABLE' : free.gt(0) ? 'PARTIAL' : 'SHORT',
        alternatives: alts,
      });
    }
    return { orderId: id, number: o.number, status: o.status, allCovered: lines.every((l) => l.status === 'COVERED'), canReserveAll: lines.every((l) => l.shortage === 0), lines };
  }

  /** Reserve outstanding requirement (partial allowed). Reservation is not consumption. */
  async reserveMaterials(id: string, actor: AuthUser) {
    const summary = await this.ledger.runIdempotent(async (tx) => {
      const o = await this.lockOrder(tx, id);
      this.assertActive(o);
      const results: { itemId: string; reserved: number; shortage: number }[] = [];
      let allCovered = true;
      for (const m of o.materials) {
        const need = Decimal.max(0, D(m.requiredQty).minus(m.consumedQty).minus(m.reservedQty));
        if (need.isZero()) continue;
        const r = await this.ledger.reserve(tx, { itemId: m.itemId, warehouseId: o.warehouseId, quantity: need, sourceType: PO_SOURCE, sourceId: o.id, sourceLineId: m.id, referenceNumber: o.number, allowPartial: true, actor });
        if (r.reserved.gt(0)) await tx.productionMaterial.update({ where: { id: m.id }, data: { reservedQty: { increment: r.reserved } } });
        if (r.reserved.lt(need)) allCovered = false;
        results.push({ itemId: m.itemId, reserved: Number(r.reserved), shortage: Number(need.minus(r.reserved)) });
      }
      if (allCovered && o.status === ProductionStatus.RELEASED) await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.MATERIALS_RESERVED } });
      await this.event(tx, id, 'MATERIALS_RESERVED', { actor, message: allCovered ? 'All materials reserved' : 'Partially reserved — shortages remain', payload: results });
      return { allCovered, results };
    });
    this.inventory.emitChanged(summary.results.map((r) => r.itemId));
    return { ...summary, order: await this.get(id) };
  }

  async releaseReservations(id: string, actor: AuthUser, reason = 'Released by user') {
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      await this.releaseAll(tx, o, actor, reason);
      if (o.status === ProductionStatus.MATERIALS_RESERVED) await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.RELEASED } });
    });
    return this.get(id);
  }

  private async releaseAll(tx: Tx, o: OrderWithStages, actor: AuthUser, reason: string) {
    const released = await this.ledger.release(tx, { sourceType: PO_SOURCE, sourceId: o.id, actor, reason, referenceNumber: o.number });
    for (const m of o.materials) if (D(m.reservedQty).gt(0)) await tx.productionMaterial.update({ where: { id: m.id }, data: { reservedQty: 0 } });
    if (released.gt(0)) {
      await this.event(tx, o.id, 'RESERVATION_RELEASED', { actor, quantity: released, message: reason });
      this.inventory.emitChanged(o.materials.map((m) => m.itemId));
    }
  }

  /** Swap a requirement line to one of its BOM alternatives (before any consumption). */
  async substitute(id: string, materialLineId: string, alternativeMaterialId: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      this.assertActive(o);
      const m = o.materials.find((x) => x.id === materialLineId);
      if (!m) throw Errors.notFound('Material line', materialLineId);
      if (D(m.consumedQty).gt(0)) throw Errors.invalidState('Material already consumed; issue the alternative manually instead');
      const alt = m.bomLineId ? await tx.bomLineAlternative.findFirst({ where: { bomLineId: m.bomLineId, materialId: alternativeMaterialId } }) : null;
      if (!alt) throw Errors.validation('Not a configured alternative for this BOM line');
      if (D(m.reservedQty).gt(0)) {
        await this.ledger.release(tx, { sourceType: PO_SOURCE, sourceId: id, sourceLineId: m.id, actor, reason: 'Material substitution', referenceNumber: o.number });
      }
      const factor = D(alt.conversionFactor);
      await tx.productionMaterial.update({
        where: { id: m.id },
        data: { itemId: alternativeMaterialId, originalItemId: m.originalItemId ?? m.itemId, qtyPerUnit: D(m.qtyPerUnit).mul(factor), requiredQty: q4up(D(m.requiredQty).mul(factor)), reservedQty: 0 },
      });
      const altItem = await tx.item.findUniqueOrThrow({ where: { id: alternativeMaterialId }, include: { uom: true } });
      await tx.productionMaterial.update({ where: { id: m.id }, data: { uomCode: altItem.uom.code } });
      await this.event(tx, id, 'MATERIAL_SUBSTITUTED', { actor, message: `Substituted with ${altItem.code}`, payload: { materialLineId, from: m.itemId, to: alternativeMaterialId, factor: Number(factor) } });
      if (o.status === ProductionStatus.MATERIALS_RESERVED) await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.RELEASED } });
    });
    return this.get(id);
  }

  /** Consume material for a requirement line (manual issue or wastage). */
  async consumeForLine(id: string, dto: { materialLineId: string; quantity: number; reason?: string; stageId?: string; wastage?: boolean; idempotencyKey?: string }, actor: AuthUser) {
    if (!(dto.quantity > 0)) throw Errors.validation('Quantity must be positive');
    if (dto.wastage && !dto.reason?.trim()) throw Errors.validation('A reason is required when reporting wastage');
    let itemId = '';
    await this.ledger.runIdempotent(
      async (tx) => {
        const o = await this.lockOrder(tx, id);
        this.assertActive(o);
        const m = o.materials.find((x) => x.id === dto.materialLineId);
        if (!m) throw Errors.notFound('Material line', dto.materialLineId);
        itemId = m.itemId;
        const qty = q4(dto.quantity);
        const c = await this.ledger.buildConsumption(tx, { itemId: m.itemId, warehouseId: o.warehouseId, quantity: qty, sourceType: PO_SOURCE, sourceId: o.id, sourceLineId: m.id });
        const { transaction } = await this.ledger.post(tx, {
          type: InventoryTxType.PRODUCTION_CONSUMPTION,
          referenceType: PO_SOURCE,
          referenceId: o.id,
          referenceNumber: o.number,
          reason: dto.wastage ? `Wastage: ${dto.reason}` : (dto.reason ?? 'Material issue'),
          lines: c.lines,
          actor,
          idempotencyKey: dto.idempotencyKey,
        });
        await tx.productionMaterial.update({
          where: { id: m.id },
          data: { consumedQty: { increment: qty }, reservedQty: { decrement: c.fromReservation }, ...(dto.wastage ? { wastageQty: { increment: qty } } : {}) },
        });
        await this.event(tx, id, dto.wastage ? 'WASTAGE_REPORTED' : 'MATERIAL_ISSUED', { actor, stageId: dto.stageId, quantity: qty, message: dto.reason, payload: { materialLineId: m.id, itemId: m.itemId, transactionId: transaction.id } });
        return null;
      },
      async () => null,
    );
    this.inventory.emitChanged([itemId]);
    return this.get(id);
  }

  /** Return unused consumed material to stock. Allowed on active and cancelled orders. */
  async returnMaterial(id: string, dto: { materialLineId: string; quantity: number; locationId?: string; reason?: string; idempotencyKey?: string }, actor: AuthUser) {
    if (!(dto.quantity > 0)) throw Errors.validation('Quantity must be positive');
    let itemId = '';
    await this.ledger.runIdempotent(
      async (tx) => {
        const o = await this.lockOrder(tx, id);
        if (o.status === ProductionStatus.DRAFT) throw Errors.invalidState('Nothing has been issued for a draft order');
        const m = o.materials.find((x) => x.id === dto.materialLineId);
        if (!m) throw Errors.notFound('Material line', dto.materialLineId);
        itemId = m.itemId;
        const qty = q4(dto.quantity);
        if (qty.gt(m.consumedQty)) throw Errors.validation(`Cannot return more than consumed (${m.consumedQty})`);
        const loc = dto.locationId ? { id: dto.locationId } : await this.inventory.defaultLocation(tx, o.warehouseId);
        const { transaction } = await this.ledger.post(tx, {
          type: InventoryTxType.PRODUCTION_RETURN,
          referenceType: PO_SOURCE,
          referenceId: o.id,
          referenceNumber: o.number,
          reason: dto.reason ?? 'Unused material returned',
          lines: [{ itemId: m.itemId, locationId: loc.id, quantity: qty }],
          actor,
          idempotencyKey: dto.idempotencyKey,
        });
        await tx.productionMaterial.update({ where: { id: m.id }, data: { consumedQty: { decrement: qty }, returnedQty: { increment: qty } } });
        await this.event(tx, id, 'MATERIAL_RETURNED', { actor, quantity: qty, message: dto.reason, payload: { materialLineId: m.id, transactionId: transaction.id } });
        return null;
      },
      async () => null,
    );
    this.inventory.emitChanged([itemId]);
    return this.get(id);
  }

  // ─── stage actions ─────────────────────────────────────────────────

  private async loadStage(tx: Tx, stageId: string) {
    const s = await tx.productionOrderStage.findUnique({ where: { id: stageId }, select: { productionOrderId: true } });
    if (!s) throw Errors.notFound('Production stage', stageId);
    const order = await this.lockOrder(tx, s.productionOrderId);
    return { order, stage: order.stages.find((x) => x.id === stageId)! };
  }

  private async doStart(tx: Tx, order: OrderWithStages, stage: Stage, actor: AuthUser) {
    const prev = this.previousStage(order, stage);
    if (prev && !([StageStatus.COMPLETED, StageStatus.SKIPPED] as StageStatus[]).includes(prev.status) && D(prev.qtyGood).lte(0)) {
      throw Errors.rule('PREVIOUS_STAGE_NOT_STARTED', 'The previous stage has not produced any output yet');
    }
    const now = new Date();
    const pausedSeconds = stage.status === StageStatus.PAUSED && stage.pausedAt ? Math.round((now.getTime() - stage.pausedAt.getTime()) / 1000) : 0;
    await tx.productionOrderStage.update({
      where: { id: stage.id },
      data: { status: StageStatus.IN_PROGRESS, startedAt: stage.startedAt ?? now, pausedAt: null, pausedSeconds: { increment: pausedSeconds } },
    });
    if (order.status !== ProductionStatus.IN_PROGRESS) await tx.productionOrder.update({ where: { id: order.id }, data: { status: ProductionStatus.IN_PROGRESS, startedAt: order.startedAt ?? now } });
    await this.event(tx, order.id, stage.status === StageStatus.PAUSED ? 'STAGE_RESUMED' : 'STAGE_STARTED', { actor, stageId: stage.id });
    stage.status = StageStatus.IN_PROGRESS;
  }

  async startStage(stageId: string, actor: AuthUser) {
    const orderId = await this.prisma.tx(async (tx) => {
      const { order, stage } = await this.loadStage(tx, stageId);
      this.assertStageAccess(actor, stage);
      this.assertActive(order);
      if (!([StageStatus.PENDING, StageStatus.PAUSED] as StageStatus[]).includes(stage.status)) throw Errors.invalidState(`Stage is ${stage.status.toLowerCase()}`);
      await this.doStart(tx, order, stage, actor);
      return order.id;
    });
    return this.get(orderId);
  }

  async pauseStage(stageId: string, reason: string | undefined, actor: AuthUser) {
    const orderId = await this.prisma.tx(async (tx) => {
      const { order, stage } = await this.loadStage(tx, stageId);
      this.assertStageAccess(actor, stage);
      if (stage.status !== StageStatus.IN_PROGRESS) throw Errors.invalidState('Only an in-progress stage can be paused');
      await tx.productionOrderStage.update({ where: { id: stageId }, data: { status: StageStatus.PAUSED, pausedAt: new Date() } });
      await this.event(tx, order.id, 'STAGE_PAUSED', { actor, stageId, message: reason });
      return order.id;
    });
    return this.get(orderId);
  }

  /**
   * Record production at a stage. Backflushes BOM materials assigned to this stage,
   * receives finished goods at the final stage (rejects go to the non-saleable
   * REJECTED location), and records an inspection for QC stages.
   */
  async recordOutput(stageId: string, dto: OutputInput, actor: AuthUser) {
    const good = q4(dto.qtyGood ?? 0);
    const rejected = q4(dto.qtyRejected ?? 0);
    const rework = q4(dto.qtyRework ?? 0);
    if (good.lt(0) || rejected.lt(0) || rework.lt(0)) throw Errors.validation('Quantities cannot be negative');
    if (good.plus(rejected).plus(rework).isZero()) throw Errors.validation('Enter a good, rejected or rework quantity');
    if (dto.defects?.length) {
      const defectTotal = dto.defects.reduce((s, d) => s.plus(D(d.quantity)), ZERO);
      if (defectTotal.gt(rejected.plus(rework))) throw Errors.validation('Defect quantities exceed rejected + rework');
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.productionOutput.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { replayed: true, output: serialize(existing), order: await this.get(existing.productionOrderId) };
    }
    const touched: string[] = [];
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const { order, stage } = await this.loadStage(tx, stageId);
        this.assertStageAccess(actor, stage);
        this.assertActive(order);
        if (stage.status === StageStatus.PAUSED) throw Errors.invalidState('Resume the stage before recording output');
        if (!OPEN_STAGE.includes(stage.status)) throw Errors.invalidState(`Stage is ${stage.status.toLowerCase()}`);
        if (stage.status === StageStatus.PENDING) await this.doStart(tx, order, stage, actor);

        let workerId = dto.workerId ?? actor.workerId ?? null;
        if (!hasPermission(actor, 'production.stage.update.any') && workerId !== actor.workerId) throw Errors.forbidden('Workers can only record their own output');
        if (workerId) {
          const w = await tx.worker.findUnique({ where: { id: workerId } });
          if (!w || !w.isActive) throw Errors.validation('Worker not found or inactive');
        } else workerId = null;

        const input = await this.stageInput(order, stage);
        const processedSoFar = D(stage.qtyGood).plus(stage.qtyRejected);
        const processed = good.plus(rejected);
        if (processedSoFar.plus(processed).gt(input)) {
          throw Errors.rule('QUANTITY_EXCEEDS_INPUT', `Only ${input.minus(processedSoFar).toString()} unit(s) are available to process at this stage`, {
            input: Number(input),
            processed: Number(processedSoFar),
          });
        }

        const output = await tx.productionOutput.create({
          data: {
            productionOrderId: order.id,
            stageId,
            workerId,
            qtyGood: good,
            qtyRejected: rejected,
            qtyRework: rework,
            defectCategoryId: dto.defectCategoryId,
            startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
            endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
            remarks: dto.remarks,
            recordedById: actor.id,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        // Backflush materials consumed at this stage.
        const txIds: string[] = [];
        const consumption: { materialLineId: string; itemId: string; quantity: number; fromReservation: number }[] = [];
        if (processed.gt(0)) {
          const lines: LedgerLine[] = [];
          for (const m of order.materials.filter((x) => x.stageDefinitionId === stage.stageDefinitionId && x.consumptionMode === 'BACKFLUSH')) {
            const qty = q4up(D(m.qtyPerUnit).mul(processed));
            if (qty.isZero()) continue;
            const c = await this.ledger.buildConsumption(tx, { itemId: m.itemId, warehouseId: order.warehouseId, quantity: qty, sourceType: PO_SOURCE, sourceId: order.id, sourceLineId: m.id });
            lines.push(...c.lines);
            consumption.push({ materialLineId: m.id, itemId: m.itemId, quantity: Number(qty), fromReservation: Number(c.fromReservation) });
            await tx.productionMaterial.update({ where: { id: m.id }, data: { consumedQty: { increment: qty }, reservedQty: { decrement: c.fromReservation } } });
            touched.push(m.itemId);
          }
          if (lines.length) {
            const r = await this.ledger.post(tx, {
              type: InventoryTxType.PRODUCTION_CONSUMPTION,
              referenceType: PO_SOURCE,
              referenceId: order.id,
              referenceNumber: order.number,
              reason: `Backflush at stage ${stage.sequence}`,
              lines,
              actor,
            });
            txIds.push(r.transaction.id);
          }
        }

        // Finished goods receipt at the final stage.
        const last = this.isLastStage(order, stage);
        if (last && (good.gt(0) || rejected.gt(0))) {
          const fgLines: LedgerLine[] = [];
          if (good.gt(0)) fgLines.push({ itemId: order.itemId, locationId: (await this.outputLocation(tx, order)).id, quantity: good });
          if (rejected.gt(0)) fgLines.push({ itemId: order.itemId, locationId: (await this.inventory.locationOfType(tx, order.warehouseId, LocationType.REJECTED)).id, quantity: rejected });
          const r = await this.ledger.post(tx, {
            type: InventoryTxType.PRODUCTION_OUTPUT,
            referenceType: PO_SOURCE,
            referenceId: order.id,
            referenceNumber: order.number,
            reason: rejected.gt(0) ? 'Finished goods receipt (rejects to REJECTED location)' : 'Finished goods receipt',
            lines: fgLines,
            actor,
          });
          txIds.push(r.transaction.id);
          touched.push(order.itemId);
        }

        // QC stage → inspection record.
        let inspectionId: string | null = null;
        if (stage.isQcStage) {
          const insp = await tx.qualityInspection.create({
            data: {
              number: await this.sequences.next('inspection', tx),
              type: last ? InspectionType.FINAL : InspectionType.IN_PROCESS,
              status: InspectionStatus.COMPLETED,
              itemId: order.itemId,
              productionOrderId: order.id,
              productionStageId: stage.id,
              checklistId: dto.checklistId,
              inspectorId: actor.id === 'system' ? null : actor.id,
              quantityInspected: good.plus(rejected).plus(rework),
              quantityAccepted: good,
              quantityRejected: rejected,
              quantityRework: rework,
              remarks: dto.remarks,
              startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
              completedAt: new Date(),
              createdById: actor.id === 'system' ? null : actor.id,
              results: dto.checklistResults?.length
                ? { create: dto.checklistResults.map((r) => ({ checklistItemId: r.checklistItemId, passed: r.passed, numericValue: r.numericValue, textValue: r.textValue, note: r.note })) }
                : undefined,
              defects: dto.defects?.length ? { create: dto.defects.map((d) => ({ defectCategoryId: d.defectCategoryId, quantity: d.quantity, note: d.note })) } : undefined,
            },
          });
          inspectionId = insp.id;
        }

        await tx.productionOutput.update({ where: { id: output.id }, data: { inventoryTxIds: txIds, consumption, inspectionId } });
        await tx.productionOrderStage.update({ where: { id: stageId }, data: { qtyGood: { increment: good }, qtyRejected: { increment: rejected }, qtyRework: { increment: rework } } });
        await tx.productionOrder.update({
          where: { id: order.id },
          data: { quantityRejected: { increment: rejected }, quantityRework: { increment: rework }, ...(last ? { quantityCompleted: { increment: good } } : {}) },
        });
        await this.event(tx, order.id, 'OUTPUT_RECORDED', {
          actor,
          stageId,
          workerId,
          quantity: good,
          message: `Good ${good}, rejected ${rejected}, rework ${rework}`,
          payload: { outputId: output.id, good, rejected, rework, transactions: txIds },
        });

        // Auto-complete the stage once all available input is processed and upstream is finished.
        const prev = this.previousStage(order, stage);
        const upstreamDone = !prev || ([StageStatus.COMPLETED, StageStatus.SKIPPED] as StageStatus[]).includes(prev.status);
        const plannedInput = prev ? input : D(order.quantityPlanned);
        if (upstreamDone && processedSoFar.plus(processed).gte(plannedInput)) {
          const fresh = await tx.productionOrderStage.findUniqueOrThrow({ where: { id: stageId }, include: { assignments: true } });
          await this.doComplete(tx, order, fresh, actor, 'Auto-completed: all input processed');
        }
        return output.id;
      },
      async () => (await this.prisma.productionOutput.findUniqueOrThrow({ where: { idempotencyKey: dto.idempotencyKey! } })).id,
    );
    this.inventory.emitChanged(touched);
    const output = await this.prisma.productionOutput.findUniqueOrThrow({ where: { id: result } });
    return { replayed: false, output: serialize(output), order: await this.get(output.productionOrderId) };
  }

  private async doComplete(tx: Tx, order: OrderWithStages, stage: Stage, actor: AuthUser, message?: string) {
    const prev = this.previousStage(order, stage);
    if (prev && !([StageStatus.COMPLETED, StageStatus.SKIPPED] as StageStatus[]).includes(prev.status)) {
      throw Errors.rule('PREVIOUS_STAGE_OPEN', 'Complete the previous stage first');
    }
    await tx.productionOrderStage.update({ where: { id: stage.id }, data: { status: StageStatus.COMPLETED, completedAt: new Date() } });
    stage.status = StageStatus.COMPLETED;
    const input = await this.stageInput(order, stage);
    const processed = D(stage.qtyGood).plus(stage.qtyRejected);
    const shortfall = Decimal.max(0, (prev ? input : D(order.quantityPlanned)).minus(processed));
    await this.event(tx, order.id, 'STAGE_COMPLETED', { actor, stageId: stage.id, quantity: stage.qtyGood, message: message ?? (shortfall.gt(0) ? `Completed with shortfall of ${shortfall}` : undefined) });
    const stageDef = await tx.stageDefinition.findUnique({ where: { id: stage.stageDefinitionId }, select: { name: true } });
    this.events.emit('production.stage_completed', { orderId: order.id, number: order.number, stageName: stageDef?.name, good: Number(stage.qtyGood) });
    if (this.isLastStage(order, stage)) await this.completeOrder(tx, order, actor);
  }

  private async completeOrder(tx: Tx, order: OrderWithStages, actor: AuthUser) {
    await this.releaseAll(tx, order, actor, 'Order completed — unused reservations released');
    await tx.productionOrder.update({ where: { id: order.id }, data: { status: ProductionStatus.COMPLETED, completedAt: new Date() } });
    await this.event(tx, order.id, 'COMPLETED', { actor });
    await this.audit.record({ action: 'production.completed', entityType: 'ProductionOrder', entityId: order.id, summary: order.number }, tx);
    this.events.emit('production.completed', { orderId: order.id, number: order.number });
  }

  async completeStage(stageId: string, remarks: string | undefined, actor: AuthUser) {
    const orderId = await this.prisma.tx(async (tx) => {
      const { order, stage } = await this.loadStage(tx, stageId);
      this.assertStageAccess(actor, stage);
      this.assertActive(order);
      if (!OPEN_STAGE.includes(stage.status)) throw Errors.invalidState(`Stage is ${stage.status.toLowerCase()}`);
      if (remarks) await tx.productionOrderStage.update({ where: { id: stageId }, data: { remarks } });
      await this.doComplete(tx, order, stage, actor, remarks);
      return order.id;
    });
    return this.get(orderId);
  }

  async skipStage(stageId: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A reason is required to skip a stage');
    const orderId = await this.prisma.tx(async (tx) => {
      const { order, stage } = await this.loadStage(tx, stageId);
      this.assertActive(order);
      if (stage.status !== StageStatus.PENDING || D(stage.qtyGood).plus(stage.qtyRejected).gt(0)) throw Errors.invalidState('Only a pending stage without output can be skipped');
      if (this.isLastStage(order, stage)) throw Errors.rule('CANNOT_SKIP_LAST', 'The final stage cannot be skipped (it receives finished goods)');
      await tx.productionOrderStage.update({ where: { id: stageId }, data: { status: StageStatus.SKIPPED, remarks: reason } });
      await this.event(tx, order.id, 'STAGE_SKIPPED', { actor, stageId, message: reason });
      return order.id;
    });
    return this.get(orderId);
  }

  async assignWorkers(stageId: string, workerIds: string[], actor: AuthUser) {
    const orderId = await this.prisma.tx(async (tx) => {
      const { order } = await this.loadStage(tx, stageId);
      if (([ProductionStatus.CLOSED, ProductionStatus.CANCELLED] as ProductionStatus[]).includes(order.status)) throw Errors.invalidState('Order is closed');
      const workers = await tx.worker.findMany({ where: { id: { in: workerIds }, isActive: true } });
      if (workers.length !== new Set(workerIds).size) throw Errors.validation('One or more workers are inactive or unknown');
      await tx.stageAssignment.deleteMany({ where: { stageId, workerId: { notIn: workerIds } } });
      for (const w of workerIds) {
        await tx.stageAssignment.upsert({ where: { stageId_workerId: { stageId, workerId: w } }, create: { stageId, workerId: w, assignedById: actor.id }, update: {} });
      }
      await this.event(tx, order.id, 'WORKERS_ASSIGNED', { actor, stageId, message: workers.map((w) => w.name).join(', ') || 'Unassigned', payload: { workerIds } });
      return order.id;
    });
    return this.get(orderId);
  }

  async setWorkstation(stageId: string, workstationId: string | null, actor: AuthUser) {
    const orderId = await this.prisma.tx(async (tx) => {
      const { order } = await this.loadStage(tx, stageId);
      await tx.productionOrderStage.update({ where: { id: stageId }, data: { workstationId } });
      await this.event(tx, order.id, 'WORKSTATION_ASSIGNED', { actor, stageId, payload: { workstationId } });
      return order.id;
    });
    return this.get(orderId);
  }

  async addRemark(id: string, message: string, stageId: string | undefined, actor: AuthUser) {
    if (!message?.trim()) throw Errors.validation('Remark cannot be empty');
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (stageId) {
        const stage = o.stages.find((s) => s.id === stageId);
        if (!stage) throw Errors.notFound('Stage', stageId);
        this.assertStageAccess(actor, stage);
      } else if (!hasPermission(actor, 'production.stage.update.any')) throw Errors.forbidden();
      await this.event(tx, id, 'REMARK', { actor, stageId, message: message.trim().slice(0, 2000) });
    });
    return this.get(id);
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A cancellation reason is required');
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (([ProductionStatus.COMPLETED, ProductionStatus.CLOSED, ProductionStatus.CANCELLED] as ProductionStatus[]).includes(o.status)) {
        throw Errors.invalidState(`A ${o.status.toLowerCase()} order cannot be cancelled`);
      }
      await this.releaseAll(tx, o, actor, `Order cancelled: ${reason}`);
      await tx.productionOrderStage.updateMany({ where: { productionOrderId: id, status: { in: OPEN_STAGE } }, data: { status: StageStatus.CANCELLED } });
      await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason } });
      const consumed = o.materials.filter((m) => D(m.consumedQty).gt(0)).length;
      await this.event(tx, id, 'CANCELLED', { actor, message: reason + (consumed ? ` — ${consumed} material line(s) already consumed; return unused material if physically available` : '') });
      await this.audit.record({ action: 'production.cancelled', entityType: 'ProductionOrder', entityId: id, summary: `${o.number}: ${reason}`, before: { status: o.status } }, tx);
    });
    return this.get(id);
  }

  async close(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (o.status !== ProductionStatus.COMPLETED) throw Errors.invalidState('Only completed orders can be closed');
      await this.releaseAll(tx, o, actor, 'Order closed');
      await tx.productionOrder.update({ where: { id }, data: { status: ProductionStatus.CLOSED, closedAt: new Date() } });
      await this.event(tx, id, 'CLOSED', { actor });
    });
    return this.get(id);
  }

  /**
   * Reverse a mistaken output entry: restores consumed material, reverses FG receipt,
   * and decrements stage/order quantities. Blocked if downstream stages already used it.
   */
  async reverseOutput(outputId: string, reason: string, actor: AuthUser) {
    if (!reason?.trim()) throw Errors.validation('A reason is required');
    const touched: string[] = [];
    const orderId = await this.ledger.runIdempotent(async (tx) => {
      const out0 = await tx.productionOutput.findUnique({ where: { id: outputId } });
      if (!out0) throw Errors.notFound('Production entry', outputId);
      const order = await this.lockOrder(tx, out0.productionOrderId);
      const out = await tx.productionOutput.findUniqueOrThrow({ where: { id: outputId } });
      if (out.reversedAt) throw Errors.invalidState('Entry is already reversed');
      if (([ProductionStatus.CLOSED, ProductionStatus.CANCELLED] as ProductionStatus[]).includes(order.status)) throw Errors.invalidState('Order is closed');
      const stage = order.stages.find((s) => s.id === out.stageId)!;
      const next = this.nextStage(order, stage);
      if (next) {
        const nextProcessed = D(next.qtyGood).plus(next.qtyRejected);
        if (nextProcessed.gt(D(stage.qtyGood).minus(out.qtyGood))) {
          throw Errors.rule('DOWNSTREAM_CONSUMED', 'The next stage has already processed these units. Reverse the downstream entries first.');
        }
      }
      // Reverse every ledger posting made by this entry (ON_HAND only; reservations are not restored).
      for (const txId of out.inventoryTxIds) {
        const orig = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: txId }, include: { movements: true } });
        const lines = orig.movements
          .filter((m) => m.bucket === StockBucket.ON_HAND)
          .map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId, quantity: D(m.quantity).neg() }));
        if (!lines.length) continue;
        lines.forEach((l) => touched.push(l.itemId));
        await this.ledger.post(tx, { type: InventoryTxType.REVERSAL, reversalOfId: orig.id, referenceType: PO_SOURCE, referenceId: order.id, referenceNumber: order.number, reason: `Reversal of production entry: ${reason}`, lines, actor });
        await tx.inventoryTransaction.update({ where: { id: orig.id }, data: { status: 'REVERSED' } });
      }
      for (const c of (out.consumption as { materialLineId: string; quantity: number }[]) ?? []) {
        await tx.productionMaterial.update({ where: { id: c.materialLineId }, data: { consumedQty: { decrement: c.quantity } } });
      }
      const last = this.isLastStage(order, stage);
      await tx.productionOrderStage.update({
        where: { id: stage.id },
        data: {
          qtyGood: { decrement: out.qtyGood },
          qtyRejected: { decrement: out.qtyRejected },
          qtyRework: { decrement: out.qtyRework },
          ...(stage.status === StageStatus.COMPLETED ? { status: StageStatus.IN_PROGRESS, completedAt: null } : {}),
        },
      });
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          quantityRejected: { decrement: out.qtyRejected },
          quantityRework: { decrement: out.qtyRework },
          ...(last ? { quantityCompleted: { decrement: out.qtyGood } } : {}),
          ...(order.status === ProductionStatus.COMPLETED ? { status: ProductionStatus.IN_PROGRESS, completedAt: null } : {}),
        },
      });
      if (out.inspectionId) await tx.qualityInspection.update({ where: { id: out.inspectionId }, data: { status: InspectionStatus.CANCELLED, remarks: `Reversed: ${reason}` } });
      await tx.productionOutput.update({ where: { id: outputId }, data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: reason } });
      await this.event(tx, order.id, 'OUTPUT_REVERSED', { actor, stageId: stage.id, quantity: out.qtyGood, message: reason, payload: { outputId } });
      await this.audit.record({ action: 'production.output_reversed', entityType: 'ProductionOutput', entityId: outputId, summary: `${order.number}: ${reason}` }, tx);
      return order.id;
    });
    this.inventory.emitChanged(touched);
    return this.get(orderId);
  }

  // ─── queries ───────────────────────────────────────────────────────

  async list(q: { status?: ProductionStatus[]; priority?: Priority; itemId?: string; search?: string; delayed?: boolean; dueFrom?: Date; dueTo?: Date; skip: number; take: number; sort?: string; order?: 'asc' | 'desc' }) {
    const now = new Date();
    const where: Prisma.ProductionOrderWhereInput = {
      status: q.delayed ? { in: ACTIVE.concat(ProductionStatus.DRAFT) } : q.status?.length ? { in: q.status } : undefined,
      priority: q.priority,
      itemId: q.itemId,
      dueDate: q.delayed ? { lt: now } : q.dueFrom || q.dueTo ? { gte: q.dueFrom, lte: q.dueTo } : undefined,
      ...(q.search
        ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { item: { code: { contains: q.search, mode: 'insensitive' } } }, { item: { name: { contains: q.search, mode: 'insensitive' } } }] }
        : {}),
    };
    const sortable = ['number', 'dueDate', 'createdAt', 'priority', 'status'];
    const [rows, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.sort && sortable.includes(q.sort) ? { [q.sort]: q.order ?? 'asc' } : [{ createdAt: 'desc' }],
        include: {
          item: { select: { id: true, code: true, name: true, variantName: true } },
          stages: { select: { id: true, sequence: true, status: true, qtyGood: true, stageDefinition: { select: { name: true } } }, orderBy: { sequence: 'asc' } },
        },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return {
      rows: serialize(
        rows.map((o) => {
          const current = o.stages.find((s) => s.status === 'IN_PROGRESS' || s.status === 'PAUSED') ?? o.stages.find((s) => s.status === 'PENDING');
          return {
            ...o,
            stages: undefined,
            stageCount: o.stages.length,
            stagesCompleted: o.stages.filter((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length,
            currentStage: current ? { id: current.id, name: current.stageDefinition.name, status: current.status } : null,
            isDelayed: !!o.dueDate && o.dueDate < now && !(['COMPLETED', 'CLOSED', 'CANCELLED'] as ProductionStatus[]).includes(o.status),
            progress: Number(o.quantityPlanned) ? Math.min(1, Number(o.quantityCompleted) / Number(o.quantityPlanned)) : 0,
          };
        }),
      ),
      total,
    };
  }

  async get(id: string) {
    const o = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, code: true, name: true, variantName: true, attributes: true, uom: { select: { code: true } } } },
        bomVersion: { select: { id: true, version: true, bom: { select: { id: true, code: true } } } },
        materials: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } }, orderBy: { id: 'asc' } },
        stages: {
          orderBy: { sequence: 'asc' },
          include: {
            stageDefinition: { select: { id: true, code: true, name: true, isQcStage: true } },
            workstation: { select: { id: true, code: true, name: true } },
            assignments: { include: { worker: { select: { id: true, code: true, name: true } } } },
          },
        },
        outputs: { orderBy: { recordedAt: 'desc' }, include: { worker: { select: { id: true, name: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 200 },
      },
    });
    if (!o) throw Errors.notFound('Production order', id);
    const userIds = [...new Set([...o.events.map((e) => e.createdById), ...o.outputs.map((x) => x.recordedById), o.createdById].filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? null;
    const route = o.routeId ? await this.prisma.route.findUnique({ where: { id: o.routeId }, select: { id: true, code: true, name: true } }) : null;
    return serialize({
      ...o,
      route,
      createdByName: name(o.createdById),
      isDelayed: !!o.dueDate && o.dueDate < new Date() && !(['COMPLETED', 'CLOSED', 'CANCELLED'] as ProductionStatus[]).includes(o.status),
      outputs: o.outputs.map((x) => ({ ...x, recordedByName: name(x.recordedById) })),
      events: o.events.map((e) => ({ ...e, createdByName: name(e.createdById) })),
    });
  }

  /** Open stages for a worker (their own) or all open stages (supervisors). */
  async tasks(actor: AuthUser, opts: { workerId?: string; all?: boolean }) {
    const workerId = opts.all && hasPermission(actor, 'production.stage.update.any') ? opts.workerId : (actor.workerId ?? '__none__');
    const stages = await this.prisma.productionOrderStage.findMany({
      where: {
        status: { in: OPEN_STAGE },
        productionOrder: { status: { in: ACTIVE } },
        ...(workerId ? { assignments: { some: { workerId } } } : {}),
      },
      include: {
        stageDefinition: { select: { name: true, isQcStage: true } },
        workstation: { select: { name: true } },
        assignments: { include: { worker: { select: { id: true, name: true } } } },
        productionOrder: { select: { id: true, number: true, priority: true, dueDate: true, quantityPlanned: true, item: { select: { code: true, name: true } } } },
      },
      orderBy: [{ productionOrder: { dueDate: 'asc' } }, { sequence: 'asc' }],
      take: 300,
    });
    return serialize(stages);
  }
}
