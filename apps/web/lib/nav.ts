import type { Permission } from '@puja/shared';
import {
  BarChart3,
  Bot,
  Boxes,
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  type LucideIcon,
  Settings2,
  ShoppingCart,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** shown when the user has ANY of these */
  anyOf: Permission[];
}

export const NAV: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard, anyOf: ['dashboard.view'] },
  { label: 'Inventory', href: '/inventory', icon: Boxes, anyOf: ['inventory.view', 'product.view'] },
  { label: 'Manufacturing', href: '/manufacturing', icon: Factory, anyOf: ['bom.view', 'production.config.manage'] },
  { label: 'Production', href: '/production', icon: Wrench, anyOf: ['production.view'] },
  { label: 'Workforce', href: '/workforce', icon: UserRoundCog, anyOf: ['workforce.view'] },
  { label: 'Quality Control', href: '/quality', icon: ClipboardCheck, anyOf: ['quality.view'] },
  { label: 'Sales', href: '/sales', icon: ShoppingCart, anyOf: ['sales.view'] },
  { label: 'Customers', href: '/customers', icon: Users, anyOf: ['sales.view'] },
  { label: 'Procurement', href: '/procurement', icon: Truck, anyOf: ['procurement.view'] },
  { label: 'Suppliers', href: '/suppliers', icon: Warehouse, anyOf: ['procurement.view'] },
  { label: 'Reports', href: '/reports', icon: BarChart3, anyOf: ['reports.inventory', 'reports.manufacturing', 'reports.sales', 'reports.procurement'] },
  { label: 'AI Copilot', href: '/copilot', icon: Bot, anyOf: ['ai.use'] },
  { label: 'Administration', href: '/admin', icon: Settings2, anyOf: ['admin.users.manage', 'admin.roles.manage', 'admin.settings.manage', 'admin.audit.view'] },
];

export interface QuickCreate {
  label: string;
  href: string;
  anyOf: Permission[];
}

export const QUICK_CREATE: QuickCreate[] = [
  { label: 'Stock receipt', href: '/inventory?action=receipt', anyOf: ['inventory.receive'] },
  { label: 'Stock issue', href: '/inventory?action=issue', anyOf: ['inventory.issue'] },
  { label: 'Stock transfer', href: '/inventory?action=transfer', anyOf: ['inventory.transfer'] },
  { label: 'Stock adjustment', href: '/inventory?action=adjustment', anyOf: ['inventory.adjust'] },
  { label: 'Material', href: '/inventory/materials/new', anyOf: ['inventory.item.manage'] },
  { label: 'Product', href: '/inventory/products/new', anyOf: ['product.manage'] },
  { label: 'Stock count', href: '/inventory/counts?new=1', anyOf: ['inventory.count'] },
  { label: 'User', href: '/admin/users?new=1', anyOf: ['admin.users.manage'] },
];
