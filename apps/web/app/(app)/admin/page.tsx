'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { EmptyState } from '@/components/ui/feedback';

const ORDER: [string, string][] = [
  ['admin.users.manage', '/admin/users'],
  ['admin.roles.manage', '/admin/roles'],
  ['admin.settings.manage', '/admin/settings'],
  ['admin.audit.view', '/admin/audit'],
];

export default function AdminIndex() {
  const { me } = useAuth();
  const router = useRouter();
  const target = ORDER.find(([p]) => me.permissions.includes(p))?.[1];
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  return target ? null : <EmptyState title="No administration access" description="Ask an administrator for the permissions you need." />;
}
