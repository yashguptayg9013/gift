'use client';

import { SubNav } from '@/components/shell/sub-nav';

export default function QualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        items={[
          { label: 'Inspections', href: '/quality', exact: true, anyOf: ['quality.view'] },
          { label: 'Summary', href: '/quality/summary', anyOf: ['quality.view'] },
          { label: 'Checklists', href: '/quality/checklists', anyOf: ['quality.view'] },
          { label: 'Defect categories', href: '/quality/defects', anyOf: ['quality.view'] },
        ]}
      />
      {children}
    </>
  );
}
