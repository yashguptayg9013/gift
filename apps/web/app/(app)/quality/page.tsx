import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Quality Control' };

export default function Page() {
  return <ModulePlaceholder title="Quality Control" description="Inspections, checklists and defect tracking." capabilities={['Material & product inspections', 'Configurable checklists', 'Defect categories', 'Accepted / rejected / rework', 'Inspector assignment', 'Quality history']} />;
}
