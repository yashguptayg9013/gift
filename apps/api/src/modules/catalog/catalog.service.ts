import { Injectable } from '@nestjs/common';
import { ItemType, LocationType, Prisma, ProductStatus } from '@prisma/client';
import { D, serialize } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AttributeDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  unit?: string;
  options?: string[];
  required?: boolean;
}

export interface ItemInput {
  type?: ItemType;
  code?: string;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  uomCode?: string;
  attributes?: Record<string, unknown>;
  specifications?: string | null;
  colour?: string | null;
  dimensions?: string | null;
  productId?: string | null;
  variantName?: string | null;
  routeId?: string | null;
  status?: ProductStatus;
  minStock?: number;
  reorderLevel?: number;
  reorderQty?: number;
  trackBatches?: boolean;
  requiresInspection?: boolean;
  standardCost?: number | null;
  sellingPrice?: number | null;
  taxRate?: number | null;
  hsnCode?: string | null;
  defaultSupplierId?: string | null;
  defaultLocationId?: string | null;
  imageFileId?: string | null;
  remarks?: string | null;
  isActive?: boolean;
  conversions?: { uomCode: string; factorToBase: number }[];
}

const ATTR_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export function validateAttributeSchema(schema: unknown): AttributeDef[] {
  if (!Array.isArray(schema)) throw Errors.validation('attributeSchema must be an array');
  const keys = new Set<string>();
  return schema.map((raw, i) => {
    const a = raw as AttributeDef;
    if (!a || typeof a !== 'object') throw Errors.validation(`Attribute #${i + 1} is invalid`);
    if (!ATTR_KEY.test(a.key ?? '')) throw Errors.validation(`Attribute key "${a.key}" must be lower_snake_case`);
    if (keys.has(a.key)) throw Errors.validation(`Duplicate attribute key "${a.key}"`);
    keys.add(a.key);
    if (!['number', 'text', 'select'].includes(a.type)) throw Errors.validation(`Attribute "${a.key}" has invalid type`);
    if (a.type === 'select' && (!Array.isArray(a.options) || !a.options.length)) throw Errors.validation(`Attribute "${a.key}" needs options`);
    return { key: a.key, label: String(a.label ?? a.key).slice(0, 60), type: a.type, unit: a.unit?.slice(0, 10), options: a.options?.map(String), required: !!a.required };
  });
}

