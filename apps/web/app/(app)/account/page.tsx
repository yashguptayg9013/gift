'use client';

import { NOTIFICATION_TYPES } from '@puja/shared';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { api, isNotFound } from '@/lib/api/client';
import { adminKeys, useMySessions } from '@/lib/api/admin';
import { notificationKeys, useNotificationPrefs } from '@/lib/api/dashboard';
import { useApiMutation } from '@/lib/api/hooks';
import type { NotificationPreference } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { ChangePasswordDialog } from '@/components/shell/account-dialogs';
import { SessionsList } from '@/components/admin/sessions-list';
import { Button } from '@/components/ui/button';
import { Badge, DescriptionList, EmptyState, LoadingRows, PageHeader, Section } from '@/components/ui/feedback';
import { Switch } from '@/components/ui/primitives';

export default function AccountPage() {
  const { me } = useAuth();
  const [pw, setPw] = useState(false);
  const sessions = useMySessions();
  const revoke = useApiMutation((id: string) => api.delete(`/auth/sessions/${id}`), { invalidate: [adminKeys.mySessions()], success: 'Session revoked' });

  return (
    <>
      <PageHeader
        title="Your account"
        actions={
          <Button onClick={() => setPw(true)}>
            <KeyRound /> Change password
          </Button>
        }
      />
      <div className="space-y-5">
        <Section title="Profile">
          <div className="p-4">
            <DescriptionList
              items={[
                { label: 'Name', value: me.name },
                { label: 'Email', value: me.email },
                { label: 'Phone', value: me.phone },
                { label: 'Roles', value: <span className="flex flex-wrap gap-1">{me.roles.map((r) => <Badge key={r.key}>{r.name}</Badge>)}</span> },
                { label: 'Last sign-in', value: formatDateTime(me.lastLoginAt) },
                { label: 'Permissions', value: `${me.permissions.length} granted` },
              ]}
            />
          </div>
        </Section>
        <Section title="Active sessions" description="Revoke any device you don't recognise. Changing your password signs out every other session.">
          <SessionsList sessions={sessions.data} loading={sessions.isLoading} error={sessions.error} onRetry={() => sessions.refetch()} onRevoke={(id) => revoke.mutate(id)} revoking={revoke.isPending ? revoke.variables : null} currentLabel={(_, i) => i === 0} />
        </Section>
        <NotificationPrefs />
      </div>
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </>
  );
}

function NotificationPrefs() {
  const prefs = useNotificationPrefs();
  const save = useApiMutation((p: NotificationPreference[]) => api.put('/notifications/preferences', { preferences: p }), { invalidate: [notificationKeys.prefs()], success: 'Preferences saved' });
  const byType = new Map((prefs.data ?? []).map((p) => [p.type, p]));
  const rows: NotificationPreference[] = Object.keys(NOTIFICATION_TYPES).map((type) => byType.get(type) ?? { type, inApp: true, email: false, whatsapp: false });
  const update = (type: string, key: 'inApp' | 'email' | 'whatsapp', value: boolean) => save.mutate(rows.map((r) => (r.type === type ? { ...r, [key]: value } : r)));

  return (
    <Section title="Notification preferences" description="Email and WhatsApp delivery require the integrations to be configured by an administrator.">
      {isNotFound(prefs.error) ? (
        <EmptyState compact title="Notification preferences are not available yet" />
      ) : prefs.isLoading ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="h-8 px-4 text-left font-medium">Event</th>
                <th className="px-3 text-center font-medium">In-app</th>
                <th className="px-3 text-center font-medium">Email</th>
                <th className="px-3 text-center font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{NOTIFICATION_TYPES[r.type as keyof typeof NOTIFICATION_TYPES] ?? r.type}</td>
                  {(['inApp', 'email', 'whatsapp'] as const).map((k) => (
                    <td key={k} className="px-3 text-center">
                      <Switch aria-label={`${k} for ${r.type}`} checked={r[k]} disabled={save.isPending} onCheckedChange={(v) => update(r.type, k, v)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
