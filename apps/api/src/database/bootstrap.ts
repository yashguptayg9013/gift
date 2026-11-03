/**
 * Idempotent bootstrap data: structural configuration only (no business records).
 *   - permissions/roles from @puja/shared
 *   - units of measure
 *   - default warehouse + location types
 *   - manufacturing stage definitions and material/product categories named in the
 *     business brief (all editable from the UI)
 *   - first administrator (only when no user exists and BOOTSTRAP_ADMIN_* is set)
 */
import { ItemType, LocationType, PrismaClient, UomDimension } from '@prisma/client';
import { ROLE_TEMPLATES } from '@puja/shared';
import * as argon2 from 'argon2';

const UOMS: { code: string; name: string; dimension: UomDimension; precision: number }[] = [
  { code: 'PCS', name: 'Pieces', dimension: 'COUNT', precision: 0 },
  { code: 'SET', name: 'Sets', dimension: 'COUNT', precision: 0 },
  { code: 'PAIR', name: 'Pairs', dimension: 'COUNT', precision: 0 },
  { code: 'DOZEN', name: 'Dozens', dimension: 'COUNT', precision: 2 },
  { code: 'BOX', name: 'Boxes', dimension: 'COUNT', precision: 0 },
  { code: 'PACK', name: 'Packs', dimension: 'COUNT', precision: 0 },
  { code: 'SHEET', name: 'Sheets', dimension: 'COUNT', precision: 0 },
  { code: 'ROLL', name: 'Rolls', dimension: 'COUNT', precision: 2 },
  { code: 'M', name: 'Metres', dimension: 'LENGTH', precision: 3 },
  { code: 'CM', name: 'Centimetres', dimension: 'LENGTH', precision: 1 },
  { code: 'MM', name: 'Millimetres', dimension: 'LENGTH', precision: 0 },
  { code: 'YD', name: 'Yards', dimension: 'LENGTH', precision: 3 },
  { code: 'M2', name: 'Square metres', dimension: 'AREA', precision: 4 },
  { code: 'SQFT', name: 'Square feet', dimension: 'AREA', precision: 3 },
  { code: 'KG', name: 'Kilograms', dimension: 'WEIGHT', precision: 3 },
  { code: 'G', name: 'Grams', dimension: 'WEIGHT', precision: 0 },
  { code: 'L', name: 'Litres', dimension: 'VOLUME', precision: 3 },
];

const LOCATIONS: { code: string; name: string; type: LocationType; isDefault?: boolean }[] = [
  { code: 'STORE', name: 'Main store', type: 'STORAGE', isDefault: true },
  { code: 'RECEIVING', name: 'Receiving bay', type: 'RECEIVING' },
  { code: 'QC-HOLD', name: 'Quality hold', type: 'QC_HOLD' },
  { code: 'REJECTED', name: 'Rejected stock', type: 'REJECTED' },
  { code: 'WIP', name: 'Production floor', type: 'PRODUCTION' },
];

/** Stages listed in the business brief (shop-floor operations). */
const STAGES = [
  { code: 'PU_CUTTING', name: 'PU cutting' },
  { code: 'CARDBOARD_CUTTING', name: 'Cardboard cutting' },
  { code: 'FOAM_CUTTING', name: 'Foam cutting' },
  { code: 'EMBOSSING', name: 'Embossing' },
  { code: 'METAL_FITTING', name: 'Metal fitting' },
  { code: 'STITCHING', name: 'Stitching' },
  { code: 'ASSEMBLY', name: 'Assembly' },
  { code: 'QUALITY_CONTROL', name: 'Quality control', isQcStage: true },
];

type Attr = { key: string; label: string; type: 'number' | 'text' | 'select'; unit?: string; options?: string[]; required?: boolean };

