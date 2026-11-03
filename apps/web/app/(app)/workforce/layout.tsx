'use client';

import { SubNav } from '@/components/shell/sub-nav';

export default function WorkforceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        items={[
          { label: 'Workers', href: '/workforce', exact: true, anyOf: ['workforce.view'] },
          { label: 'Attendance', href: '/workforce/attendance', anyOf: ['workforce.view', 'workforce.attendance'] },
          { label: 'Productivity', href: '/workforce/productivity', anyOf: ['workforce.view', 'reports.manufacturing'] },
        ]}
      />
      {children}
    </>
  );
}
