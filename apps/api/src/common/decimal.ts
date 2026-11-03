import { Prisma } from '@prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type DecimalLike = Prisma.Decimal | number | string;

export const D = (v: DecimalLike | null | undefined): Prisma.Decimal => new Prisma.Decimal(v ?? 0);
export const ZERO = new Prisma.Decimal(0);

export function sum<T>(rows: T[], pick: (r: T) => DecimalLike | null | undefined): Prisma.Decimal {
  return rows.reduce((acc, r) => acc.plus(D(pick(r))), new Prisma.Decimal(0));
}

export const minD = (a: DecimalLike, b: DecimalLike) => (D(a).lt(D(b)) ? D(a) : D(b));
export const maxD = (a: DecimalLike, b: DecimalLike) => (D(a).gt(D(b)) ? D(a) : D(b));

/** Round quantity to 4 dp (column scale) using ROUND_HALF_UP. */
export const q4 = (v: DecimalLike) => D(v).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
/** Round money to 2 dp. */
export const m2 = (v: DecimalLike) => D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
/** Round up to 4 dp — used for requirements so we never under-reserve. */
export const q4up = (v: DecimalLike) => D(v).toDecimalPlaces(4, Prisma.Decimal.ROUND_UP);

/** Convert Decimal fields to numbers for JSON responses (recursive, safe for plain objects). */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number((value as unknown as Prisma.Decimal).toString()) as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => serialize(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out as T;
  }
  return value;
}
