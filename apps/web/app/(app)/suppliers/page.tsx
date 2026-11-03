import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Suppliers' };

export default function Page() {
  return <ModulePlaceholder title="Suppliers" description="Supplier database and material sourcing." capabilities={['Supplier profiles', 'Contacts', 'Materials supplied', 'Price history', 'Lead times', 'Performance']} />;
}
