'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Copy, LockOpen, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { adminKeys, useRoles, useUserSessions, useUsers } from '@/lib/api/admin';
import { useApiMutation } from '@/lib/api/hooks';
import type { AdminUser } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatRelative } from '@/lib/format';
import { PASSWORD_HINT } from '@/lib/password';
import { useDebounced } from '@/lib/use-debounce';
import { SessionsList } from '@/components/admin/sessions-list';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, FormError, PageHeader, Section } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, Sheet, SheetContent } from '@/components/ui/overlays';
import { Checkbox, Switch } from '@/components/ui/primitives';

interface Values {
  email: string;
  name: string;
  phone: string;
  roleIds: string[];
  isActive: boolean;
  password: string;
}

function UsersInner() {
  const params = useSearchParams();
  const { me } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const q = useUsers(debounced || undefined);
  const [edit, setEdit] = useState<AdminUser | 'new' | null>(() => (params.get('new') === '1' ? 'new' : null));
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <span className="block">
              {row.original.name} {row.original.id === me.id && <Badge tone="info">You</Badge>}
            </span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      },
      { id: 'roles', header: 'Roles', accessorFn: (r) => r.roles.map((x) => x.name).join(', '), cell: ({ row }) => <span className="flex flex-wrap gap-1">{row.original.roles.map((r) => <Badge key={r.id}>{r.name}</Badge>)}</span> },
      { id: 'worker', header: 'Worker', accessorFn: (r) => r.worker?.code ?? '', cell: ({ row }) => row.original.worker?.code ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'lastLoginAt', header: 'Last sign-in', cell: ({ row }) => <span className="text-muted-foreground">{row.original.lastLoginAt ? formatRelative(row.original.lastLoginAt) : 'Never'}</span> },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => (r.isActive ? 'Active' : 'Disabled'),
        cell: ({ row }) =>
          !row.original.isActive ? <Badge tone="neutral">Disabled</Badge> : row.original.lockedUntil && new Date(row.original.lockedUntil) > new Date() ? <Badge tone="danger">Locked</Badge> : <Badge tone="success">Active</Badge>,
      },
    ],
    [me.id],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to PUJA OS and the roles that grant their permissions."
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus /> New user
          </Button>
        }
      />
      <DataTable columns={columns} data={q.data} loading={q.isFetching} error={q.error} onRetry={() => q.refetch()} search={{ value: search, onChange: setSearch }} onRowClick={(u) => setEdit(u)} exportName="users" pageSize={0} />
      {edit && (
        <UserSheet
          user={edit === 'new' ? undefined : edit}
          onClose={() => setEdit(null)}
          onCreated={(email, password) => {
            setEdit(null);
            if (password) setTemp({ email, password });
          }}
        />
      )}
      <Dialog open={!!temp} onOpenChange={(o) => !o && setTemp(null)}>
        <DialogContent
          size="sm"
          title="Temporary password"
          description="Shown once. Share it securely; the user should change it after signing in."
          footer={
            <Button variant="primary" onClick={() => setTemp(null)}>
              Done
            </Button>
          }
        >
          {temp && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{temp.email}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-subtle px-2 py-1.5 font-mono text-sm">{temp.password}</code>
                <Button
                  size="icon"
                  aria-label="Copy password"
                  onClick={() => {
                    void navigator.clipboard?.writeText(temp.password);
                    toast.success('Copied');
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserSheet({ user, onClose, onCreated }: { user?: AdminUser; onClose: () => void; onCreated: (email: string, password?: string) => void }) {
  const roles = useRoles();
  const sessions = useUserSessions(user?.id);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({ defaultValues: { email: user?.email ?? '', name: user?.name ?? '', phone: user?.phone ?? '', roleIds: user?.roles.map((r) => r.id) ?? [], isActive: user?.isActive ?? true, password: '' } });
  const save = useApiMutation(
    async (v: Values) => {
      const body = { email: v.email.trim(), name: v.name.trim(), phone: v.phone.trim() || undefined, roleIds: v.roleIds, ...(v.password ? { password: v.password } : {}) };
      if (user) return { user: await api.patch<AdminUser>(`/admin/users/${user.id}`, { ...body, isActive: v.isActive }), temporaryPassword: undefined };
      return api.post<{ user: AdminUser; temporaryPassword?: string }>('/admin/users', body);
    },
    {
      invalidate: [adminKeys.users()],
      silentError: true,
      success: user ? 'User saved' : 'User created',
      onSuccess: (r) => (user ? onClose() : onCreated(r.user.email, r.temporaryPassword)),
    },
  );
  const unlock = useApiMutation(() => api.post(`/admin/users/${user!.id}/unlock`), { invalidate: [adminKeys.users()], success: 'Account unlocked' });
  const revoke = useApiMutation((sid: string) => api.delete(`/admin/users/${user!.id}/sessions/${sid}`), { invalidate: [adminKeys.userSessions(user?.id ?? '')], success: 'Session revoked' });
  const locked = user?.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        size="lg"
        title={user ? user.name : 'New user'}
        description={user ? `Created ${formatDateTime(user.createdAt)}` : 'Leave the password empty to generate a temporary one.'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="user-form" loading={save.isPending}>
              {user ? 'Save user' : 'Create user'}
            </Button>
          </>
        }
      >
        <form
          id="user-form"
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit((v) => {
            setError(null);
            save.mutate(v, { onError: setError });
          })}
        >
          <FormGrid>
            <Field label="Name" htmlFor="u-name" required error={form.formState.errors.name}>
              <Input id="u-name" {...form.register('name', { validate: (v) => v.trim().length >= 2 || 'Required' })} />
            </Field>
            <Field label="Email" htmlFor="u-email" required error={form.formState.errors.email}>
              <Input id="u-email" type="email" {...form.register('email', { validate: (v) => /^\S+@\S+\.\S+$/.test(v) || 'Valid email required' })} />
            </Field>
            <Field label="Phone" htmlFor="u-phone">
              <Input id="u-phone" {...form.register('phone')} />
            </Field>
            <Field label={user ? 'Set new password' : 'Initial password'} htmlFor="u-pw" hint={PASSWORD_HINT} error={form.formState.errors.password}>
              <Input id="u-pw" type="password" autoComplete="new-password" {...form.register('password', { validate: (v) => !v || (v.length >= 10 && /[A-Za-z]/.test(v) && /\d/.test(v)) || PASSWORD_HINT })} />
            </Field>
          </FormGrid>
          <Field label="Roles" htmlFor="roles" error={form.formState.errors.roleIds?.message}>
            <Controller
              control={form.control}
              name="roleIds"
              rules={{ validate: (v) => v.length > 0 || 'Assign at least one role' }}
              render={({ field }) => (
                <div id="roles" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(roles.data ?? []).map((r) => (
                    <label key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-subtle">
                      <Checkbox className="mt-0.5" checked={field.value.includes(r.id)} onCheckedChange={(c) => field.onChange(c ? [...field.value, r.id] : field.value.filter((x) => x !== r.id))} />
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground">{r.description ?? `${r.permissions.length} permissions`}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            />
          </Field>
          {user && (
            <div className="flex flex-wrap items-center gap-4">
              <Controller control={form.control} name="isActive" render={({ field }) => <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active (disabling signs the user out)</label>} />
              {locked && (
                <Button type="button" size="sm" onClick={() => unlock.mutate(undefined)} loading={unlock.isPending}>
                  <LockOpen /> Unlock account
                </Button>
              )}
            </div>
          )}
          {error ? <FormError error={error} /> : null}
        </form>
        {user && (
          <Section title="Active sessions" className="mt-6">
            <SessionsList sessions={sessions.data} loading={sessions.isLoading} error={sessions.error} onRevoke={(sid) => revoke.mutate(sid)} revoking={revoke.isPending ? revoke.variables : null} />
          </Section>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersInner />
    </Suspense>
  );
}
