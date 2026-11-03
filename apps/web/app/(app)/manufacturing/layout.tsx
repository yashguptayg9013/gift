'use client';

import { SubNav } from '@/components/shell/sub-nav';

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        items={[
          { label: 'Production orders', href: '/manufacturing', exact: true, anyOf: ['production.view'] },
          { label: 'Bills of materials', href: '/manufacturing/boms', anyOf: ['bom.view'] },
          { label: 'Setup', href: '/manufacturing/setup', anyOf: ['production.view', 'production.config.manage'] },
        ]}
      />
      {children}
    </>
  );
}
