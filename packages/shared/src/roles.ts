import { ALL_PERMISSIONS, Permission } from './permissions';

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const view: Permission[] = [
  'dashboard.view',
  'inventory.view',
  'product.view',
  'bom.view',
  'production.view',
  'workforce.view',
  'quality.view',
  'sales.view',
  'procurement.view',
];

const allReports: Permission[] = [
  'reports.inventory',
  'reports.manufacturing',
  'reports.sales',
  'reports.procurement',
  'reports.export',
];

/**
 * System role templates seeded on bootstrap. Administrators may edit the
 * permission sets of these roles or create new roles; `key` is stable.
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'administrator',
    name: 'Administrator',
    description: 'Full access including users, roles, settings and approvals.',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: 'management',
    name: 'Management',
    description: 'Business oversight: all reports, approvals and AI copilot. No user administration.',
    permissions: [
      ...view,
      ...allReports,
      'inventory.adjust.approve',
      'inventory.count.approve',
      'procurement.requisition.approve',
      'procurement.po.approve',
      'production.cancel',
      'sales.order.cancel',
      'quality.rejection.release',
      'ai.use',
      'ai.approve',
      'approvals.view',
      'admin.audit.view',
    ],
  },
  {
    key: 'inventory_manager',
    name: 'Inventory Manager',
    description: 'Materials, stock movements, counts, receipts and purchasing.',
    permissions: [
      ...view,
      'reports.inventory',
      'reports.procurement',
      'reports.export',
      'inventory.item.manage',
      'inventory.receive',
      'inventory.issue',
      'inventory.transfer',
      'inventory.reserve',
      'inventory.return',
      'inventory.damage',
      'inventory.adjust',
      'inventory.count',
      'inventory.location.manage',
      'product.manage',
      'production.material.issue',
      'procurement.supplier.manage',
      'procurement.requisition.manage',
      'procurement.po.manage',
      'procurement.grn.manage',
      'procurement.return.manage',
      'quality.inspect',
      'ai.use',
      'approvals.view',
    ],
  },
  {
    key: 'production_supervisor',
    name: 'Production Supervisor',
    description: 'Plans and runs production, assigns workers, records QC and attendance.',
    permissions: [
      ...view,
      'reports.manufacturing',
      'reports.inventory',
      'reports.export',
      'bom.manage',
      'production.create',
      'production.release',
      'production.stage.update.any',
      'production.stage.update.own',
      'production.assign',
      'production.material.issue',
      'production.reverse',
      'production.config.manage',
      'inventory.reserve',
      'workforce.manage',
      'workforce.attendance',
      'quality.inspect',
      'ai.use',
      'approvals.view',
    ],
  },
  {
    key: 'production_worker',
    name: 'Production Worker',
    description: 'Sees and updates only production tasks assigned to them.',
    permissions: ['production.view', 'production.stage.update.own', 'product.view', 'bom.view'],
  },
  {
    key: 'sales_executive',
    name: 'Sales Executive',
    description: 'Customers, inquiries, quotations, sales orders and challans.',
    permissions: [
      'dashboard.view',
      'inventory.view',
      'product.view',
      'production.view',
      'sales.view',
      'sales.customer.manage',
      'sales.inquiry.manage',
      'sales.quotation.manage',
      'sales.order.manage',
      'sales.challan.manage',
      'reports.sales',
      'reports.export',
      'production.create',
      'ai.use',
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to operational data.',
    permissions: [...view],
  },
];
