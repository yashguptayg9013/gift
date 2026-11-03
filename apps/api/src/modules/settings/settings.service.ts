import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Typed, validated application settings. Defaults are deliberately empty/neutral —
 * company details must be entered by an administrator (never invented).
 */
export const SETTINGS_SCHEMAS = {
  company: z.object({
    legalName: z.string().max(200).default(''),
    tradeName: z.string().max(200).default(''),
    address: z.string().max(500).default(''),
    city: z.string().max(100).default(''),
    state: z.string().max(100).default(''),
    stateCode: z.string().max(2).default(''),
    pincode: z.string().max(10).default(''),
    gstin: z.string().max(15).default(''),
    phone: z.string().max(30).default(''),
    email: z.string().max(200).default(''),
    quotationTerms: z.string().max(2000).default(''),
  }),
  procurement: z.object({
    poApprovalRequired: z.boolean().default(true),
    /** creator of a PO may not approve it */
    segregationOfDuties: z.boolean().default(true),
    reorderLookbackDays: z.number().int().min(7).max(365).default(30),
    reorderCoverDays: z.number().int().min(0).max(180).default(15),
    defaultLeadTimeDays: z.number().int().min(0).max(180).default(7),
  }),
  inventory: z.object({
    /** users without inventory.adjust.approve always go through approval; this forces approval for everyone */
    allAdjustmentsRequireApproval: z.boolean().default(false),
    lowStockScanEnabled: z.boolean().default(true),
    deadStockDays: z.number().int().min(30).max(730).default(90),
  }),
  production: z.object({
    /** percent over planned quantity a stage may produce */
    overProductionPercent: z.number().min(0).max(50).default(0),
    delayScanEnabled: z.boolean().default(true),
  }),
  notifications: z.object({
    dailySummaryEnabled: z.boolean().default(true),
    /** hour of day (Asia/Kolkata) the daily summary is generated */
    dailySummaryHour: z.number().int().min(0).max(23).default(19),
  }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 10_000) return hit.value as SettingsValue<K>;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const parsed = SETTINGS_SCHEMAS[key].safeParse(row?.value ?? {});
    const value = (parsed.success ? parsed.data : SETTINGS_SCHEMAS[key].parse({})) as SettingsValue<K>;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async all() {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]) out[k] = await this.get(k);
    return out;
  }

  async update(key: string, patch: unknown, userId: string) {
    if (!(key in SETTINGS_SCHEMAS)) throw Errors.notFound('Settings group', key);
    const k = key as SettingsKey;
    const before = await this.get(k);
    const parsed = SETTINGS_SCHEMAS[k].safeParse({ ...before, ...(patch as object) });
    if (!parsed.success) throw Errors.validation('Invalid settings', parsed.error.issues);
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: k },
        create: { key: k, value: parsed.data as Prisma.InputJsonValue, updatedBy: userId },
        update: { value: parsed.data as Prisma.InputJsonValue, updatedBy: userId },
      });
      await this.audit.record({ action: 'settings.updated', entityType: 'Setting', entityId: k, before, after: parsed.data }, tx);
    });
    this.cache.delete(k);
    return parsed.data;
  }
}
