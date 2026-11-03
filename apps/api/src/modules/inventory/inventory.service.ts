import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalType, InventoryTxStatus, InventoryTxType, ItemType, LocationType, Prisma, StockBucket, StockCountStatus } from '@prisma/client';
import { D, Decimal, q4, serialize, ZERO } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { assertPermission } from '../../common/guards/permissions.guard';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { SequenceService } from '../settings/sequence.service';
import { SettingsService } from '../settings/settings.service';
import { AVAILABLE_LOCATION_TYPES, InventoryLedgerService, LedgerLine } from './ledger.service';

export interface QtyLine {
  itemId: string;
  quantity: number | string;
  uomCode?: string;
  locationId?: string;
  batchId?: string | null;
  batchNumber?: string;
  unitCost?: number | string;
}

export interface MovementCommon {
  reason?: string;
  remarks?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  idempotencyKey?: string;
}

const MANUAL_REVERSIBLE: InventoryTxType[] = ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'DAMAGE', 'RETURN'];

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly approvals: ApprovalsService,
    private readonly settings: SettingsService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    this.approvals.register(ApprovalType.STOCK_ADJUSTMENT, async (payload, approver, req) => {
      assertPermission(approver, 'inventory.adjust.approve');
      const tx = await this.postAdjustment(payload as unknown as AdjustmentPayload, approver, { approvedById: approver.id, idempotencyKey: `approval:${req.id}` });
      return { entityType: 'InventoryTransaction', entityId: tx.id };
    });
    this.approvals.register(ApprovalType.STOCK_COUNT, async (payload, approver, req) => {
      assertPermission(approver, 'inventory.count.approve');
      const count = await this.postStockCount(String(payload.countId), approver, `approval:${req.id}`);
      return { entityType: 'StockCount', entityId: count.id };
    });
  }

  emitChanged(itemIds: string[]) {
    if (itemIds.length) this.events.emit('inventory.changed', { itemIds: [...new Set(itemIds)] });
  }

  // ─── Unit conversion ───────────────────────────────────────────────

  async toBase(db: Tx | PrismaService, itemId: string, quantity: Decimal, uomCode?: string) {
    const item = await db.item.findUnique({ where: { id: itemId }, include: { uom: true, uomConversions: true } });
    if (!item) throw Errors.notFound('Item', itemId);
    if (!uomCode || uomCode === item.uom.code) return { item, base: q4(quantity), factor: D(1) };
    const conv = item.uomConversions.find((c) => c.uomCode === uomCode);
    if (!conv) throw Errors.validation(`No conversion from ${uomCode} to ${item.uom.code} configured for ${item.code}`);
    return { item, base: q4(D(quantity).mul(conv.factorToBase)), factor: D(conv.factorToBase) };
  }

  async defaultLocation(db: Tx | PrismaService, warehouseId?: string) {
    const loc = await db.location.findFirst({
      where: { type: LocationType.STORAGE, isActive: true, ...(warehouseId ? { warehouseId } : {}) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!loc) throw Errors.rule('NO_STORAGE_LOCATION', 'No active storage location is configured');
    return loc;
  }

  async locationOfType(db: Tx | PrismaService, warehouseId: string, type: LocationType) {
    const loc = await db.location.findFirst({ where: { warehouseId, type, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!loc) throw Errors.rule('LOCATION_MISSING', `Warehouse has no active ${type} location`);
    return loc;
  }

  /** Find or create a batch; requires batch numbers for batch-tracked items. */
  async resolveBatch(tx: Tx, item: { id: string; code: string; trackBatches: boolean }, batchNumber?: string, extra?: { supplierId?: string; unitCost?: Decimal }) {
    if (!batchNumber) {
      if (item.trackBatches) throw Errors.validation(`Batch number is required for ${item.code}`);
      return null;
    }
    const b = await tx.batch.upsert({
      where: { itemId_batchNumber: { itemId: item.id, batchNumber: batchNumber.trim() } },
      create: { itemId: item.id, batchNumber: batchNumber.trim(), supplierId: extra?.supplierId, unitCost: extra?.unitCost },
      update: {},
    });
    return b.id;
  }

  // ─── Movements ─────────────────────────────────────────────────────

  async receive(dto: MovementCommon & { lines: QtyLine[]; type?: InventoryTxType }, actor: AuthUser) {
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const lines: LedgerLine[] = [];
        for (const l of dto.lines) {
          const { item, base } = await this.toBase(tx, l.itemId, D(l.quantity), l.uomCode);
          if (base.lte(0)) throw Errors.validation('Receipt quantity must be positive');
          const loc = l.locationId ? { id: l.locationId } : await this.defaultLocation(tx);
          const batchId = l.batchId ?? (await this.resolveBatch(tx, item, l.batchNumber, { unitCost: l.unitCost !== undefined ? D(l.unitCost) : undefined }));
          lines.push({ itemId: item.id, locationId: loc.id, batchId, quantity: base, unitCost: l.unitCost !== undefined ? D(l.unitCost) : null });
        }
        return this.ledger.post(tx, { ...dto, type: dto.type ?? InventoryTxType.RECEIPT, lines, actor, requestPayload: dto });
      },
      () => this.replay(dto.idempotencyKey!),
    );
    this.emitChanged(dto.lines.map((l) => l.itemId));
    return this.getTransaction(result.transaction.id);
  }

  async issue(dto: MovementCommon & { lines: QtyLine[]; warehouseId?: string; type?: InventoryTxType }, actor: AuthUser) {
    const type = dto.type ?? InventoryTxType.ISSUE;
    if ((type === 'DAMAGE' || type === 'ISSUE') && !dto.reason?.trim()) throw Errors.validation('A reason is required');
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const lines: LedgerLine[] = [];
        for (const l of dto.lines) {
          const { item, base } = await this.toBase(tx, l.itemId, D(l.quantity), l.uomCode);
          if (base.lte(0)) throw Errors.validation('Issue quantity must be positive');
          if (l.locationId) {
            lines.push({ itemId: item.id, locationId: l.locationId, batchId: l.batchId ?? null, quantity: base.neg() });
          } else {
            const wh = dto.warehouseId ?? (await this.defaultLocation(tx)).warehouseId;
            const allocations = await this.ledger.allocateAvailable(tx, { itemId: item.id, warehouseId: wh, quantity: base, batchId: l.batchId ?? undefined });
            for (const a of allocations) lines.push({ itemId: item.id, locationId: a.locationId, batchId: a.batchId, quantity: a.quantity.neg() });
          }
        }
        return this.ledger.post(tx, { ...dto, type, lines, actor, requestPayload: dto });
      },
      () => this.replay(dto.idempotencyKey!),
    );
    this.emitChanged(dto.lines.map((l) => l.itemId));
    return this.getTransaction(result.transaction.id);
  }

  async transfer(dto: MovementCommon & { fromLocationId: string; toLocationId: string; lines: QtyLine[] }, actor: AuthUser) {
    if (dto.fromLocationId === dto.toLocationId) throw Errors.validation('Source and destination locations must differ');
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const lines: LedgerLine[] = [];
        for (const l of dto.lines) {
          const { item, base } = await this.toBase(tx, l.itemId, D(l.quantity), l.uomCode);
          if (base.lte(0)) throw Errors.validation('Transfer quantity must be positive');
          lines.push({ itemId: item.id, locationId: dto.fromLocationId, batchId: l.batchId ?? null, quantity: base.neg() });
          lines.push({ itemId: item.id, locationId: dto.toLocationId, batchId: l.batchId ?? null, quantity: base });
        }
        // Moving stock out of a non-saleable REJECTED location into usable stock needs explicit permission.
        const [from, to] = await Promise.all([tx.location.findUniqueOrThrow({ where: { id: dto.fromLocationId } }), tx.location.findUniqueOrThrow({ where: { id: dto.toLocationId } })]);
        if (from.type === LocationType.REJECTED && AVAILABLE_LOCATION_TYPES.includes(to.type)) {
          assertPermission(actor, 'quality.rejection.release', 'Releasing rejected stock into usable inventory requires quality.rejection.release');
          if (!dto.reason?.trim()) throw Errors.validation('A reason is required to release rejected stock');
        }
        if (from.type === LocationType.QC_HOLD && AVAILABLE_LOCATION_TYPES.includes(to.type)) {
          assertPermission(actor, 'quality.inspect', 'Releasing stock from QC hold requires quality.inspect');
        }
        return this.ledger.post(tx, { ...dto, type: InventoryTxType.TRANSFER, lines, actor, requestPayload: dto });
      },
      () => this.replay(dto.idempotencyKey!),
    );
    this.emitChanged(dto.lines.map((l) => l.itemId));
    return this.getTransaction(result.transaction.id);
  }

  /**
   * Stock adjustment. Users holding inventory.adjust.approve post directly (unless the
   * settings force approval for everyone); everyone else creates an approval request.
   */
  async adjust(dto: AdjustmentPayload, actor: AuthUser, opts: { approvedById?: string } = {}) {
    if (!dto.reason?.trim()) throw Errors.validation('A reason is required for stock adjustments');
    for (const l of dto.lines) if (D(l.quantity).isZero()) throw Errors.validation('Adjustment quantity cannot be zero');
    const s = await this.settings.get('inventory');
    const direct = hasPermission(actor, 'inventory.adjust.approve') && !s.allAdjustmentsRequireApproval;
    if (!direct) {
      const items = await this.prisma.item.findMany({ where: { id: { in: dto.lines.map((l) => l.itemId) } }, select: { id: true, code: true, name: true } });
      const desc = dto.lines.map((l) => `${items.find((i) => i.id === l.itemId)?.code ?? l.itemId}: ${D(l.quantity).gt(0) ? '+' : ''}${l.quantity}`).join(', ');
      const req = await this.approvals.create({
        type: ApprovalType.STOCK_ADJUSTMENT,
        title: `Stock adjustment (${dto.lines.length} line${dto.lines.length > 1 ? 's' : ''})`,
        description: `${desc}. Reason: ${dto.reason}`,
        payload: JSON.parse(JSON.stringify(dto)),
        requiredPermission: 'inventory.adjust.approve',
        requestedBy: actor,
      });
      return { status: 'PENDING_APPROVAL' as const, approval: req };
    }
    const tx = await this.postAdjustment(dto, actor, { idempotencyKey: dto.idempotencyKey, approvedById: opts.approvedById });
    return { status: 'POSTED' as const, transaction: await this.getTransaction(tx.id) };
  }

  private async postAdjustment(dto: AdjustmentPayload, actor: AuthUser, opts: { approvedById?: string; idempotencyKey?: string }) {
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const lines: LedgerLine[] = [];
        for (const l of dto.lines) {
          const { item, base } = await this.toBase(tx, l.itemId, D(l.quantity), l.uomCode);
          const loc = l.locationId ? { id: l.locationId } : await this.defaultLocation(tx);
          let batchId = l.batchId ?? null;
          if (!batchId && l.batchNumber) batchId = await this.resolveBatch(tx, item, l.batchNumber);
          lines.push({ itemId: item.id, locationId: loc.id, batchId, quantity: base });
        }
        return this.ledger.post(tx, {
          type: InventoryTxType.ADJUSTMENT,
          reason: dto.reason,
          remarks: dto.remarks,
          lines,
          actor,
          approvedById: opts.approvedById,
          idempotencyKey: opts.idempotencyKey,
          requestPayload: dto,
        });
      },
      () => this.replay(opts.idempotencyKey!),
    );
    this.emitChanged(dto.lines.map((l) => l.itemId));
    this.events.emit('inventory.adjustment_posted', { transactionId: result.transaction.id, number: result.transaction.number, actorId: actor.id });
    return result.transaction;
  }

  private async replay(idempotencyKey: string) {
    const t = await this.prisma.inventoryTransaction.findUniqueOrThrow({ where: { idempotencyKey } });
    return { transaction: t, replayed: true };
  }

  /** Reverse a manual transaction by posting the negated movements. */
  async reverse(id: string, reason: string, actor: AuthUser, idempotencyKey?: string) {
    if (!reason?.trim()) throw Errors.validation('A reason is required to reverse a transaction');
    const result = await this.ledger.runIdempotent(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryTransaction" WHERE "id" = ${id} FOR UPDATE`;
        if (!locked.length) throw Errors.notFound('Inventory transaction', id);
        const orig = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id }, include: { movements: true, reversedBy: true } });
        if (orig.status === InventoryTxStatus.REVERSED || orig.reversedBy) throw Errors.invalidState('Transaction is already reversed');
        if (!MANUAL_REVERSIBLE.includes(orig.type) || (orig.referenceType && orig.referenceType !== 'MANUAL')) {
          throw Errors.rule('NOT_REVERSIBLE', 'Only manual receipts, issues, transfers, adjustments, damage and returns can be reversed here. Document-linked postings are reversed from their document.');
        }
        const lines: LedgerLine[] = orig.movements
          .filter((m) => m.bucket === StockBucket.ON_HAND)
          .map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId, quantity: D(m.quantity).neg(), unitCost: m.unitCost }));
        const res = await this.ledger.post(tx, {
          type: InventoryTxType.REVERSAL,
          reversalOfId: orig.id,
          referenceType: 'InventoryTransaction',
          referenceId: orig.id,
          referenceNumber: orig.number,
          reason,
          lines,
          actor,
          idempotencyKey,
          requestPayload: { id, reason },
        });
        await tx.inventoryTransaction.update({ where: { id: orig.id }, data: { status: InventoryTxStatus.REVERSED } });
        return res;
      },
      () => this.replay(idempotencyKey!),
    );
    const t = await this.getTransaction(result.transaction.id);
    this.emitChanged(t.movements.map((m) => m.itemId));
    return t;
  }

  // ─── Manual reservations ───────────────────────────────────────────

  async reserveManual(dto: { itemId: string; quantity: number; warehouseId?: string; remarks?: string; idempotencyKey?: string }, actor: AuthUser) {
    const wh = dto.warehouseId ?? (await this.defaultLocation(this.prisma)).warehouseId;
    const sourceId = dto.idempotencyKey ?? `manual-${Date.now()}`;
    const res = await this.ledger.runIdempotent(async (tx) =>
      this.ledger.reserve(tx, { itemId: dto.itemId, warehouseId: wh, quantity: q4(dto.quantity), sourceType: 'MANUAL', sourceId, referenceNumber: dto.remarks, actor, idempotencyKey: dto.idempotencyKey }),
    );
    this.emitChanged([dto.itemId]);
    return serialize(res);
  }

  async releaseReservation(reservationId: string, actor: AuthUser, quantity?: number) {
    const r = await this.prisma.stockReservation.findUnique({ where: { id: reservationId } });
    if (!r) throw Errors.notFound('Reservation', reservationId);
    if (r.sourceType !== 'MANUAL') assertPermission(actor, 'production.release', 'Document reservations are released from their document');
    const released = await this.ledger.runIdempotent((tx) =>
      this.ledger.release(tx, { sourceType: r.sourceType, sourceId: r.sourceId, sourceLineId: r.sourceLineId ?? undefined, itemId: r.itemId, quantity: quantity ? q4(quantity) : undefined, actor, reason: 'Manual release' }),
    );
    this.emitChanged([r.itemId]);
    return { released: Number(released) };
  }

  // ─── Stock counts (physical reconciliation) ────────────────────────

  async createStockCount(dto: { warehouseId: string; locationId?: string; categoryId?: string; itemIds?: string[]; remarks?: string }, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const balances = await tx.stockBalance.findMany({
        where: {
          warehouseId: dto.warehouseId,
          locationId: dto.locationId,
          item: { isActive: true, categoryId: dto.categoryId, ...(dto.itemIds?.length ? { id: { in: dto.itemIds } } : {}) },
          location: { type: { in: [LocationType.STORAGE, LocationType.PRODUCTION, LocationType.REJECTED, LocationType.QC_HOLD, LocationType.RECEIVING] } },
        },
      });
      // Include requested items that have no balance row yet (counted where none expected).
      const lines = balances.map((b) => ({ itemId: b.itemId, locationId: b.locationId, batchId: b.batchId, systemQty: b.onHand }));
      if (dto.itemIds?.length && dto.locationId) {
        for (const itemId of dto.itemIds) {
          if (!lines.some((l) => l.itemId === itemId && l.locationId === dto.locationId)) lines.push({ itemId, locationId: dto.locationId, batchId: null, systemQty: ZERO });
        }
      }
      if (!lines.length) throw Errors.validation('Nothing to count for the selected scope');
      const count = await tx.stockCount.create({
        data: {
          number: await this.sequences.next('stock_count', tx),
          warehouseId: dto.warehouseId,
          locationId: dto.locationId,
          remarks: dto.remarks,
          createdById: actor.id,
          lines: { create: lines },
        },
      });
      await this.audit.record({ action: 'stock_count.created', entityType: 'StockCount', entityId: count.id, summary: `${count.number} (${lines.length} lines)` }, tx);
      return this.getStockCount(count.id, tx);
    });
  }

  async getStockCount(id: string, db: Tx | PrismaService = this.prisma) {
    const c = await db.stockCount.findUnique({ where: { id }, include: { lines: true } });
    if (!c) throw Errors.notFound('Stock count', id);
    const items = await db.item.findMany({ where: { id: { in: c.lines.map((l) => l.itemId) } }, select: { id: true, code: true, name: true, uom: { select: { code: true } } } });
    const locs = await db.location.findMany({ where: { id: { in: c.lines.map((l) => l.locationId) } }, select: { id: true, code: true, name: true } });
    const batches = await db.batch.findMany({ where: { id: { in: c.lines.map((l) => l.batchId).filter((b): b is string => !!b) } }, select: { id: true, batchNumber: true } });
    return serialize({
      ...c,
      lines: c.lines.map((l) => ({
        ...l,
        item: items.find((i) => i.id === l.itemId),
        location: locs.find((x) => x.id === l.locationId),
        batch: batches.find((b) => b.id === l.batchId) ?? null,
        variance: l.countedQty === null ? null : D(l.countedQty).minus(l.systemQty),
      })),
    });
  }

  async recordCount(id: string, lines: { lineId: string; countedQty: number; remarks?: string }[]) {
    const c = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!c) throw Errors.notFound('Stock count', id);
    if (c.status !== StockCountStatus.DRAFT) throw Errors.invalidState('Counts can only be entered while counting is open');
    await this.prisma.$transaction(
      lines.map((l) => {
        if (l.countedQty < 0) throw Errors.validation('Counted quantity cannot be negative');
        return this.prisma.stockCountLine.update({ where: { id: l.lineId, countId: id }, data: { countedQty: q4(l.countedQty), remarks: l.remarks } });
      }),
    );
    return this.getStockCount(id);
  }

  async submitStockCount(id: string, actor: AuthUser) {
    const c = await this.prisma.stockCount.findUnique({ where: { id }, include: { lines: true } });
    if (!c) throw Errors.notFound('Stock count', id);
    if (c.status !== StockCountStatus.DRAFT) throw Errors.invalidState('Stock count was already submitted');
    if (c.lines.some((l) => l.countedQty === null)) throw Errors.validation('Enter a counted quantity for every line before submitting');
    const updated = await this.prisma.stockCount.updateMany({ where: { id, status: StockCountStatus.DRAFT }, data: { status: StockCountStatus.SUBMITTED, submittedAt: new Date() } });
    if (!updated.count) throw Errors.invalidState('Stock count was already submitted');
    if (hasPermission(actor, 'inventory.count.approve')) {
      return { status: 'POSTED', count: await this.postStockCount(id, actor, `stock_count:${id}`) };
    }
    const approval = await this.approvals.create({
      type: ApprovalType.STOCK_COUNT,
      title: `Stock count ${c.number} reconciliation`,
      description: `${c.lines.filter((l) => !D(l.countedQty).eq(l.systemQty)).length} line(s) with variance`,
      payload: { countId: id },
      requiredPermission: 'inventory.count.approve',
      requestedBy: actor,
    });
    return { status: 'PENDING_APPROVAL', approval };
  }

  /** Posts variances (counted − system snapshot) as a RECONCILIATION transaction. */
  async postStockCount(id: string, actor: AuthUser, idempotencyKey: string) {
    await this.ledger.runIdempotent(
      async (tx) => {
        const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "StockCount" WHERE "id" = ${id} FOR UPDATE`;
        if (!locked.length) throw Errors.notFound('Stock count', id);
        if (locked[0].status !== StockCountStatus.SUBMITTED) throw Errors.invalidState('Stock count is not awaiting posting');
        const c = await tx.stockCount.findUniqueOrThrow({ where: { id }, include: { lines: true } });
        const lines: LedgerLine[] = c.lines
          .filter((l) => l.countedQty !== null && !D(l.countedQty).eq(l.systemQty))
          .map((l) => ({ itemId: l.itemId, locationId: l.locationId, batchId: l.batchId, quantity: D(l.countedQty).minus(l.systemQty) }));
        let transactionId: string | null = null;
        if (lines.length) {
          const res = await this.ledger.post(tx, {
            type: InventoryTxType.RECONCILIATION,
            referenceType: 'StockCount',
            referenceId: c.id,
            referenceNumber: c.number,
            reason: 'Physical stock count',
            lines,
            actor,
            approvedById: actor.id,
            idempotencyKey,
          });
          transactionId = res.transaction.id;
        }
        await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.POSTED, postedAt: new Date(), approvedById: actor.id, transactionId } });
        await this.audit.record({ action: 'stock_count.posted', entityType: 'StockCount', entityId: id, summary: `${c.number}: ${lines.length} variance line(s)` }, tx);
        this.emitChanged(lines.map((l) => l.itemId));
        return null;
      },
      async () => null,
    );
    return this.prisma.stockCount.findUniqueOrThrow({ where: { id } });
  }

  async cancelStockCount(id: string) {
    const r = await this.prisma.stockCount.updateMany({ where: { id, status: { in: [StockCountStatus.DRAFT, StockCountStatus.SUBMITTED] } }, data: { status: StockCountStatus.CANCELLED } });
    if (!r.count) throw Errors.invalidState('Only open stock counts can be cancelled');
    await this.audit.record({ action: 'stock_count.cancelled', entityType: 'StockCount', entityId: id });
  }

  // ─── Queries ───────────────────────────────────────────────────────

  async getTransaction(id: string) {
    const t = await this.prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        movements: {
          include: {
            item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } },
            location: { select: { id: true, code: true, name: true } },
            batch: { select: { id: true, batchNumber: true } },
          },
          orderBy: { id: 'asc' },
        },
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true } },
      },
    });
    if (!t) throw Errors.notFound('Inventory transaction', id);
    const users = await this.prisma.user.findMany({ where: { id: { in: [t.createdById, t.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return serialize({ ...t, createdBy: users.find((u) => u.id === t.createdById) ?? null, approvedBy: users.find((u) => u.id === t.approvedById) ?? null });
  }

  /**
   * Stock summary per item: on hand (all locations), usable on hand, reserved, available.
   * Available = usable on hand − reserved.
   */
  async stockSummary(filter: { type?: ItemType; categoryId?: string; search?: string; warehouseId?: string; lowStockOnly?: boolean; itemIds?: string[] }) {
    const rows = await this.prisma.$queryRaw<
      { itemId: string; onHand: Decimal; usableOnHand: Decimal; reserved: Decimal; nonUsable: Decimal; lastMovementAt: Date | null }[]
    >`
      SELECT b."itemId",
             COALESCE(SUM(b."onHand"), 0) AS "onHand",
             COALESCE(SUM(CASE WHEN l."type"::text IN (${Prisma.join(AVAILABLE_LOCATION_TYPES)}) THEN b."onHand" ELSE 0 END), 0) AS "usableOnHand",
             COALESCE(SUM(b."reserved"), 0) AS "reserved",
             COALESCE(SUM(CASE WHEN l."type"::text IN (${Prisma.join(AVAILABLE_LOCATION_TYPES)}) THEN 0 ELSE b."onHand" END), 0) AS "nonUsable",
             MAX(b."lastMovementAt") AS "lastMovementAt"
      FROM "StockBalance" b JOIN "Location" l ON l."id" = b."locationId"
      ${filter.warehouseId ? Prisma.sql`WHERE b."warehouseId" = ${filter.warehouseId}` : Prisma.empty}
      GROUP BY b."itemId"`;
    const byItem = new Map(rows.map((r) => [r.itemId, r]));
    const items = await this.prisma.item.findMany({
      where: {
        type: filter.type,
        categoryId: filter.categoryId,
        isActive: true,
        ...(filter.itemIds ? { id: { in: filter.itemIds } } : {}),
        ...(filter.search
          ? { OR: [{ code: { contains: filter.search, mode: 'insensitive' } }, { name: { contains: filter.search, mode: 'insensitive' } }, { colour: { contains: filter.search, mode: 'insensitive' } }] }
          : {}),
      },
      include: { uom: { select: { code: true } }, category: { select: { id: true, name: true, code: true } }, product: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
    });
    const out = items.map((i) => {
      const r = byItem.get(i.id);
      const usable = D(r?.usableOnHand ?? 0);
      const reserved = D(r?.reserved ?? 0);
      const available = usable.minus(reserved);
      const reorderLevel = D(i.reorderLevel);
      const minStock = D(i.minStock);
      const stockStatus = (minStock.gt(0) && available.lt(minStock)) || (reorderLevel.gt(0) && available.lte(reorderLevel)) ? (available.lte(0) ? 'OUT' : 'LOW') : available.lte(0) ? 'OUT' : 'OK';
      return {
        id: i.id,
        type: i.type,
        code: i.code,
        name: i.name,
        colour: i.colour,
        variantName: i.variantName,
        product: i.product,
        category: i.category,
        uom: i.uom.code,
        minStock: Number(minStock),
        reorderLevel: Number(reorderLevel),
        reorderQty: Number(i.reorderQty),
        onHand: Number(r?.onHand ?? 0),
        usableOnHand: Number(usable),
        nonUsable: Number(r?.nonUsable ?? 0),
        reserved: Number(reserved),
        available: Number(available),
        stockStatus,
        lastMovementAt: r?.lastMovementAt ?? null,
        lastPurchasePrice: i.lastPurchasePrice ? Number(i.lastPurchasePrice) : null,
        standardCost: i.standardCost ? Number(i.standardCost) : null,
      };
    });
    return filter.lowStockOnly ? out.filter((o) => o.stockStatus !== 'OK' && (o.reorderLevel > 0 || o.minStock > 0)) : out;
  }

  async itemBalances(itemId: string) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { itemId, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] },
      include: { location: { select: { id: true, code: true, name: true, type: true, warehouseId: true } }, batch: { select: { id: true, batchNumber: true, receivedAt: true } } },
      orderBy: [{ location: { code: 'asc' } }],
    });
    return serialize(balances.map((b) => ({ ...b, available: D(b.onHand).minus(b.reserved) })));
  }

  async movements(q: { itemId?: string; locationId?: string; type?: InventoryTxType; from?: Date; to?: Date; skip: number; take: number }) {
    const where: Prisma.StockMovementWhereInput = {
      itemId: q.itemId,
      locationId: q.locationId,
      transaction: q.type ? { type: q.type } : undefined,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
        include: {
          transaction: { select: { id: true, number: true, type: true, reason: true, referenceType: true, referenceId: true, referenceNumber: true, status: true } },
          item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true } },
          batch: { select: { id: true, batchNumber: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { rows: serialize(rows), total };
  }

  async transactions(q: { type?: InventoryTxType; search?: string; from?: Date; to?: Date; skip: number; take: number }) {
    const where: Prisma.InventoryTransactionWhereInput = {
      type: q.type,
      postedAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { referenceNumber: { contains: q.search, mode: 'insensitive' } }, { reason: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({ where, orderBy: { postedAt: 'desc' }, skip: q.skip, take: q.take, include: { _count: { select: { movements: true } } } }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
    return { rows, total };
  }

  async reservations(q: { itemId?: string; sourceType?: string; sourceId?: string; openOnly?: boolean }) {
    const rows = await this.prisma.stockReservation.findMany({
      where: { itemId: q.itemId, sourceType: q.sourceType, sourceId: q.sourceId, ...(q.openOnly ? { status: { in: ['ACTIVE', 'PARTIALLY_CONSUMED'] } } : {}) },
      include: { item: { select: { code: true, name: true } }, location: { select: { code: true } }, batch: { select: { batchNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return serialize(rows.map((r) => ({ ...r, openQty: D(r.quantity).minus(r.consumedQty).minus(r.releasedQty) })));
  }

  async stockCounts(q: { status?: StockCountStatus; skip: number; take: number }) {
    const where = { status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.stockCount.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take, include: { _count: { select: { lines: true } } } }),
      this.prisma.stockCount.count({ where }),
    ]);
    return { rows, total };
  }

  /** Verify every cached balance equals the sum of its ledger lines (integrity check). */
  async verifyLedger() {
    const mismatches = await this.prisma.$queryRaw<{ id: string; itemId: string; locationId: string; onHand: Decimal; ledgerOnHand: Decimal; reserved: Decimal; ledgerReserved: Decimal }[]>`
      SELECT b."id", b."itemId", b."locationId", b."onHand", b."reserved",
             COALESCE(SUM(CASE WHEN m."bucket" = 'ON_HAND' THEN m."quantity" END), 0) AS "ledgerOnHand",
             COALESCE(SUM(CASE WHEN m."bucket" = 'RESERVED' THEN m."quantity" END), 0) AS "ledgerReserved"
      FROM "StockBalance" b
      LEFT JOIN "StockMovement" m ON m."itemId" = b."itemId" AND m."locationId" = b."locationId" AND m."batchId" IS NOT DISTINCT FROM b."batchId"
      GROUP BY b."id"
      HAVING b."onHand" <> COALESCE(SUM(CASE WHEN m."bucket" = 'ON_HAND' THEN m."quantity" END), 0)
          OR b."reserved" <> COALESCE(SUM(CASE WHEN m."bucket" = 'RESERVED' THEN m."quantity" END), 0)`;
    return { ok: mismatches.length === 0, mismatches: serialize(mismatches) };
  }
}

export interface AdjustmentPayload {
  lines: QtyLine[];
  reason: string;
  remarks?: string;
  idempotencyKey?: string;
}
