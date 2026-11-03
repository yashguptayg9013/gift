import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Production' };

export default function Page() {
  return <ModulePlaceholder title="Production" description="Production orders and shop-floor progress." capabilities={['Production orders', 'Material availability & reservation', 'Stage start / pause / complete', 'Output, rejection & wastage', 'Worker assignment', 'Production history']} />;
}
