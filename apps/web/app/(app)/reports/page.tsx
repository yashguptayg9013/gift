import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return <ModulePlaceholder title="Reports" description="Inventory, manufacturing, sales and procurement analytics." capabilities={['Stock, ageing & movement', 'Consumption & wastage', 'Production output & rejection', 'Sales by month / SKU', 'Supplier performance', 'CSV / Excel / PDF export']} />;
}
