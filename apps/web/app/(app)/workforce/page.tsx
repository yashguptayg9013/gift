import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';

export const metadata: Metadata = { title: 'Workforce' };

export default function Page() {
  return <ModulePlaceholder title="Workforce" description="Workers, attendance and productivity from production records." capabilities={['Worker profiles', 'Departments', 'Daily attendance', 'Assigned tasks', 'Completed & rejected quantities', 'Productivity reports']} />;
}
