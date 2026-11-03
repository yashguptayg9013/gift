import { Injectable } from '@nestjs/common';
import { BomStatus, ConsumptionMode, ItemType, Prisma } from '@prisma/client';
import { evaluateFormula, FormulaError, validateFormula } from '@puja/shared';
import { D, Decimal, q4up, serialize } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { Db, PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory/ledger.service';
import { SequenceService } from '../settings/sequence.service';

export interface BomLineInput {
  materialId: string;
  quantity?: number;
  quantityFormula?: string | null;
  uomCode?: string;
  wastagePercent?: number;
  stageDefinitionId?: string | null;
  consumptionMode?: ConsumptionMode;
  specifications?: string | null;
  notes?: string | null;
  isOptional?: boolean;
  alternatives?: { materialId: string; conversionFactor?: number; priority?: number; notes?: string }[];
}

export interface VersionInput {
  outputQuantity?: number;
  notes?: string;
  lines: BomLineInput[];
}

const lineInclude = {
  material: { select: { id: true, code: true, name: true, uom: { select: { code: true } }, colour: true } },
  stageDefinition: { select: { id: true, code: true, name: true } },
  alternatives: { include: { material: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } }, orderBy: { priority: 'asc' as const } },
};

/** Variables available to BOM formulas: numeric SKU attributes + qty. */
export function formulaVariables(attributes: unknown, qty: number): Record<string, number> {
  const vars: Record<string, number> = { qty };
  if (attributes && typeof attributes === 'object') {
    for (const [k, v] of Object.entries(attributes as Record<string, unknown>)) {
      const n = Number(v);
      if (v !== '' && v !== null && Number.isFinite(n)) vars[k] = n;
    }
  }
  return vars;
}

