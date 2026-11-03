'use client';

import { SubNav } from '@/components/shell/sub-nav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        items={[
          { label: 'Stock', href: '/inventory', exact: true, anyOf: ['inventory.view', 'product.view'] },
          { label: 'Materials', href: '/inventory/materials', anyOf: ['inventory.view'] },
          { label: 'Finished goods', href: '/inventory/products', anyOf: ['product.view'] },
          { label: 'Transactions', href: '/inventory/transactions', anyOf: ['inventory.view'] },
          { label: 'Reservations', href: '/inventory/reservations', anyOf: ['inventory.view'] },
          { label: 'Stock counts', href: '/inventory/counts', anyOf: ['inventory.view'] },
          { label: 'Setup', href: '/inventory/setup', anyOf: ['inventory.view'] },
        ]}
      />
      {children}
    </>
  );
}