/** Material categories listed in the business brief with their measurable attributes. */
const MATERIAL_CATEGORIES: { code: string; name: string; uom: string; attributes: Attr[] }[] = [
  {
    code: 'PU_LEATHER',
    name: 'PU leather',
    uom: 'M',
    attributes: [
      { key: 'thickness_mm', label: 'Thickness', type: 'select', unit: 'mm', options: ['0.7', '1.2'], required: true },
      { key: 'colour', label: 'Colour', type: 'text', required: true },
      { key: 'form', label: 'Form', type: 'select', options: ['ROLL', 'SHEET'] },
      { key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' },
      { key: 'length_m', label: 'Length per roll/sheet', type: 'number', unit: 'm' },
    ],
  },
  {
    code: 'CARDBOARD',
    name: 'Cardboard',
    uom: 'SHEET',
    attributes: [
      { key: 'thickness_mm', label: 'Thickness', type: 'number', unit: 'mm', required: true },
      { key: 'length_mm', label: 'Length', type: 'number', unit: 'mm' },
      { key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' },
    ],
  },
  {
    code: 'FOAM',
    name: 'Foam',
    uom: 'SHEET',
    attributes: [
      { key: 'thickness_mm', label: 'Thickness', type: 'number', unit: 'mm', required: true },
      { key: 'length_mm', label: 'Length', type: 'number', unit: 'mm' },
      { key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' },
    ],
  },
  {
    code: 'METAL_FITTING',
    name: 'Metal fittings',
    uom: 'PCS',
    attributes: [
      { key: 'variant', label: 'Variant', type: 'text', required: true },
      { key: 'finish', label: 'Finish', type: 'text' },
    ],
  },
  { code: 'ELASTIC', name: 'Elastic', uom: 'M', attributes: [{ key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' }, { key: 'colour', label: 'Colour', type: 'text' }] },
  { code: 'RIBBON', name: 'Ribbon', uom: 'M', attributes: [{ key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' }, { key: 'colour', label: 'Colour', type: 'text' }] },
  { code: 'PEN_LOOP', name: 'Pen loops', uom: 'PCS', attributes: [{ key: 'colour', label: 'Colour', type: 'text' }, { key: 'size', label: 'Size', type: 'text' }] },
  { code: 'OTHER', name: 'Other materials', uom: 'PCS', attributes: [] },
];

const PRODUCT_ATTRS: Attr[] = [
  { key: 'length_mm', label: 'Length', type: 'number', unit: 'mm' },
  { key: 'width_mm', label: 'Width', type: 'number', unit: 'mm' },
  { key: 'thickness_mm', label: 'Thickness', type: 'number', unit: 'mm' },
];

/** Product families listed in the business brief. */
const PRODUCT_CATEGORIES = [
  { code: 'NOTEBOOK', name: 'Notebooks' },
  { code: 'DIARY', name: 'Diaries' },
  { code: 'ORGANIZER', name: 'Organizers' },
  { code: 'PU_LEATHER_PRODUCT', name: 'PU leather products' },
  { code: 'CORPORATE_GIFT', name: 'Corporate gifting' },
  { code: 'CUSTOM', name: 'Custom manufactured' },
];

export async function bootstrap(prisma: PrismaClient, opts: { log?: (m: string) => void; admin?: { email: string; password: string; name: string } } = {}) {
  const log = opts.log ?? (() => undefined);

  // Roles: create missing system roles; keep administrator in sync with the full catalog.
  for (const t of ROLE_TEMPLATES) {
    const existing = await prisma.role.findUnique({ where: { key: t.key } });
    if (!existing) {
      await prisma.role.create({
        data: { key: t.key, name: t.name, description: t.description, isSystem: true, permissions: { create: t.permissions.map((permission) => ({ permission })) } },
      });
      log(`role created: ${t.name}`);
    } else if (t.key === 'administrator') {
      await prisma.rolePermission.createMany({ data: t.permissions.map((permission) => ({ roleId: existing.id, permission })), skipDuplicates: true });
    }
  }

  for (const u of UOMS) await prisma.uom.upsert({ where: { code: u.code }, create: u, update: {} });

  let wh = await prisma.warehouse.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!wh) {
    wh = await prisma.warehouse.create({ data: { code: 'MAIN', name: 'Main warehouse' } });
    log('warehouse created: MAIN');
  }
  for (const l of LOCATIONS) {
    await prisma.location.upsert({
      where: { warehouseId_code: { warehouseId: wh.id, code: l.code } },
      create: { ...l, warehouseId: wh.id },
      update: {},
    });
  }

  for (const [i, s] of STAGES.entries()) {
    await prisma.stageDefinition.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, defaultSequence: (i + 1) * 10, isQcStage: s.isQcStage ?? false },
      update: {},
    });
  }

  const uomByCode = Object.fromEntries((await prisma.uom.findMany()).map((u) => [u.code, u.id]));
  for (const [i, c] of MATERIAL_CATEGORIES.entries()) {
    await prisma.itemCategory.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, type: ItemType.MATERIAL, attributeSchema: c.attributes, defaultUomId: uomByCode[c.uom], sortOrder: i },
      update: {},
    });
  }
  for (const [i, c] of PRODUCT_CATEGORIES.entries()) {
    await prisma.itemCategory.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, type: ItemType.PRODUCT, attributeSchema: PRODUCT_ATTRS, defaultUomId: uomByCode.PCS, sortOrder: i },
      update: {},
    });
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    if (opts.admin) {
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
      await prisma.user.create({
        data: {
          email: opts.admin.email.toLowerCase(),
          name: opts.admin.name,
          passwordHash: await argon2.hash(opts.admin.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
          roles: { create: [{ roleId: adminRole.id }] },
        },
      });
      log(`administrator created: ${opts.admin.email}`);
    } else {
      log('No users exist. Set BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME and re-run the seed to create the first administrator.');
    }
  }
}
