import { z } from 'zod';
import { serialize } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';

type FieldKind = 'string' | 'number' | 'date' | 'boolean' | 'enum';

interface EntityDef {
  model: string;
  permission: string;
  fields: Record<string, FieldKind>;
  defaultSelect: string[];
  defaultOrder: string;
  description: string;
}

/**
 * Whitelisted entities the copilot may query. Only these models, fields and
 * operators exist; everything is compiled to parameterised Prisma calls.
 */
export const QUERY_ENTITIES: Record<string, EntityDef> = {
  items: {
    model: 'item',
    permission: 'inventory.view',
    description: 'Materials and finished-goods SKUs',
    fields: { code: 'string', name: 'string', type: 'enum', colour: 'string', minStock: 'number', reorderLevel: 'number', reorderQty: 'number', sellingPrice: 'number', lastPurchasePrice: 'number', isActive: 'boolean', createdAt: 'date' },
    defaultSelect: ['code', 'name', 'type', 'reorderLevel'],
    defaultOrder: 'code',
  },
  production_orders: {
    model: 'productionOrder',
    permission: 'production.view',
    description: 'Production (manufacturing) orders',
    fields: { number: 'string', status: 'enum', priority: 'enum', quantityPlanned: 'number', quantityCompleted: 'number', quantityRejected: 'number', quantityRework: 'number', dueDate: 'date', createdAt: 'date', startedAt: 'date', completedAt: 'date' },
    defaultSelect: ['number', 'status', 'priority', 'quantityPlanned', 'quantityCompleted', 'dueDate'],
    defaultOrder: 'createdAt',
  },
  sales_orders: {
    model: 'salesOrder',
    permission: 'sales.view',
    description: 'Customer sales orders',
    fields: { number: 'string', status: 'enum', orderDate: 'date', requiredBy: 'date', customerPoNumber: 'string', subtotal: 'number', taxTotal: 'number', total: 'number' },
    defaultSelect: ['number', 'status', 'orderDate', 'requiredBy', 'total'],
    defaultOrder: 'orderDate',
  },
  purchase_orders: {
    model: 'purchaseOrder',
    permission: 'procurement.view',
    description: 'Purchase orders to suppliers',
    fields: { number: 'string', status: 'enum', orderDate: 'date', expectedDate: 'date', subtotal: 'number', total: 'number' },
    defaultSelect: ['number', 'status', 'orderDate', 'expectedDate', 'total'],
    defaultOrder: 'orderDate',
  },
  customers: {
    model: 'customer',
    permission: 'sales.view',
    description: 'Customers',
    fields: { code: 'string', companyName: 'string', city: 'string', state: 'string', gstin: 'string', isActive: 'boolean', createdAt: 'date' },
    defaultSelect: ['code', 'companyName', 'city', 'state'],
    defaultOrder: 'companyName',
  },
  suppliers: {
    model: 'supplier',
    permission: 'procurement.view',
    description: 'Suppliers',
    fields: { code: 'string', name: 'string', city: 'string', state: 'string', leadTimeDays: 'number', isActive: 'boolean' },
    defaultSelect: ['code', 'name', 'city', 'leadTimeDays'],
    defaultOrder: 'name',
  },
  inventory_transactions: {
    model: 'inventoryTransaction',
    permission: 'inventory.view',
    description: 'Inventory ledger transactions (documents)',
    fields: { number: 'string', type: 'enum', status: 'enum', postedAt: 'date', referenceNumber: 'string', reason: 'string' },
    defaultSelect: ['number', 'type', 'postedAt', 'referenceNumber', 'reason'],
    defaultOrder: 'postedAt',
  },
  quality_inspections: {
    model: 'qualityInspection',
    permission: 'quality.view',
    description: 'Quality inspections',
    fields: { number: 'string', type: 'enum', status: 'enum', quantityInspected: 'number', quantityAccepted: 'number', quantityRejected: 'number', quantityRework: 'number', completedAt: 'date', createdAt: 'date' },
    defaultSelect: ['number', 'type', 'status', 'quantityAccepted', 'quantityRejected', 'completedAt'],
    defaultOrder: 'createdAt',
  },
  workers: {
    model: 'worker',
    permission: 'workforce.view',
    description: 'Production workers',
    fields: { code: 'string', name: 'string', jobRole: 'string', isActive: 'boolean', joinedOn: 'date' },
    defaultSelect: ['code', 'name', 'jobRole', 'isActive'],
    defaultOrder: 'name',
  },
};

