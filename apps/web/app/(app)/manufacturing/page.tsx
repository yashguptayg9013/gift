import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Manufacturing' };

export default function Page() {
  return <ModulePlaceholder title="Manufacturing" description="Bills of materials, routes, stages and workstations." capabilities={['Bills of materials & versions', 'BOM comparison and substitution', 'Production routes per SKU', 'Stage definitions', 'Workstations', 'Material requirement calculator']} />;
}
