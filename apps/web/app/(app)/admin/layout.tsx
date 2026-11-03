'use client';

import { SubNav } from '@/components/shell/sub-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        items={[
          { label: 'Users', href: '/admin/users', anyOf: ['admin.users.manage'] },
          { label: 'Roles & permissions', href: '/admin/roles', anyOf: ['admin.roles.manage'] },
          { label: 'Company settings', href: '/admin/settings', anyOf: ['admin.settings.manage'] },
          { label: 'Numbering', href: '/admin/numbering', anyOf: ['admin.settings.manage'] },
          { label: 'Audit log', href: '/admin/audit', anyOf: ['admin.audit.view'] },
          { label: 'Approvals', href: '/approvals' },
        ]}
      />
      {children}
    </>
  );
}
