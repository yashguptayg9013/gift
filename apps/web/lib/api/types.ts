/** Response shapes of the PUJA OS API (decimals arrive as numbers). */

export type ItemType = 'MATERIAL' | 'PRODUCT';
export type LocationType = 'STORAGE' | 'RECEIVING' | 'QC_HOLD' | 'REJECTED' | 'PRODUCTION' | 'DISPATCH';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'DISCONTINUED';
export type UomDimension = 'COUNT' | 'LENGTH' | 'AREA' | 'WEIGHT' | 'VOLUME';

export interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface Uom {
  id: string;
  code: string;
  name: string;
  dimension: UomDimension;
  precision: number;
  isActive: boolean;
}

export interface AttributeDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  unit?: string;
  options?: string[];
  required?: boolean;
}

export interface Category {
  id: string;
  type: ItemType;
  code: string;
  name: string;
  description: string | null;
  attributeSchema: AttributeDef[];
  defaultUomId: string | null;
  isActive: boolean;
  parentId: string | null;
  _count?: { items: number };
}

export interface Location {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
  isDefault: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  allowNegativeStock: boolean;
  locations: Location[];
}

export interface Item {
  id: string;
  type: ItemType;
  code: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; code: string; name: string; attributeSchema?: AttributeDef[] } | null;
  uomId: string;
  uom: { code: string; id?: string; name?: string };
  attributes: Record<string, string | number>;
  specifications: string | null;
  colour: string | null;
  productId: string | null;
  product: { id: string; code: string; name: string } | null;
  variantName: string | null;
  dimensions: string | null;
  routeId: string | null;
  status: ProductStatus;
  minStock: number;
  reorderLevel: number;
  reorderQty: number;
  trackBatches: boolean;
  requiresInspection: boolean;
  standardCost: number | null;
  lastPurchasePrice: number | null;
  sellingPrice: number | null;
  taxRate: number | null;
  hsnCode: string | null;
  defaultSupplierId: string | null;
  defaultLocationId: string | null;
  remarks: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDetail extends Item {
  uomConversions: { id: string; uomCode: string; factorToBase: number }[];
  supplierItems: { id: string; supplier: { id: string; code: string; name: string }; lastPrice: number | null; isPreferred: boolean; supplierSku: string | null }[];
  route: { id: string; code: string; name: string } | null;
  bom: { id: string; code: string; versions: { id: string; version: number }[] } | null;
}

export interface StockRow {
  id: string;
  type: ItemType;
  code: string;
  name: string;
  colour: string | null;
  variantName: string | null;
  product: { id: string; name: string } | null;
  category: { id: string; name: string; code: string } | null;
  uom: string;
  minStock: number;
  reorderLevel: number;
  reorderQty: number;
  onHand: number;
  usableOnHand: number;
  nonUsable: number;
  reserved: number;
  available: number;
  stockStatus: 'OK' | 'LOW' | 'OUT';
  lastMovementAt: string | null;
  lastPurchasePrice: number | null;
  standardCost: number | null;
}

export interface Balance {
  id: string;
  itemId: string;
  onHand: number;
  reserved: number;
  available: number;
  lastMovementAt: string | null;
  location: { id: string; code: string; name: string; type: LocationType; warehouseId: string };
  batch: { id: string; batchNumber: string; receivedAt: string } | null;
}

export interface TxHeader {
  id: string;
  number: string;
  type: string;
  status: 'POSTED' | 'REVERSED';
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  reason: string | null;
  remarks: string | null;
  postedAt: string;
  createdById: string | null;
  actorType: string;
  _count?: { movements: number };
}

export interface Movement {
  id: string;
  transactionId: string;
  itemId: string;
  locationId: string;
  batchId: string | null;
  bucket: 'ON_HAND' | 'RESERVED';
  quantity: number;
  unitCost: number | null;
  onHandAfter: number;
  reservedAfter: number;
  createdAt: string;
  item: { id: string; code: string; name: string; uom: { code: string } };
  location: { id: string; code: string; name?: string };
  batch: { id: string; batchNumber: string } | null;
  transaction?: Pick<TxHeader, 'id' | 'number' | 'type' | 'reason' | 'referenceType' | 'referenceId' | 'referenceNumber' | 'status'>;
}