const scalar = z.union([z.string().max(200), z.number(), z.boolean()]);

export const recordQuerySchema = z.object({
  entity: z.enum(Object.keys(QUERY_ENTITIES) as [string, ...string[]]),
  select: z.array(z.string()).max(15).optional(),
  filters: z
    .array(z.object({ field: z.string(), op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']), value: z.union([scalar, z.array(scalar).max(50)]) }))
    .max(10)
    .optional(),
  orderBy: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']).default('desc') }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  aggregate: z
    .object({ fn: z.enum(['count', 'sum', 'avg', 'min', 'max']), field: z.string().optional(), groupBy: z.string().optional() })
    .optional(),
});
export type RecordQuery = z.infer<typeof recordQuerySchema>;

function coerce(kind: FieldKind, v: unknown) {
  if (kind === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw Errors.validation(`Expected a number, got ${String(v)}`);
    return n;
  }
  if (kind === 'date') {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw Errors.validation(`Expected an ISO date, got ${String(v)}`);
    return d;
  }
  if (kind === 'boolean') return v === true || v === 'true';
  return String(v);
}

export async function runRecordQuery(prisma: PrismaService, input: RecordQuery, user: AuthUser) {
  const def = QUERY_ENTITIES[input.entity];
  if (!hasPermission(user, def.permission)) throw Errors.forbidden(`You do not have access to ${input.entity}`);
  const field = (f: string) => {
    if (!(f in def.fields)) throw Errors.validation(`Unknown field "${f}" for ${input.entity}. Allowed: ${Object.keys(def.fields).join(', ')}`);
    return def.fields[f];
  };

  const where: Record<string, unknown> = {};
  for (const f of input.filters ?? []) {
    const kind = field(f.field);
    const cond: Record<string, unknown> = (where[f.field] as Record<string, unknown>) ?? {};
    if (f.op === 'in') {
      if (!Array.isArray(f.value)) throw Errors.validation('"in" needs an array value');
      cond.in = f.value.map((v) => coerce(kind, v));
    } else {
      if (Array.isArray(f.value)) throw Errors.validation(`"${f.op}" needs a single value`);
      const v = coerce(kind, f.value);
      if (f.op === 'contains') {
        if (kind !== 'string') throw Errors.validation('"contains" works on text fields only');
        cond.contains = v;
        cond.mode = 'insensitive';
      } else if (f.op === 'eq') cond.equals = v;
      else if (f.op === 'neq') cond.not = v;
      else {
        if (kind === 'string' || kind === 'boolean' || kind === 'enum') throw Errors.validation(`"${f.op}" works on number and date fields only`);
        cond[f.op] = v;
      }
    }
    where[f.field] = cond;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[def.model];
  if (input.aggregate) {
    const { fn, groupBy } = input.aggregate;
    const target = input.aggregate.field;
    if (fn !== 'count') {
      if (!target || field(target) !== 'number') throw Errors.validation(`${fn} requires a numeric field`);
    }
    if (groupBy) {
      const gk = field(groupBy);
      if (gk === 'number' || gk === 'date') throw Errors.validation('groupBy must be a text, enum or boolean field');
      const rows = await delegate.groupBy({
        by: [groupBy],
        where,
        ...(fn === 'count' ? { _count: { _all: true } } : { [`_${fn}`]: { [target!]: true } }),
        orderBy: { [groupBy]: 'asc' },
        take: input.limit,
      });
      return serialize({ entity: input.entity, aggregate: input.aggregate, groups: rows });
    }
    const r = fn === 'count' ? { count: await delegate.count({ where }) } : await delegate.aggregate({ where, [`_${fn}`]: { [target!]: true } });
    return serialize({ entity: input.entity, aggregate: input.aggregate, result: r });
  }

  const select = (input.select?.length ? input.select : def.defaultSelect).reduce<Record<string, true>>((acc, f) => {
    field(f);
    acc[f] = true;
    return acc;
  }, { id: true });
  const orderField = input.orderBy?.field ?? def.defaultOrder;
  field(orderField);
  const rows = await delegate.findMany({ where, select, orderBy: { [orderField]: input.orderBy?.direction ?? 'desc' }, take: input.limit });
  const total = await delegate.count({ where });
  return serialize({ entity: input.entity, total, returned: rows.length, rows });
}
