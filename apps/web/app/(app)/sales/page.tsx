import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Sales' };

export default function Page() {
  return <ModulePlaceholder title="Sales" description="Inquiries, quotations, sales orders and challans." capabilities={['Sales inquiries', 'Quotations (PDF)', 'Sales orders', 'Customer-specific pricing', 'Delivery challans (PDF)', 'Partial fulfilment']} />;
}