export interface TxDetail extends TxHeader {
  movements: Movement[];
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  reversalOf: { id: string; number: string } | null;
  reversedBy: { id: string; number: string } | null;
}

export interface Reservation {
  id: string;
  itemId: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string | null;
  quantity: number;
  consumedQty: number;
  releasedQty: number;
  openQty: number;
  status: string;
  createdAt: string;
  item: { code: string; name: string };
  location: { code: string };
  batch: { batchNumber: string } | null;
}

export interface StockCountSummary {
  id: string;
  number: string;
  warehouseId: string;
  locationId: string | null;
  status: string;
  remarks: string | null;
  createdAt: string;
  submittedAt: string | null;
  postedAt: string | null;
  _count?: { lines: number };
}

export interface StockCountDetail extends StockCountSummary {
  transactionId: string | null;
  lines: {
    id: string;
    itemId: string;
    locationId: string;
    batchId: string | null;
    systemQty: number;
    countedQty: number | null;
    remarks: string | null;
    variance: number | null;
    item?: { id: string; code: string; name: string; uom: { code: string } };
    location?: { id: string; code: string; name: string };
    batch: { id: string; batchNumber: string } | null;
  }[];
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  description: string | null;
  manufacturingSpecs: string | null;
  status: ProductStatus;
  defaultRouteId: string | null;
  defaultRoute: { id: string; name: string; code?: string } | null;
  createdAt: string;
  _count?: { variants: number };
}

export interface ProductDetail extends Product {
  variants: (Item & { bom: { id: string; versions: { id: string; version: number }[] } | null })[];
}

export interface Approval {
  id: string;
  number: string;
  type: 'STOCK_ADJUSTMENT' | 'STOCK_COUNT' | 'REJECTED_STOCK_RELEASE' | 'AI_ACTION';
  status: string;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  requiredPermission: string;
  requestedBy: { id: string; name: string };
  requestedVia: 'USER' | 'AI' | 'SYSTEM';
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  resultEntityType: string | null;
  resultEntityId: string | null;
  error: string | null;
  createdAt: string;
  canDecide: boolean;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  roles: { id: string; key: string; name: string }[];
  worker: { id: string; code: string; name: string } | null;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  ip: string | null;
  userAgent: string | null;
  expiresAt: string;
}

export interface AuditEntry {
  id: string;
  actorType: 'USER' | 'AI' | 'SYSTEM';
  actorId: string | null;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  requestId: string | null;
  ip: string | null;
  createdAt: string;
}

export interface Sequence {
  key: string;
  prefix: string;
  nextValue: number;
  padding: number;
  resetYearly: boolean;
  periodKey: string | null;
}

export interface DashboardData {
  range: { from: string; to: string };
  rawMaterials: {
    skuCount: number;
    inStockSkuCount: number;
    lowStockCount: number;
    valueEstimate: number | null;
    valuedSkuCount: number;
    byCategory: { categoryId: string | null; name: string; skuCount: number; quantities: { uom: string; onHand: number }[] }[];
  };
  finishedGoods: { skuCount: number; units: number; available: number; reserved: number };
  production: { active: number; pending: number; completedInRange: number; delayed: number };
  sales: { pendingOrders: number; ordersInRange: number };
  procurement: { openOrders: number; overdueOrders: number; pendingApproval: number };
  productionPerformance: { date: string; completed: number; rejected: number }[];
  inventoryMovement: { date: string; receipts: number; issues: number; production: number; sales: number }[];
  monthlyActivity: { month: string; productionOrders: number; salesOrders: number; purchaseOrders: number; inventoryTransactions: number }[];
  recentTransactions: { id: string; number: string; type: string; postedAt: string; referenceNumber: string | null; lineCount: number }[];
  lowStock: { id: string; code: string; name: string; available: number; reorderLevel: number; uom: string }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: string;
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
}
