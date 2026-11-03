import { Injectable } from '@nestjs/common';
import { Db, PrismaService } from '../../infra/prisma/prisma.service';

/** Default numbering series. Prefixes are editable in Administration → Numbering. */
export const DEFAULT_SEQUENCES: Record<string, { prefix: string; padding?: number }> = {
  inventory_tx: { prefix: 'IT', padding: 6 },
  stock_count: { prefix: 'SC' },
  approval: { prefix: 'APR' },
  production_order: { prefix: 'MO' },
  inspection: { prefix: 'QC' },
  requisition: { prefix: 'PR' },
  purchase_order: { prefix: 'PO' },
  grn: { prefix: 'GRN' },
  supplier_return: { prefix: 'SR' },
  inquiry: { prefix: 'INQ' },
  quotation: { prefix: 'QT' },
  sales_order: { prefix: 'SO' },
  challan: { prefix: 'DC' },
  bom: { prefix: 'BOM', padding: 4 },
};

/** Indian financial year key, e.g. 2026-11-03 → "26-27"; 2027-02-01 → "26-27". */
export function financialYear(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically allocate the next document number. Must be called inside the same
   * transaction that creates the document so a rollback does not burn numbers
   * (row lock serialises concurrent callers).
   */
  async next(key: string, db: Db = this.prisma): Promise<string> {
    const def = DEFAULT_SEQUENCES[key] ?? { prefix: key.toUpperCase().slice(0, 4) };
    const fy = financialYear();
    await db.$executeRaw`
      INSERT INTO "DocumentSequence" ("key", "prefix", "nextValue", "padding", "resetYearly", "periodKey")
      VALUES (${key}, ${def.prefix}, 1, ${def.padding ?? 5}, true, ${fy})
      ON CONFLICT ("key") DO NOTHING`;
    const rows = await db.$queryRaw<{ prefix: string; value: number; padding: number; resetYearly: boolean; periodKey: string | null }[]>`
      UPDATE "DocumentSequence"
      SET "nextValue" = CASE WHEN "resetYearly" AND "periodKey" IS DISTINCT FROM ${fy} THEN 2 ELSE "nextValue" + 1 END,
          "periodKey" = CASE WHEN "resetYearly" THEN ${fy} ELSE "periodKey" END
      WHERE "key" = ${key}
      RETURNING "prefix", ("nextValue" - 1) AS "value", "padding", "resetYearly", "periodKey"`;
    const r = rows[0];
    const n = String(r.value).padStart(r.padding, '0');
    return r.resetYearly ? `${r.prefix}/${r.periodKey}/${n}` : `${r.prefix}-${n}`;
  }
}
