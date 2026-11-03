import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'AI Copilot' };

export default function Page() {
  return <ModulePlaceholder title="AI Copilot" description="Ask questions about your operations in plain language." capabilities={['Low stock & reorder advice', 'Delayed production orders', 'Consumption analysis', 'Sales trends', 'Daily summaries', 'Approval-gated actions']} />;
}