export function validateAttributes(schema: AttributeDef[], values: Record<string, unknown> = {}): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const def of schema) {
    const v = values[def.key];
    if (v === undefined || v === null || v === '') {
      if (def.required) throw Errors.validation(`${def.label} is required`);
      continue;
    }
    if (def.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw Errors.validation(`${def.label} must be a number`);
      out[def.key] = n;
    } else if (def.type === 'select') {
      if (!def.options!.includes(String(v))) throw Errors.validation(`${def.label} must be one of ${def.options!.join(', ')}`);
      out[def.key] = String(v);
    } else {
      out[def.key] = String(v).slice(0, 200);
    }
  }
  // keep unknown keys out — attributes are schema driven
  return out;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Units ─────────────────────────────────────────────

  uoms() {
    return this.prisma.uom.findMany({ orderBy: [{ dimension: 'asc' }, { code: 'asc' }] });
  }

  async createUom(dto: { code: string; name: string; dimension: Prisma.UomCreateInput['dimension']; precision: number }) {
    const u = await this.prisma.uom.create({ data: { ...dto, code: dto.code.toUpperCase() } });
    await this.audit.record({ action: 'uom.created', entityType: 'Uom', entityId: u.id, after: u });
    return u;
  }

  // ─── Categories ────────────────────────────────────────

  categories(type?: ItemType) {
    return this.prisma.itemCategory.findMany({ where: { type }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { items: true } } } });
  }

  async upsertCategory(id: string | null, dto: { type?: ItemType; code?: string; name: string; description?: string; attributeSchema?: unknown; defaultUomCode?: string; isActive?: boolean; parentId?: string | null }) {
    const attributeSchema = dto.attributeSchema !== undefined ? (validateAttributeSchema(dto.attributeSchema) as unknown as Prisma.InputJsonValue) : undefined;
    const defaultUomId = dto.defaultUomCode ? (await this.prisma.uom.findUniqueOrThrow({ where: { code: dto.defaultUomCode } })).id : undefined;
    if (id) {
      const before = await this.prisma.itemCategory.findUniqueOrThrow({ where: { id } });
      const c = await this.prisma.itemCategory.update({ where: { id }, data: { name: dto.name, description: dto.description, attributeSchema, defaultUomId, isActive: dto.isActive, parentId: dto.parentId } });
      await this.audit.record({ action: 'category.updated', entityType: 'ItemCategory', entityId: id, before, after: c });
      return c;
    }
    if (!dto.type || !dto.code) throw Errors.validation('type and code are required');
    const c = await this.prisma.itemCategory.create({
      data: { type: dto.type, code: dto.code.toUpperCase(), name: dto.name, description: dto.description, attributeSchema: attributeSchema ?? [], defaultUomId, parentId: dto.parentId },
    });
    await this.audit.record({ action: 'category.created', entityType: 'ItemCategory', entityId: c.id, after: c });
    return c;
  }

  // ─── Warehouses & locations ────────────────────────────

  warehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { code: 'asc' }, include: { locations: { orderBy: [{ type: 'asc' }, { code: 'asc' }] } } });
  }

  async upsertWarehouse(id: string | null, dto: { code?: string; name: string; address?: string; isActive?: boolean; allowNegativeStock?: boolean }) {
    if (id) {
      const before = await this.prisma.warehouse.findUniqueOrThrow({ where: { id } });
      const w = await this.prisma.warehouse.update({ where: { id }, data: { name: dto.name, address: dto.address, isActive: dto.isActive, allowNegativeStock: dto.allowNegativeStock } });
      await this.audit.record({ action: 'warehouse.updated', entityType: 'Warehouse', entityId: id, before, after: w });
      return w;
    }
    if (!dto.code) throw Errors.validation('code is required');
    const w = await this.prisma.$transaction(async (tx) => {
      const w = await tx.warehouse.create({ data: { code: dto.code!.toUpperCase(), name: dto.name, address: dto.address, allowNegativeStock: dto.allowNegativeStock ?? false } });
      // every warehouse gets the standard location types
      const defaults: [string, string, LocationType, boolean][] = [
        ['STORE', 'Main store', 'STORAGE', true],
        ['RECEIVING', 'Receiving bay', 'RECEIVING', false],
        ['QC-HOLD', 'Quality hold', 'QC_HOLD', false],
        ['REJECTED', 'Rejected stock', 'REJECTED', false],
        ['WIP', 'Production floor', 'PRODUCTION', false],
      ];
      await tx.location.createMany({ data: defaults.map(([code, name, type, isDefault]) => ({ warehouseId: w.id, code, name, type, isDefault })) });
      return w;
    });
    await this.audit.record({ action: 'warehouse.created', entityType: 'Warehouse', entityId: w.id, after: w });
    return w;
  }

  async upsertLocation(id: string | null, dto: { warehouseId?: string; code?: string; name: string; type?: LocationType; isActive?: boolean; isDefault?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      let loc;
      if (id) {
        const before = await tx.location.findUniqueOrThrow({ where: { id } });
        if (dto.isActive === false) {
          const bal = await tx.stockBalance.aggregate({ where: { locationId: id }, _sum: { onHand: true } });
          if (D(bal._sum.onHand ?? 0).gt(0)) throw Errors.rule('LOCATION_HAS_STOCK', 'Move stock out of this location before deactivating it');
        }
        loc = await tx.location.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive, isDefault: dto.isDefault, type: dto.type } });
        await this.audit.record({ action: 'location.updated', entityType: 'Location', entityId: id, before, after: loc }, tx);
      } else {
        if (!dto.warehouseId || !dto.code) throw Errors.validation('warehouseId and code are required');
        loc = await tx.location.create({ data: { warehouseId: dto.warehouseId, code: dto.code.toUpperCase(), name: dto.name, type: dto.type ?? LocationType.STORAGE, isDefault: dto.isDefault ?? false } });
        await this.audit.record({ action: 'location.created', entityType: 'Location', entityId: loc.id, after: loc }, tx);
      }
      if (loc.isDefault) await tx.location.updateMany({ where: { warehouseId: loc.warehouseId, id: { not: loc.id }, type: loc.type }, data: { isDefault: false } });
      return loc;
    });
  }

  // ─── Items (materials and product variants) ────────────

  async listItems(q: { type?: ItemType; categoryId?: string; productId?: string; search?: string; includeInactive?: boolean; skip: number; take: number; orderBy?: Prisma.ItemOrderByWithRelationInput }) {
    const where: Prisma.ItemWhereInput = {
      type: q.type,
      categoryId: q.categoryId,
      productId: q.productId,
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search
        ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }, { colour: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy ?? { code: 'asc' },
        include: { uom: { select: { code: true } }, category: { select: { id: true, code: true, name: true } }, product: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.item.count({ where }),
    ]);
    return { rows: serialize(rows), total };
  }

  async getItem(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        uom: true,
        category: true,
        product: { select: { id: true, code: true, name: true } },
        route: { select: { id: true, code: true, name: true } },
        uomConversions: true,
        supplierItems: { include: { supplier: { select: { id: true, code: true, name: true } } } },
        bom: { select: { id: true, code: true, versions: { where: { status: 'ACTIVE' }, select: { id: true, version: true } } } },
      },
    });
    if (!item) throw Errors.notFound('Item', id);
    return serialize(item);
  }

  async createItem(dto: ItemInput, actor: AuthUser) {
    if (!dto.type || !dto.code || !dto.name || !dto.uomCode) throw Errors.validation('type, code, name and uomCode are required');
    const data = await this.itemData(dto, dto.type);
    const item = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.create({ data: { ...data, type: dto.type!, code: dto.code!.trim().toUpperCase(), name: dto.name!.trim() } as Prisma.ItemUncheckedCreateInput });
      if (dto.conversions?.length) await tx.itemUomConversion.createMany({ data: dto.conversions.map((c) => ({ itemId: item.id, uomCode: c.uomCode, factorToBase: c.factorToBase })) });
      await this.audit.record({ action: 'item.created', entityType: 'Item', entityId: item.id, summary: `${item.code} ${item.name}`, after: item, actorId: actor.id }, tx);
      return item;
    });
    return this.getItem(item.id);
  }

  async updateItem(id: string, dto: ItemInput, actor: AuthUser) {
    const before = await this.prisma.item.findUnique({ where: { id }, include: { uom: true } });
    if (!before) throw Errors.notFound('Item', id);
    if (dto.uomCode && dto.uomCode !== before.uom.code) {
      const moved = await this.prisma.stockMovement.count({ where: { itemId: id } });
      if (moved) throw Errors.rule('UOM_LOCKED', 'Base unit cannot change after stock movements exist');
    }
    const data = await this.itemData(dto, before.type, before.categoryId);
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.item.update({ where: { id }, data: { ...data, name: dto.name?.trim() } as Prisma.ItemUncheckedUpdateInput });
      if (dto.conversions) {
        await tx.itemUomConversion.deleteMany({ where: { itemId: id } });
        await tx.itemUomConversion.createMany({ data: dto.conversions.map((c) => ({ itemId: id, uomCode: c.uomCode, factorToBase: c.factorToBase })) });
      }
      await this.audit.record({ action: 'item.updated', entityType: 'Item', entityId: id, before, after, actorId: actor.id }, tx);
    });
    return this.getItem(id);
  }

  private async itemData(dto: ItemInput, type: ItemType, existingCategoryId?: string | null) {
    let uomId: string | undefined;
    if (dto.uomCode) {
      const uom = await this.prisma.uom.findUnique({ where: { code: dto.uomCode } });
      if (!uom) throw Errors.validation(`Unknown unit ${dto.uomCode}`);
      uomId = uom.id;
    }
    const categoryId = dto.categoryId !== undefined ? dto.categoryId : existingCategoryId;
    let attributes: Record<string, string | number> | undefined;
    if (dto.attributes !== undefined || dto.categoryId) {
      const cat = categoryId ? await this.prisma.itemCategory.findUnique({ where: { id: categoryId } }) : null;
      if (categoryId && !cat) throw Errors.validation('Unknown category');
      if (cat && cat.type !== type) throw Errors.validation(`Category ${cat.name} is for ${cat.type.toLowerCase()} items`);
      attributes = validateAttributes(cat ? (cat.attributeSchema as unknown as AttributeDef[]) : [], dto.attributes ?? {});
    }
    for (const [k, v] of Object.entries({ minStock: dto.minStock, reorderLevel: dto.reorderLevel, reorderQty: dto.reorderQty })) {
      if (v !== undefined && v < 0) throw Errors.validation(`${k} cannot be negative`);
    }
    if (dto.productId) {
      const p = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!p) throw Errors.validation('Unknown product');
    }
    return {
      description: dto.description,
      categoryId: dto.categoryId,
      uomId,
      attributes: attributes as Prisma.InputJsonValue | undefined,
      specifications: dto.specifications,
      colour: dto.colour ?? (attributes?.colour as string | undefined),
      dimensions: dto.dimensions,
      productId: dto.productId,
      variantName: dto.variantName,
      routeId: dto.routeId,
      status: dto.status,
      minStock: dto.minStock,
      reorderLevel: dto.reorderLevel,
      reorderQty: dto.reorderQty,
      trackBatches: dto.trackBatches,
      requiresInspection: dto.requiresInspection,
      standardCost: dto.standardCost,
      sellingPrice: dto.sellingPrice,
      taxRate: dto.taxRate,
      hsnCode: dto.hsnCode,
      defaultSupplierId: dto.defaultSupplierId,
      defaultLocationId: dto.defaultLocationId,
      imageFileId: dto.imageFileId,
      remarks: dto.remarks,
      isActive: dto.isActive,
    };
  }

  // ─── Products (variant templates) ──────────────────────

  async listProducts(q: { search?: string; categoryId?: string; status?: ProductStatus; skip: number; take: number }) {
    const where: Prisma.ProductWhereInput = {
      categoryId: q.categoryId,
      status: q.status,
      ...(q.search ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } }, _count: { select: { variants: true } }, defaultRoute: { select: { id: true, name: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { rows, total };
  }

  async getProduct(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        defaultRoute: { select: { id: true, code: true, name: true } },
        variants: { orderBy: { code: 'asc' }, include: { uom: { select: { code: true } }, bom: { select: { id: true, versions: { where: { status: 'ACTIVE' }, select: { id: true, version: true } } } } } },
      },
    });
    if (!p) throw Errors.notFound('Product', id);
    return serialize(p);
  }

  async upsertProduct(id: string | null, dto: { code?: string; name: string; categoryId?: string | null; description?: string | null; manufacturingSpecs?: string | null; imageFileId?: string | null; status?: ProductStatus; defaultRouteId?: string | null }, actor: AuthUser) {
    if (dto.categoryId) {
      const cat = await this.prisma.itemCategory.findUnique({ where: { id: dto.categoryId } });
      if (!cat || cat.type !== ItemType.PRODUCT) throw Errors.validation('Category must be a product category');
    }
    if (id) {
      const before = await this.prisma.product.findUniqueOrThrow({ where: { id } });
      const p = await this.prisma.product.update({ where: { id }, data: { ...dto, code: undefined } });
      await this.audit.record({ action: 'product.updated', entityType: 'Product', entityId: id, before, after: p, actorId: actor.id });
      return this.getProduct(id);
    }
    if (!dto.code) throw Errors.validation('code is required');
    const p = await this.prisma.product.create({ data: { ...dto, code: dto.code.trim().toUpperCase() } });
    await this.audit.record({ action: 'product.created', entityType: 'Product', entityId: p.id, after: p, actorId: actor.id });
    return this.getProduct(p.id);
  }

  /** Create several colour/size variants at once, e.g. Black, Blue, Brown, Tan, Grey. */
  async createVariants(productId: string, variants: { variantName: string; code: string; colour?: string; attributes?: Record<string, unknown>; sellingPrice?: number; taxRate?: number; hsnCode?: string; minStock?: number }[], actor: AuthUser) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Errors.notFound('Product', productId);
    const created = [];
    for (const v of variants) {
      created.push(
        await this.createItem(
          {
            type: ItemType.PRODUCT,
            code: v.code,
            name: `${product.name} — ${v.variantName}`,
            productId,
            variantName: v.variantName,
            colour: v.colour ?? v.variantName,
            categoryId: product.categoryId,
            attributes: v.attributes ?? {},
            uomCode: 'PCS',
            routeId: product.defaultRouteId,
            sellingPrice: v.sellingPrice,
            taxRate: v.taxRate,
            hsnCode: v.hsnCode,
            minStock: v.minStock,
            description: product.description,
          },
          actor,
        ),
      );
    }
    return created;
  }

  /** Lightweight search across items/customers/suppliers/documents for the ⌘K palette. */
  async globalSearch(term: string, can: (p: string) => boolean) {
    const t = term.trim();
    if (t.length < 2) return [];
    const ci = { contains: t, mode: 'insensitive' as const };
    const results: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
    const tasks: Promise<void>[] = [];
    if (can('inventory.view') || can('product.view')) {
      tasks.push(
        this.prisma.item.findMany({ where: { OR: [{ code: ci }, { name: ci }] }, take: 8, select: { id: true, code: true, name: true, type: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: r.type === 'MATERIAL' ? 'Material' : 'Product', id: r.id, title: r.name, subtitle: r.code, href: r.type === 'MATERIAL' ? `/inventory/materials/${r.id}` : `/inventory/products/variant/${r.id}` })),
        ),
      );
    }
    if (can('production.view')) {
      tasks.push(
        this.prisma.productionOrder.findMany({ where: { number: ci }, take: 5, select: { id: true, number: true, status: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: 'Production order', id: r.id, title: r.number, subtitle: r.status, href: `/manufacturing/orders/${r.id}` })),
        ),
      );
    }
    if (can('sales.view')) {
      tasks.push(
        this.prisma.customer.findMany({ where: { OR: [{ companyName: ci }, { code: ci }, { gstin: ci }] }, take: 5, select: { id: true, companyName: true, code: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: 'Customer', id: r.id, title: r.companyName, subtitle: r.code, href: `/customers/${r.id}` })),
        ),
        this.prisma.salesOrder.findMany({ where: { OR: [{ number: ci }, { customerPoNumber: ci }] }, take: 5, select: { id: true, number: true, status: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: 'Sales order', id: r.id, title: r.number, subtitle: r.status, href: `/sales/orders/${r.id}` })),
        ),
      );
    }
    if (can('procurement.view')) {
      tasks.push(
        this.prisma.supplier.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 5, select: { id: true, name: true, code: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: 'Supplier', id: r.id, title: r.name, subtitle: r.code, href: `/suppliers/${r.id}` })),
        ),
        this.prisma.purchaseOrder.findMany({ where: { number: ci }, take: 5, select: { id: true, number: true, status: true } }).then((rows) =>
          rows.forEach((r) => results.push({ type: 'Purchase order', id: r.id, title: r.number, subtitle: r.status, href: `/procurement/orders/${r.id}` })),
        ),
      );
    }
    await Promise.all(tasks);
    return results;
  }
}
