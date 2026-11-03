import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Procurement' };

export default function Page() {
  return <ModulePlaceholder title="Procurement" description="Requisitions, purchase orders and goods receipts." capabilities={['Purchase requisitions', 'Purchase orders & approval', 'Goods received notes', 'Partial deliveries', 'Supplier returns', 'Reorder recommendations']} />;
}
