/**
 * Status vocabularies shared by API and web. Values mirror the Prisma enums
 * (a unit test in apps/api asserts they stay in sync). `tone` drives badge colour.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

interface StatusDef {
  label: string;
  tone: Tone;
}

function defs<T extends string>(d: Record<T, StatusDef>) {
  return d;
}

export const PRODUCTION_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  RELEASED: { label: 'Released', tone: 'info' },
  MATERIALS_RESERVED: { label: 'Materials reserved', tone: 'accent' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const STAGE_STATUS = defs({
  PENDING: { label: 'Pending', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  PAUSED: { label: 'Paused', tone: 'accent' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const PRIORITY = defs({
  LOW: { label: 'Low', tone: 'neutral' },
  NORMAL: { label: 'Normal', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  URGENT: { label: 'Urgent', tone: 'danger' },
});

export const INVENTORY_TX_TYPE = defs({
  RECEIPT: { label: 'Receipt', tone: 'success' },
  ISSUE: { label: 'Issue', tone: 'warning' },
  RESERVATION: { label: 'Reservation', tone: 'accent' },
  RELEASE: { label: 'Release', tone: 'neutral' },
  ADJUSTMENT: { label: 'Adjustment', tone: 'info' },
  TRANSFER: { label: 'Transfer', tone: 'info' },
  RETURN: { label: 'Return', tone: 'success' },
  DAMAGE: { label: 'Damaged', tone: 'danger' },
  RECONCILIATION: { label: 'Reconciliation', tone: 'info' },
  PRODUCTION_CONSUMPTION: { label: 'Production consumption', tone: 'warning' },
  PRODUCTION_OUTPUT: { label: 'Production output', tone: 'success' },
  PRODUCTION_RETURN: { label: 'Production return', tone: 'success' },
  PURCHASE_RECEIPT: { label: 'Purchase receipt', tone: 'success' },
  PURCHASE_RETURN: { label: 'Purchase return', tone: 'danger' },
  QC_DISPOSITION: { label: 'QC disposition', tone: 'accent' },
  SALES_DISPATCH: { label: 'Sales dispatch', tone: 'warning' },
  REVERSAL: { label: 'Reversal', tone: 'danger' },
});

export const LOCATION_TYPE = defs({
  STORAGE: { label: 'Storage', tone: 'success' },
  RECEIVING: { label: 'Receiving', tone: 'info' },
  QC_HOLD: { label: 'QC hold', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  PRODUCTION: { label: 'Production (WIP)', tone: 'accent' },
  DISPATCH: { label: 'Dispatch', tone: 'neutral' },
});

export const BOM_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ACTIVE: { label: 'Active', tone: 'success' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
});

export const PRODUCT_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ACTIVE: { label: 'Active', tone: 'success' },
  DISCONTINUED: { label: 'Discontinued', tone: 'danger' },
});

export const INSPECTION_STATUS = defs({
  PENDING: { label: 'Pending', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const INSPECTION_TYPE = defs({
  MATERIAL_RECEIPT: { label: 'Material receipt', tone: 'info' },
  IN_PROCESS: { label: 'In-process', tone: 'accent' },
  FINAL: { label: 'Final', tone: 'success' },
  RANDOM: { label: 'Random', tone: 'neutral' },
});

export const REQUISITION_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  ORDERED: { label: 'Ordered', tone: 'info' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const PURCHASE_ORDER_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Pending approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'accent' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const DOC_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  POSTED: { label: 'Posted', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const INQUIRY_STATUS = defs({
  OPEN: { label: 'Open', tone: 'info' },
  QUOTED: { label: 'Quoted', tone: 'accent' },
  WON: { label: 'Won', tone: 'success' },
  LOST: { label: 'Lost', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
});

export const QUOTATION_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CONVERTED: { label: 'Converted', tone: 'accent' },
});

export const SALES_ORDER_STATUS = defs({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PARTIALLY_FULFILLED: { label: 'Partially fulfilled', tone: 'accent' },
  FULFILLED: { label: 'Fulfilled', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const STOCK_COUNT_STATUS = defs({
  DRAFT: { label: 'Counting', tone: 'info' },
  SUBMITTED: { label: 'Awaiting approval', tone: 'warning' },
  POSTED: { label: 'Posted', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
});

export const APPROVAL_STATUS = defs({
  PENDING: { label: 'Pending', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  EXECUTED: { label: 'Executed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
});

export const ATTENDANCE_STATUS = defs({
  PRESENT: { label: 'Present', tone: 'success' },
  ABSENT: { label: 'Absent', tone: 'danger' },
  HALF_DAY: { label: 'Half day', tone: 'warning' },
  LEAVE: { label: 'Leave', tone: 'accent' },
  HOLIDAY: { label: 'Holiday', tone: 'neutral' },
});

export const RESERVATION_STATUS = defs({
  ACTIVE: { label: 'Active', tone: 'accent' },
  PARTIALLY_CONSUMED: { label: 'Partially consumed', tone: 'warning' },
  CONSUMED: { label: 'Consumed', tone: 'success' },
  RELEASED: { label: 'Released', tone: 'neutral' },
});

export const STATUS_VOCABULARIES = {
  ProductionStatus: PRODUCTION_STATUS,
  StageStatus: STAGE_STATUS,
  Priority: PRIORITY,
  InventoryTxType: INVENTORY_TX_TYPE,
  LocationType: LOCATION_TYPE,
  BomStatus: BOM_STATUS,
  ProductStatus: PRODUCT_STATUS,
  InspectionStatus: INSPECTION_STATUS,
  InspectionType: INSPECTION_TYPE,
  RequisitionStatus: REQUISITION_STATUS,
  PurchaseOrderStatus: PURCHASE_ORDER_STATUS,
  DocStatus: DOC_STATUS,
  InquiryStatus: INQUIRY_STATUS,
  QuotationStatus: QUOTATION_STATUS,
  SalesOrderStatus: SALES_ORDER_STATUS,
  StockCountStatus: STOCK_COUNT_STATUS,
  ApprovalStatus: APPROVAL_STATUS,
  AttendanceStatus: ATTENDANCE_STATUS,
  ReservationStatus: RESERVATION_STATUS,
} as const;

/** Notification types used by the event system (also keys for user preferences). */
export const NOTIFICATION_TYPES = {
  'inventory.low_stock': 'Low inventory',
  'inventory.adjustment_posted': 'Stock adjustment performed',
  'production.delayed': 'Production delayed',
  'production.stage_completed': 'Production stage completed',
  'production.completed': 'Production order completed',
  'procurement.po_overdue': 'Purchase order overdue',
  'procurement.po_pending_approval': 'Purchase order awaiting approval',
  'quality.inspection_pending': 'Quality inspection pending',
  'sales.order_created': 'New sales order created',
  'approvals.pending': 'Approval requested',
  'approvals.decided': 'Approval decided',
  'ai.daily_summary': 'Daily business summary',
  'system.integrity': 'Inventory ledger integrity alert',
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;
