import { Injectable } from '@nestjs/common';
import { ActorType, InventoryTransaction, InventoryTxType, LocationType, Prisma, StockBucket } from '@prisma/client';
import { createHash } from 'node:crypto';
import { D, Decimal, q4, ZERO } from '../../common/decimal';
import { AppError, Errors } from '../../common/errors';
import { AuthUser, hasPermission, RequestContextStore } from '../../common/request-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SequenceService } from '../settings/sequence.service';

/** Location types whose stock is usable for reservation, issue and sale. */
export const AVAILABLE_LOCATION_TYPES: LocationType[] = [LocationType.STORAGE];

export interface LedgerLine {
  itemId: string;
  locationId: string;
  batchId?: string | null;
  bucket?: StockBucket;
  /** signed quantity in base UoM */
  quantity: Decimal;
  unitCost?: Decimal | null;
  reservationId?: string | null;
}

export interface PostInput {
  type: InventoryTxType;
  lines: LedgerLine[];
  actor: AuthUser;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  reason?: string;
  remarks?: string;
  idempotencyKey?: string;
  /** hash of the business payload, used to detect idempotency-key reuse with a different body */
  requestPayload?: unknown;
  approvedById?: string;
  reversalOfId?: string;
}

export interface PostResult {
  transaction: InventoryTransaction;
  replayed: boolean;
}

export interface Allocation {
  balanceId: string;
  locationId: string;
  batchId: string | null;
  quantity: Decimal;
}

interface BalanceRow {
  id: string;
  itemId: string;
  locationId: string;
  batchId: string | null;
  onHand: Decimal;
  reserved: Decimal;
}

const keyOf = (itemId: string, locationId: string, batchId?: string | null) => `${itemId}|${locationId}|${batchId ?? ''}`;

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

/**
 * InventoryLedgerService — the ONLY writer of StockBalance, StockMovement and
 * StockReservation. All methods take a transaction client so callers (GRN,
 * production, challans…) post stock atomically with their own documents.
 */