@Injectable()
export class BomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(q: { search?: string; skip: number; take: number }) {
    const where: Prisma.BomWhereInput = q.search
      ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }, { item: { code: { contains: q.search, mode: 'insensitive' } } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.bom.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { updatedAt: 'desc' },
        include: {
          item: { select: { id: true, code: true, name: true, variantName: true } },
          versions: { select: { id: true, version: true, status: true, _count: { select: { lines: true } } }, orderBy: { version: 'desc' } },
        },
      }),
      this.prisma.bom.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string) {
    const bom = await this.prisma.bom.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, code: true, name: true, attributes: true, uom: { select: { code: true } } } },
        versions: { orderBy: { version: 'desc' }, include: { lines: { include: lineInclude, orderBy: { lineNo: 'asc' } } } },
      },
    });
    if (!bom) throw Errors.notFound('BOM', id);
    return serialize(bom);
  }

  async getByItem(itemId: string) {
    const bom = await this.prisma.bom.findUnique({ where: { itemId } });
    return bom ? this.get(bom.id) : null;
  }

  async getVersion(versionId: string, db: Db = this.prisma) {
    const v = await db.bomVersion.findUnique({
      where: { id: versionId },
      include: { bom: { include: { item: { select: { id: true, code: true, name: true, attributes: true } } } }, lines: { include: lineInclude, orderBy: { lineNo: 'asc' } } },
    });
    if (!v) throw Errors.notFound('BOM version', versionId);
    return v;
  }

  /** Create a BOM for a finished-goods SKU with an initial draft version. */
  async create(dto: { itemId: string; name?: string } & VersionInput, actor: AuthUser) {
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item) throw Errors.notFound('Item', dto.itemId);
    if (item.type !== ItemType.PRODUCT) throw Errors.validation('BOMs are defined for finished-goods SKUs');
    if (await this.prisma.bom.findUnique({ where: { itemId: item.id } })) throw Errors.conflict('This SKU already has a BOM. Create a new version instead.');
    const id = await this.prisma.tx(async (tx) => {
      const bom = await tx.bom.create({ data: { code: await this.sequences.next('bom', tx), itemId: item.id, name: dto.name ?? `BOM for ${item.name}` } });
      await this.writeVersion(tx, bom.id, 1, dto, actor, item.attributes);
      await this.audit.record({ action: 'bom.created', entityType: 'Bom', entityId: bom.id, summary: `${bom.code} for ${item.code}`, after: dto }, tx);
      return bom.id;
    });
    return this.get(id);
  }

  private async writeVersion(tx: Prisma.TransactionClient, bomId: string, version: number, dto: VersionInput, actor: AuthUser, skuAttributes: unknown, copiedFromId?: string) {
    await this.validateLines(tx, dto.lines, skuAttributes);
    const v = await tx.bomVersion.create({
      data: { bomId, version, outputQuantity: dto.outputQuantity ?? 1, notes: dto.notes, createdById: actor.id, copiedFromId },
    });
    await this.insertLines(tx, v.id, dto.lines);
    return v;
  }

  private async insertLines(tx: Prisma.TransactionClient, versionId: string, lines: BomLineInput[]) {
    for (const [i, l] of lines.entries()) {
      const material = await tx.item.findUniqueOrThrow({ where: { id: l.materialId }, include: { uom: true } });
      await tx.bomLine.create({
        data: {
          bomVersionId: versionId,
          lineNo: i + 1,
          materialId: l.materialId,
          quantity: l.quantity ?? 0,
          quantityFormula: l.quantityFormula?.trim() || null,
          uomCode: l.uomCode ?? material.uom.code,
          wastagePercent: l.wastagePercent ?? 0,
          stageDefinitionId: l.stageDefinitionId || null,
          consumptionMode: l.consumptionMode ?? ConsumptionMode.BACKFLUSH,
          specifications: l.specifications,
          notes: l.notes,
          isOptional: l.isOptional ?? false,
          alternatives: l.alternatives?.length
            ? { create: l.alternatives.map((a, j) => ({ materialId: a.materialId, conversionFactor: a.conversionFactor ?? 1, priority: a.priority ?? j + 1, notes: a.notes })) }
            : undefined,
        },
      });
    }
  }

  private async validateLines(db: Db, lines: BomLineInput[], skuAttributes: unknown) {
    if (!lines.length) throw Errors.validation('A BOM version needs at least one component');
    const allowedVars = Object.keys(formulaVariables(skuAttributes, 1));
    const materialIds = [...new Set(lines.flatMap((l) => [l.materialId, ...(l.alternatives ?? []).map((a) => a.materialId)]))];
    const materials = await db.item.findMany({ where: { id: { in: materialIds } }, include: { uom: true, uomConversions: true } });
    for (const [i, l] of lines.entries()) {
      const n = `Line ${i + 1}`;
      const m = materials.find((x) => x.id === l.materialId);
      if (!m) throw Errors.validation(`${n}: material not found`);
      if (m.type !== ItemType.MATERIAL) throw Errors.validation(`${n}: ${m.code} is not a material`);
      if (l.quantityFormula?.trim()) {
        const err = validateFormula(l.quantityFormula, allowedVars);
        if (err) throw Errors.validation(`${n}: formula error — ${err}. Available variables: ${allowedVars.join(', ')}`);
      } else if (!(Number(l.quantity) > 0)) {
        throw Errors.validation(`${n}: quantity must be greater than zero (or provide a formula)`);
      }
      if (l.uomCode && l.uomCode !== m.uom.code && !m.uomConversions.some((c) => c.uomCode === l.uomCode)) {
        throw Errors.validation(`${n}: no conversion from ${l.uomCode} to ${m.uom.code} for ${m.code}`);
      }
      if (l.wastagePercent !== undefined && (l.wastagePercent < 0 || l.wastagePercent > 100)) throw Errors.validation(`${n}: wastage must be 0–100%`);
      for (const a of l.alternatives ?? []) {
        if (a.materialId === l.materialId) throw Errors.validation(`${n}: alternative cannot be the same material`);
        const am = materials.find((x) => x.id === a.materialId);
        if (!am || am.type !== ItemType.MATERIAL) throw Errors.validation(`${n}: alternative material not found`);
      }
    }
  }

  /** New draft version (optionally copied from an existing version). */
  async createVersion(bomId: string, dto: Partial<VersionInput> & { copyFromVersionId?: string }, actor: AuthUser) {
    const bom = await this.prisma.bom.findUnique({ where: { id: bomId }, include: { item: true, versions: { select: { version: true } } } });
    if (!bom) throw Errors.notFound('BOM', bomId);
    let input: VersionInput;
    if (dto.copyFromVersionId) {
      const src = await this.getVersion(dto.copyFromVersionId);
      if (src.bomId !== bomId) throw Errors.validation('Source version belongs to another BOM');
      input = { outputQuantity: dto.outputQuantity ?? Number(src.outputQuantity), notes: dto.notes ?? src.notes ?? undefined, lines: dto.lines ?? src.lines.map(toLineInput) };
    } else {
      if (!dto.lines) throw Errors.validation('lines are required');
      input = { outputQuantity: dto.outputQuantity, notes: dto.notes, lines: dto.lines };
    }
    const next = Math.max(0, ...bom.versions.map((v) => v.version)) + 1;
    const v = await this.prisma.tx(async (tx) => {
      const v = await this.writeVersion(tx, bomId, next, input, actor, bom.item.attributes, dto.copyFromVersionId);
      await this.audit.record({ action: 'bom.version_created', entityType: 'BomVersion', entityId: v.id, summary: `${bom.code} v${next}` }, tx);
      return v;
    });
    return serialize(await this.getVersion(v.id));
  }

  async updateDraft(versionId: string, dto: VersionInput) {
    const v = await this.getVersion(versionId);
    if (v.status !== BomStatus.DRAFT) throw Errors.invalidState('Only draft versions can be edited. Create a new version instead.');
    await this.prisma.tx(async (tx) => {
      await this.validateLines(tx, dto.lines, v.bom.item.attributes);
      await tx.bomLine.deleteMany({ where: { bomVersionId: versionId } });
      await tx.bomVersion.update({ where: { id: versionId }, data: { outputQuantity: dto.outputQuantity ?? v.outputQuantity, notes: dto.notes } });
      await this.insertLines(tx, versionId, dto.lines);
      await this.audit.record({ action: 'bom.version_updated', entityType: 'BomVersion', entityId: versionId, before: v.lines.map(toLineInput), after: dto.lines }, tx);
    });
    return serialize(await this.getVersion(versionId));
  }

  async activate(versionId: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const v = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { bom: { include: { item: true } }, lines: true } });
      if (!v) throw Errors.notFound('BOM version', versionId);
      if (v.status === BomStatus.ACTIVE) return;
      await this.validateLines(tx, v.lines.map((l) => ({ ...l, quantity: Number(l.quantity), wastagePercent: Number(l.wastagePercent) })), v.bom.item.attributes);
      await tx.bomVersion.updateMany({ where: { bomId: v.bomId, status: BomStatus.ACTIVE }, data: { status: BomStatus.ARCHIVED, archivedAt: new Date() } });
      await tx.bomVersion.update({ where: { id: versionId }, data: { status: BomStatus.ACTIVE, activatedAt: new Date(), activatedById: actor.id, archivedAt: null } });
      await this.audit.record({ action: 'bom.version_activated', entityType: 'BomVersion', entityId: versionId, summary: `v${v.version}` }, tx);
    });
    return serialize(await this.getVersion(versionId));
  }

  async archive(versionId: string) {
    const v = await this.prisma.bomVersion.update({ where: { id: versionId }, data: { status: BomStatus.ARCHIVED, archivedAt: new Date() } });
    await this.audit.record({ action: 'bom.version_archived', entityType: 'BomVersion', entityId: versionId, summary: `v${v.version}` });
    return v;
  }

  /**
   * Duplicate a version to another SKU (or as a new version of the same BOM) applying
   * material substitutions, e.g. black PU leather → blue PU leather for the Blue variant.
   */
  async duplicate(versionId: string, dto: { targetItemId?: string; substitutions?: { fromMaterialId: string; toMaterialId: string }[] }, actor: AuthUser) {
    const src = await this.getVersion(versionId);
    const subs = new Map((dto.substitutions ?? []).map((s) => [s.fromMaterialId, s.toMaterialId]));
    const lines = src.lines.map((l) => {
      const li = toLineInput(l);
      return {
        ...li,
        materialId: subs.get(li.materialId) ?? li.materialId,
        uomCode: subs.has(li.materialId) ? undefined : li.uomCode,
        alternatives: li.alternatives?.filter((a) => a.materialId !== (subs.get(li.materialId) ?? li.materialId)),
      };
    });
    const targetItemId = dto.targetItemId ?? src.bom.itemId;
    const existing = await this.prisma.bom.findUnique({ where: { itemId: targetItemId } });
    if (existing) return this.createVersion(existing.id, { lines, outputQuantity: Number(src.outputQuantity), notes: `Copied from ${src.bom.code} v${src.version}` }, actor);
    const bom = await this.create({ itemId: targetItemId, lines, outputQuantity: Number(src.outputQuantity), notes: `Copied from ${src.bom.code} v${src.version}` }, actor);
    return bom.versions[0];
  }

  /** Line-level diff between two versions keyed by material. */
  async compare(aId: string, bId: string) {
    const [a, b] = await Promise.all([this.getVersion(aId), this.getVersion(bId)]);
    const key = (l: (typeof a.lines)[number]) => l.materialId;
    const amap = new Map(a.lines.map((l) => [key(l), l]));
    const bmap = new Map(b.lines.map((l) => [key(l), l]));
    const fields = ['quantity', 'quantityFormula', 'uomCode', 'wastagePercent', 'stageDefinitionId', 'consumptionMode', 'specifications', 'isOptional'] as const;
    const rows: { materialId: string; material: unknown; change: 'added' | 'removed' | 'changed' | 'same'; differences: { field: string; from: unknown; to: unknown }[] }[] = [];
    for (const [k, la] of amap) {
      const lb = bmap.get(k);
      if (!lb) {
        rows.push({ materialId: k, material: la.material, change: 'removed', differences: [] });
        continue;
      }
      const differences = fields
        .map((f) => ({ field: f, from: norm(la[f]), to: norm(lb[f]) }))
        .filter((d) => JSON.stringify(d.from) !== JSON.stringify(d.to));
      rows.push({ materialId: k, material: la.material, change: differences.length ? 'changed' : 'same', differences });
    }
    for (const [k, lb] of bmap) if (!amap.has(k)) rows.push({ materialId: k, material: lb.material, change: 'added', differences: [] });
    return {
      a: { id: a.id, version: a.version, status: a.status, bom: a.bom.code, item: a.bom.item.code, outputQuantity: Number(a.outputQuantity) },
      b: { id: b.id, version: b.version, status: b.status, bom: b.bom.code, item: b.bom.item.code, outputQuantity: Number(b.outputQuantity) },
      rows,
    };
  }

  /**
   * Compute material requirements for `quantity` finished units of a version.
   * Returns per-unit standard quantity (base UoM), required incl. wastage, and availability.
   */
  async computeRequirements(versionId: string, quantity: number, opts: { warehouseId?: string; parameters?: Record<string, number>; db?: Db; withAvailability?: boolean } = {}) {
    if (!(quantity > 0)) throw Errors.validation('Quantity must be greater than zero');
    const db = opts.db ?? this.prisma;
    const v = await this.getVersion(versionId, db);
    const vars = { ...formulaVariables(v.bom.item.attributes, quantity), ...(opts.parameters ?? {}) };
    const conversions = await db.itemUomConversion.findMany({ where: { itemId: { in: v.lines.map((l) => l.materialId) } } });
    const out = [];
    for (const l of v.lines) {
      let lineQty: Decimal;
      try {
        lineQty = l.quantityFormula ? D(evaluateFormula(l.quantityFormula, vars)) : D(l.quantity);
      } catch (e) {
        throw Errors.validation(`Line ${l.lineNo} (${l.material.code}): ${e instanceof FormulaError ? e.message : String(e)}`);
      }
      if (lineQty.lt(0)) throw Errors.validation(`Line ${l.lineNo}: formula produced a negative quantity`);
      let factor = D(1);
      if (l.uomCode !== l.material.uom.code) {
        const c = conversions.find((x) => x.itemId === l.materialId && x.uomCode === l.uomCode);
        if (!c) throw Errors.validation(`Line ${l.lineNo}: missing conversion ${l.uomCode} → ${l.material.uom.code}`);
        factor = D(c.factorToBase);
      }
      const qtyPerUnit = lineQty.mul(factor).div(v.outputQuantity);
      const standard = qtyPerUnit.mul(quantity);
      const required = q4up(standard.mul(D(1).plus(D(l.wastagePercent).div(100))));
      const row = {
        bomLineId: l.id,
        lineNo: l.lineNo,
        materialId: l.materialId,
        material: l.material,
        uom: l.material.uom.code,
        stage: l.stageDefinition,
        stageDefinitionId: l.stageDefinitionId,
        consumptionMode: l.consumptionMode,
        qtyPerUnit: qtyPerUnit.toDecimalPlaces(6),
        wastagePercent: D(l.wastagePercent),
        standardQty: q4up(standard),
        requiredQty: required,
        isOptional: l.isOptional,
        alternatives: l.alternatives.map((a) => ({ materialId: a.materialId, material: a.material, conversionFactor: Number(a.conversionFactor), priority: a.priority })),
        available: null as Decimal | null,
        shortage: null as Decimal | null,
      };
      if (opts.withAvailability !== false) {
        row.available = await this.ledger.availableQty(db as PrismaService, l.materialId, opts.warehouseId);
        row.shortage = Decimal.max(0, required.minus(row.available));
      }
      out.push(row);
    }
    return { version: { id: v.id, version: v.version, status: v.status, outputQuantity: Number(v.outputQuantity) }, item: v.bom.item, quantity, variables: vars, lines: out };
  }
}

function norm(v: unknown) {
  if (v === null || v === undefined) return null;
  if (Prisma.Decimal.isDecimal(v)) return Number(v);
  return v;
}

function toLineInput(l: {
  materialId: string;
  quantity: Prisma.Decimal;
  quantityFormula: string | null;
  uomCode: string;
  wastagePercent: Prisma.Decimal;
  stageDefinitionId: string | null;
  consumptionMode: ConsumptionMode;
  specifications: string | null;
  notes: string | null;
  isOptional: boolean;
  alternatives: { materialId: string; conversionFactor: Prisma.Decimal; priority: number; notes: string | null }[];
}): BomLineInput {
  return {
    materialId: l.materialId,
    quantity: Number(l.quantity),
    quantityFormula: l.quantityFormula,
    uomCode: l.uomCode,
    wastagePercent: Number(l.wastagePercent),
    stageDefinitionId: l.stageDefinitionId,
    consumptionMode: l.consumptionMode,
    specifications: l.specifications,
    notes: l.notes,
    isOptional: l.isOptional,
    alternatives: l.alternatives.map((a) => ({ materialId: a.materialId, conversionFactor: Number(a.conversionFactor), priority: a.priority, notes: a.notes ?? undefined })),
  };
}
