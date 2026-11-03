import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Customers' };

export default function Page() {
  return <ModulePlaceholder title="Customers" description="B2B customer accounts and order history." capabilities={['Company profiles & GSTIN', 'Contacts', 'Customer categories', 'Pricing', 'Order history', 'Notes']} />;
}