@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Run `fn` in a transaction; if a concurrent request with the same idempotency key
   * won the race, return the winner's result via `onDuplicate`. Retries deadlocks.
   */
  async runIdempotent<T>(fn: (tx: Tx) => Promise<T>, onDuplicate?: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.tx(fn);
      } catch (err) {
        if (onDuplicate && isUniqueViolation(err, 'idempotencyKey')) return onDuplicate();
        if (attempt < 4 && isRetryable(err)) continue;
        throw err;
      }
    }
  }

  /** Post a ledger transaction. Must be called inside a DB transaction. */
  async post(tx: Tx, input: PostInput): Promise<PostResult> {
    if (!input.lines.length) throw Errors.validation('Transaction has no lines');
    const requestHash = input.idempotencyKey ? hashPayload(input.requestPayload ?? input.lines.map((l) => ({ ...l, quantity: l.quantity.toString() }))) : null;

    if (input.idempotencyKey) {
      const existing = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        if (existing.requestHash && existing.requestHash !== requestHash) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different request', 409);
        }
        return { transaction: existing, replayed: true };
      }
    }

    for (const l of input.lines) {
      if (D(l.quantity).isZero()) throw Errors.validation('Line quantity cannot be zero');
      if (D(l.quantity).decimalPlaces() > 4) l.quantity = q4(l.quantity);
    }

    // Header first: a concurrent duplicate blocks here on the unique idempotency index.
    const ctx = RequestContextStore.get();
    const header = await tx.inventoryTransaction.create({
      data: {
        number: await this.sequences.next('inventory_tx', tx),
        type: input.type,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNumber: input.referenceNumber,
        reason: input.reason,
        remarks: input.remarks,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        createdById: input.actor.id === 'system' ? null : input.actor.id,
        approvedById: input.approvedById,
        actorType: ctx?.actorType ?? (input.actor.id === 'system' ? ActorType.SYSTEM : ActorType.USER),
        reversalOfId: input.reversalOfId,
      },
    });

    // Validate locations and items.
    const locationIds = [...new Set(input.lines.map((l) => l.locationId))];
    const locations = await tx.location.findMany({ where: { id: { in: locationIds } }, include: { warehouse: true } });
    const locById = new Map(locations.map((l) => [l.id, l]));
    for (const id of locationIds) {
      const loc = locById.get(id);
      if (!loc) throw Errors.notFound('Location', id);
      if (!loc.isActive || !loc.warehouse.isActive) throw Errors.rule('LOCATION_INACTIVE', `Location ${loc.code} is inactive`);
    }
    const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
    const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true, trackBatches: true } });
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const id of itemIds) if (!itemById.has(id)) throw Errors.notFound('Item', id);

    const balances = await this.lockBalances(
      tx,
      input.lines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, batchId: l.batchId ?? null, warehouseId: locById.get(l.locationId)!.warehouseId })),
    );

    // Apply lines in order, tracking running values for after-balances.
    const state = new Map<string, { row: BalanceRow; onHand: Decimal; reserved: Decimal }>();
    for (const b of balances.values()) state.set(b.id, { row: b, onHand: D(b.onHand), reserved: D(b.reserved) });

    const movements: Prisma.StockMovementCreateManyInput[] = [];
    for (const line of input.lines) {
      const bal = balances.get(keyOf(line.itemId, line.locationId, line.batchId))!;
      const s = state.get(bal.id)!;
      const bucket = line.bucket ?? StockBucket.ON_HAND;
      if (bucket === StockBucket.ON_HAND) s.onHand = s.onHand.plus(line.quantity);
      else s.reserved = s.reserved.plus(line.quantity);
      movements.push({
        transactionId: header.id,
        itemId: line.itemId,
        warehouseId: locById.get(line.locationId)!.warehouseId,
        locationId: line.locationId,
        batchId: line.batchId ?? null,
        bucket,
        quantity: line.quantity,
        unitCost: line.unitCost ?? null,
        onHandAfter: s.onHand,
        reservedAfter: s.reserved,
        reservationId: line.reservationId ?? null,
      });
    }

    // Validate final states.
    for (const s of state.values()) {
      const changed = !s.onHand.eq(s.row.onHand) || !s.reserved.eq(s.row.reserved);
      if (!changed) continue;
      const loc = locById.get(s.row.locationId)!;
      const item = itemById.get(s.row.itemId)!;
      const where = `${item.code} @ ${loc.code}`;
      if (s.reserved.lt(0)) throw Errors.rule('RESERVATION_UNDERFLOW', `Reserved quantity for ${where} cannot go below zero`);
      if (s.onHand.lt(0)) {
        const allowed = loc.warehouse.allowNegativeStock && hasPermission(input.actor, 'inventory.negative_stock.override');
        if (!allowed) {
          throw Errors.insufficientStock(`Insufficient stock for ${item.name} (${where}): on hand ${s.row.onHand.toString()}, requested change ${s.onHand.minus(s.row.onHand).toString()}`, {
            itemId: item.id,
            locationId: loc.id,
            onHand: Number(s.row.onHand),
            reserved: Number(s.row.reserved),
          });
        }
      }
      if (s.reserved.gt(Decimal.max(s.onHand, 0))) {
        throw Errors.insufficientStock(`Not enough unreserved stock for ${item.name} (${where}): on hand ${s.row.onHand.toString()}, reserved ${s.row.reserved.toString()}, requested change ${s.onHand.minus(s.row.onHand).toString()}`, {
          itemId: item.id,
          locationId: loc.id,
          onHand: Number(s.row.onHand),
          reserved: Number(s.row.reserved),
        });
      }
    }

    const now = new Date();
    for (const s of state.values()) {
      if (s.onHand.eq(s.row.onHand) && s.reserved.eq(s.row.reserved)) continue;
      await tx.stockBalance.update({ where: { id: s.row.id }, data: { onHand: s.onHand, reserved: s.reserved, lastMovementAt: now } });
    }
    await tx.stockMovement.createMany({ data: movements });

    await this.audit.record(
      {
        action: `inventory.${input.type.toLowerCase()}`,
        entityType: 'InventoryTransaction',
        entityId: header.id,
        summary: `${header.number} ${input.type} (${movements.length} lines)${input.referenceNumber ? ` ref ${input.referenceNumber}` : ''}`,
        after: { lines: movements.map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId, bucket: m.bucket, quantity: m.quantity })) },
        metadata: { reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId },
        actorId: input.actor.id,
      },
      tx,
    );

    return { transaction: header, replayed: false };
  }

  /** Ensure balance rows exist and lock them (deterministic order → no deadlocks between postings). */
  async lockBalances(tx: Tx, keys: { itemId: string; locationId: string; batchId: string | null; warehouseId: string }[]) {
    const unique = new Map(keys.map((k) => [keyOf(k.itemId, k.locationId, k.batchId), k]));
    const values = [...unique.values()];
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("id", "itemId", "warehouseId", "locationId", "batchId", "onHand", "reserved", "updatedAt")
      VALUES ${Prisma.join(values.map((k) => Prisma.sql`(gen_random_uuid()::text, ${k.itemId}, ${k.warehouseId}, ${k.locationId}, ${k.batchId}, 0, 0, now())`))}
      ON CONFLICT ("itemId", "locationId", "batchId") DO NOTHING`;
    const candidates = await tx.$queryRaw<BalanceRow[]>`
      SELECT "id", "itemId", "locationId", "batchId" FROM "StockBalance"
      WHERE "itemId" IN (${Prisma.join([...new Set(values.map((v) => v.itemId))])})
        AND "locationId" IN (${Prisma.join([...new Set(values.map((v) => v.locationId))])})`;
    const ids = candidates.filter((c) => unique.has(keyOf(c.itemId, c.locationId, c.batchId))).map((c) => c.id);
    const locked = await tx.$queryRaw<BalanceRow[]>`
      SELECT "id", "itemId", "locationId", "batchId", "onHand", "reserved" FROM "StockBalance"
      WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    return new Map(locked.map((b) => [keyOf(b.itemId, b.locationId, b.batchId), b]));
  }

  /**
   * Lock and allocate available (unreserved, usable-location) stock FIFO by batch
   * receipt date. Throws INSUFFICIENT_STOCK unless allowPartial.
   */
  async allocateAvailable(
    tx: Tx,
    p: { itemId: string; warehouseId: string; quantity: Decimal; locationId?: string; batchId?: string | null; allowPartial?: boolean },
  ): Promise<Allocation[]> {
    const rows = await tx.$queryRaw<(BalanceRow & { receivedAt: Date | null; isDefault: boolean })[]>`
      SELECT b."id", b."itemId", b."locationId", b."batchId", b."onHand", b."reserved", bt."receivedAt", l."isDefault"
      FROM "StockBalance" b
      JOIN "Location" l ON l."id" = b."locationId"
      LEFT JOIN "Batch" bt ON bt."id" = b."batchId"
      WHERE b."itemId" = ${p.itemId}
        AND b."warehouseId" = ${p.warehouseId}
        AND l."isActive" = true
        AND l."type"::text IN (${Prisma.join(AVAILABLE_LOCATION_TYPES)})
        ${p.locationId ? Prisma.sql`AND b."locationId" = ${p.locationId}` : Prisma.empty}
        ${p.batchId !== undefined ? Prisma.sql`AND b."batchId" IS NOT DISTINCT FROM ${p.batchId}` : Prisma.empty}
        AND b."onHand" - b."reserved" > 0
      ORDER BY b."id"
      FOR UPDATE OF b`;
    rows.sort((a, b) => {
      const ta = a.receivedAt?.getTime() ?? 0;
      const tb = b.receivedAt?.getTime() ?? 0;
      if (ta !== tb) return ta - tb;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    let remaining = D(p.quantity);
    const out: Allocation[] = [];
    for (const r of rows) {
      if (remaining.lte(0)) break;
      const free = D(r.onHand).minus(r.reserved);
      const take = Decimal.min(free, remaining);
      if (take.lte(0)) continue;
      out.push({ balanceId: r.id, locationId: r.locationId, batchId: r.batchId, quantity: take });
      remaining = remaining.minus(take);
    }
    if (remaining.gt(0) && !p.allowPartial) {
      const item = await tx.item.findUnique({ where: { id: p.itemId }, select: { name: true, code: true } });
      const available = D(p.quantity).minus(remaining);
      throw Errors.insufficientStock(`Insufficient available stock for ${item?.name ?? p.itemId}: required ${D(p.quantity).toString()}, available ${available.toString()}`, {
        itemId: p.itemId,
        required: Number(p.quantity),
        available: Number(available),
      });
    }
    return out;
  }

  /** Total available (onHand − reserved) in usable locations for an item in a warehouse (or all). */
  async availableQty(db: Tx | PrismaService, itemId: string, warehouseId?: string): Promise<Decimal> {
    const r = await db.$queryRaw<{ available: Decimal | null }[]>`
      SELECT SUM(b."onHand" - b."reserved") AS "available"
      FROM "StockBalance" b JOIN "Location" l ON l."id" = b."locationId"
      WHERE b."itemId" = ${itemId}
        ${warehouseId ? Prisma.sql`AND b."warehouseId" = ${warehouseId}` : Prisma.empty}
        AND l."type"::text IN (${Prisma.join(AVAILABLE_LOCATION_TYPES)})`;
    return D(r[0]?.available ?? 0);
  }

  // ─── Reservations ──────────────────────────────────────────────────

  /**
   * Reserve available stock for a source document line. Reservation does NOT change
   * on-hand; it moves quantity into the RESERVED bucket so it cannot be issued elsewhere.
   */
  async reserve(
    tx: Tx,
    p: {
      itemId: string;
      warehouseId: string;
      quantity: Decimal;
      sourceType: string;
      sourceId: string;
      sourceLineId?: string;
      referenceNumber?: string;
      allowPartial?: boolean;
      actor: AuthUser;
      idempotencyKey?: string;
    },
  ): Promise<{ reserved: Decimal; reservationIds: string[]; transactionId: string | null }> {
    const allocations = await this.allocateAvailable(tx, { ...p, allowPartial: p.allowPartial });
    if (!allocations.length) return { reserved: ZERO, reservationIds: [], transactionId: null };
    const reservations: { id: string }[] = [];
    for (const a of allocations) {
      reservations.push(
        await tx.stockReservation.create({
          data: {
            itemId: p.itemId,
            warehouseId: p.warehouseId,
            locationId: a.locationId,
            batchId: a.batchId,
            sourceType: p.sourceType,
            sourceId: p.sourceId,
            sourceLineId: p.sourceLineId,
            quantity: a.quantity,
          },
        }),
      );
    }
    const { transaction } = await this.post(tx, {
      type: InventoryTxType.RESERVATION,
      actor: p.actor,
      referenceType: p.sourceType,
      referenceId: p.sourceId,
      referenceNumber: p.referenceNumber,
      idempotencyKey: p.idempotencyKey,
      lines: allocations.map((a, i) => ({
        itemId: p.itemId,
        locationId: a.locationId,
        batchId: a.batchId,
        bucket: StockBucket.RESERVED,
        quantity: a.quantity,
        reservationId: reservations[i].id,
      })),
    });
    return { reserved: allocations.reduce((s, a) => s.plus(a.quantity), ZERO), reservationIds: reservations.map((r) => r.id), transactionId: transaction.id };
  }

  /** Release open reserved quantity (all, or up to `quantity`) for a source / source line. */
  async release(
    tx: Tx,
    p: { sourceType: string; sourceId: string; sourceLineId?: string; itemId?: string; quantity?: Decimal; actor: AuthUser; reason?: string; referenceNumber?: string },
  ): Promise<Decimal> {
    const open = await this.lockOpenReservations(tx, p);
    let remaining = p.quantity ? D(p.quantity) : null;
    const lines: LedgerLine[] = [];
    for (const r of open) {
      const openQty = D(r.quantity).minus(r.consumedQty).minus(r.releasedQty);
      const take = remaining ? Decimal.min(openQty, remaining) : openQty;
      if (take.lte(0)) continue;
      const releasedQty = D(r.releasedQty).plus(take);
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { releasedQty, status: reservationStatus(r.quantity, r.consumedQty, releasedQty) },
      });
      lines.push({ itemId: r.itemId, locationId: r.locationId, batchId: r.batchId, bucket: StockBucket.RESERVED, quantity: take.neg(), reservationId: r.id });
      if (remaining) {
        remaining = remaining.minus(take);
        if (remaining.lte(0)) break;
      }
    }
    if (!lines.length) return ZERO;
    await this.post(tx, {
      type: InventoryTxType.RELEASE,
      actor: p.actor,
      referenceType: p.sourceType,
      referenceId: p.sourceId,
      referenceNumber: p.referenceNumber,
      reason: p.reason,
      lines,
    });
    return lines.reduce((s, l) => s.plus(l.quantity.neg()), ZERO);
  }

  /**
   * Build ledger lines that consume `quantity` of an item for a source line:
   * first from that line's reservations (RESERVED − and ON_HAND −), then from free
   * available stock. The caller posts them (usually together with other lines).
   */
  async buildConsumption(
    tx: Tx,
    p: { itemId: string; warehouseId: string; quantity: Decimal; sourceType: string; sourceId: string; sourceLineId?: string },
  ): Promise<{ lines: LedgerLine[]; fromReservation: Decimal; fromFree: Decimal }> {
    const lines: LedgerLine[] = [];
    let remaining = D(p.quantity);
    let fromReservation = ZERO;
    const open = await this.lockOpenReservations(tx, { sourceType: p.sourceType, sourceId: p.sourceId, sourceLineId: p.sourceLineId, itemId: p.itemId });
    for (const r of open) {
      if (remaining.lte(0)) break;
      const openQty = D(r.quantity).minus(r.consumedQty).minus(r.releasedQty);
      const take = Decimal.min(openQty, remaining);
      if (take.lte(0)) continue;
      const consumedQty = D(r.consumedQty).plus(take);
      await tx.stockReservation.update({ where: { id: r.id }, data: { consumedQty, status: reservationStatus(r.quantity, consumedQty, r.releasedQty) } });
      lines.push({ itemId: r.itemId, locationId: r.locationId, batchId: r.batchId, bucket: StockBucket.RESERVED, quantity: take.neg(), reservationId: r.id });
      lines.push({ itemId: r.itemId, locationId: r.locationId, batchId: r.batchId, bucket: StockBucket.ON_HAND, quantity: take.neg(), reservationId: r.id });
      remaining = remaining.minus(take);
      fromReservation = fromReservation.plus(take);
    }
    let fromFree = ZERO;
    if (remaining.gt(0)) {
      const allocations = await this.allocateAvailable(tx, { itemId: p.itemId, warehouseId: p.warehouseId, quantity: remaining });
      for (const a of allocations) {
        lines.push({ itemId: p.itemId, locationId: a.locationId, batchId: a.batchId, bucket: StockBucket.ON_HAND, quantity: a.quantity.neg() });
        fromFree = fromFree.plus(a.quantity);
      }
    }
    return { lines, fromReservation, fromFree };
  }

  private async lockOpenReservations(tx: Tx, p: { sourceType: string; sourceId: string; sourceLineId?: string; itemId?: string }) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "StockReservation"
      WHERE "sourceType" = ${p.sourceType} AND "sourceId" = ${p.sourceId}
        ${p.sourceLineId ? Prisma.sql`AND "sourceLineId" = ${p.sourceLineId}` : Prisma.empty}
        ${p.itemId ? Prisma.sql`AND "itemId" = ${p.itemId}` : Prisma.empty}
        AND "status" IN ('ACTIVE', 'PARTIALLY_CONSUMED')
      ORDER BY "createdAt", "id" FOR UPDATE`;
    if (!rows.length) return [];
    return tx.stockReservation.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
}

export function reservationStatus(quantity: Decimal, consumed: Decimal, released: Decimal) {
  const q = D(quantity);
  const c = D(consumed);
  const r = D(released);
  if (c.plus(r).gte(q)) return c.gt(0) ? 'CONSUMED' : 'RELEASED';
  return c.gt(0) ? 'PARTIALLY_CONSUMED' : 'ACTIVE';
}

export function isUniqueViolation(err: unknown, field?: string) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  if (!field) return true;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
}

export function isRetryable(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') return true;
  const msg = err instanceof Error ? err.message : '';
  return msg.includes('deadlock detected') || msg.includes('could not serialize access');
}
