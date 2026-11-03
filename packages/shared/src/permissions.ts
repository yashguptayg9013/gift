/**
 * PUJA OS permission catalog.
 *
 * Permissions are the unit of authorisation enforced by the API. Roles are data
 * (editable by administrators) that bundle permissions. Add new permissions here
 * and they become available to roles after `db:seed` (bootstrap seed is idempotent).
 */
export const PERMISSION_GROUPS = {
  dashboard: {
    label: 'Overview',
    permissions: {
      'dashboard.view': 'View executive dashboard',
    },
  },
  inventory: {
    label: 'Inventory',
    permissions: {
      'inventory.view': 'View stock, items and ledger',
      'inventory.item.manage': 'Create and edit materials, categories and units',
      'inventory.receive': 'Record stock receipts',
      'inventory.issue': 'Record stock issues',
      'inventory.transfer': 'Transfer stock between locations',
      'inventory.reserve': 'Reserve and release stock',
      'inventory.return': 'Record material returns',
      'inventory.damage': 'Record damaged stock',
      'inventory.adjust': 'Request stock adjustments',
      'inventory.adjust.approve': 'Approve and post stock adjustments',
      'inventory.count': 'Perform physical stock counts',
      'inventory.count.approve': 'Approve stock count reconciliation',
      'inventory.reverse': 'Reverse inventory transactions',
      'inventory.negative_stock.override': 'Allow posting that results in negative stock',
      'inventory.location.manage': 'Manage warehouses and locations',
    },
  },
  products: {
    label: 'Finished goods',
    permissions: {
      'product.view': 'View products and variants',
      'product.manage': 'Create and edit products and variants',
    },
  },
  bom: {
    label: 'Bill of materials',
    permissions: {
      'bom.view': 'View bills of materials',
      'bom.manage': 'Create and edit BOM drafts',
      'bom.activate': 'Activate or archive BOM versions',
    },
  },
  production: {
    label: 'Manufacturing',
    permissions: {
      'production.view': 'View production orders',
      'production.create': 'Create and plan production orders',
      'production.release': 'Release orders and reserve materials',
      'production.stage.update.own': 'Update assigned production tasks',
      'production.stage.update.any': 'Update any production stage (supervisor)',
      'production.assign': 'Assign workers and workstations',
      'production.material.issue': 'Issue and return production materials',
      'production.cancel': 'Cancel production orders',
      'production.reverse': 'Reverse production entries',
      'production.config.manage': 'Manage stages, routes and workstations',
    },
  },
  workforce: {
    label: 'Workforce',
    permissions: {
      'workforce.view': 'View workers and productivity',
      'workforce.manage': 'Manage workers and departments',
      'workforce.attendance': 'Record attendance',
    },
  },
  quality: {
    label: 'Quality control',
    permissions: {
      'quality.view': 'View inspections',
      'quality.inspect': 'Perform inspections',
      'quality.config.manage': 'Manage checklists and defect categories',
      'quality.rejection.release': 'Release rejected stock to saleable inventory',
    },
  },
  sales: {
    label: 'Sales',
    permissions: {
      'sales.view': 'View sales documents',
      'sales.customer.manage': 'Manage customers and pricing',
      'sales.inquiry.manage': 'Manage inquiries',
      'sales.quotation.manage': 'Create and edit quotations',
      'sales.order.manage': 'Create and edit sales orders',
      'sales.order.cancel': 'Cancel sales orders',
      'sales.challan.manage': 'Create and post delivery challans',
    },
  },
  procurement: {
    label: 'Procurement',
    permissions: {
      'procurement.view': 'View purchasing documents',
      'procurement.supplier.manage': 'Manage suppliers',
      'procurement.requisition.manage': 'Create purchase requisitions',
      'procurement.requisition.approve': 'Approve purchase requisitions',
      'procurement.po.manage': 'Create and edit purchase orders',
      'procurement.po.approve': 'Approve purchase orders',
      'procurement.grn.manage': 'Record goods receipts',
      'procurement.return.manage': 'Record supplier returns',
    },
  },
  reports: {
    label: 'Reports',
    permissions: {
      'reports.inventory': 'Inventory reports',
      'reports.manufacturing': 'Manufacturing reports',
      'reports.sales': 'Sales reports',
      'reports.procurement': 'Procurement reports',
      'reports.export': 'Export reports',
    },
  },
  ai: {
    label: 'AI Copilot',
    permissions: {
      'ai.use': 'Use the AI Copilot',
      'ai.approve': 'Approve AI-proposed actions within own permissions',
    },
  },
  admin: {
    label: 'Administration',
    permissions: {
      'admin.users.manage': 'Manage users and sessions',
      'admin.roles.manage': 'Manage roles and permissions',
      'admin.settings.manage': 'Manage company settings and numbering',
      'admin.audit.view': 'View audit log',
      'approvals.view': 'View approval requests',
    },
  },
} as const;

type Groups = typeof PERMISSION_GROUPS;
export type Permission = {
  [G in keyof Groups]: keyof Groups[G]['permissions'];
}[keyof Groups] &
  string;

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSION_GROUPS).flatMap(
  (g) => Object.keys(g.permissions) as Permission[],
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export const PERMISSION_LABELS: Record<Permission, string> = Object.values(PERMISSION_GROUPS).reduce(
  (acc, g) => ({ ...acc, ...g.permissions }),
  {} as Record<Permission, string>,
);
