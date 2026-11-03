'use client';

import { Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { adminKeys, usePermissionCatalog, useRoles } from '@/lib/api/admin';
import { useApiMutation } from '@/lib/api/hooks';
import type { Role } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, FormError, LoadingRows, PageHeader, Section } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/overlays';
import { Checkbox } from '@/components/ui/primitives';

export default function RolesPage() {
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const [picked, setSelected] = useState<string | 'new' | null>(null);
  // default to the first role until the user picks one
  const selected = picked ?? roles.data?.[0]?.id ?? null;

  if (roles.error) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  const role = selected === 'new' ? null : roles.data?.find((r) => r.id === selected);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Roles bundle permissions. Changes apply to every user with the role on their next request."
        actions={
          <Button variant="primary" onClick={() => setSelected('new')}>
            <Plus /> New role
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[16rem_1fr]">
        <Section title="Roles">
          {!roles.data ? (
            <LoadingRows rows={7} />
          ) : (
            <ul className="p-1">
              {roles.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted', selected === r.id && 'bg-muted font-medium')}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.userCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {catalog.data && (selected === 'new' || role) ? (
          <RoleEditor key={selected} role={role ?? undefined} catalog={catalog.data} onSaved={(id) => setSelected(id)} onDeleted={() => setSelected(null)} />
        ) : catalog.error ? (
          <ErrorState error={catalog.error} />
        ) : (
          <Section>{roles.data ? <EmptyState title="Select a role" /> : <LoadingRows />}</Section>
        )}
      </div>
    </>
  );
}

function RoleEditor({ role, catalog, onSaved, onDeleted }: { role?: Role; catalog: Record<string, { label: string; permissions: Record<string, string> }>; onSaved: (id: string) => void; onDeleted: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [key, setKey] = useState(role?.key ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = role?.key === 'administrator';
  const total = useMemo(() => Object.values(catalog).reduce((s, g) => s + Object.keys(g.permissions).length, 0), [catalog]);

  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), description: description.trim() || undefined, permissions: [...perms] };
      return role ? api.put<{ id: string }>(`/admin/roles/${role.id}`, body) : api.post<{ id: string }>('/admin/roles', { ...body, key: key.trim() });
    },
    { invalidate: [adminKeys.roles()], success: 'Role saved', silentError: true, onSuccess: (r) => onSaved(r.id) },
  );
  const del = useApiMutation(() => api.delete(`/admin/roles/${role!.id}`), { invalidate: [adminKeys.roles()], success: 'Role deleted', onSuccess: onDeleted });

  const toggle = (p: string, on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      if (on) n.add(p);
      else n.delete(p);
      return n;
    });

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          {role ? role.name : 'New role'} {role?.isSystem && <Badge>System</Badge>}
        </span>
      }
      description={`${perms.size} of ${total} permissions`}
      actions={
        <>
          {role && !role.isSystem && (
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!name.trim() || (!role && !key.trim())}>
            <Save /> Save role
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-4">
        <FormGrid cols={3}>
          <Field label="Name" htmlFor="r-name" required>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Key" htmlFor="r-key" hint={role ? 'Stable identifier' : 'lower_snake_case'}>
            <Input id="r-key" className="font-mono text-xs" disabled={!!role} value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="r-desc">
            <Input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </FormGrid>
        {locked && <p className="rounded-md border bg-subtle px-3 py-2 text-sm text-muted-foreground">The Administrator role always has every permission and cannot be reduced.</p>}
        {save.error ? <FormError error={save.error} /> : null}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Object.entries(catalog).map(([gk, g]) => {
            const keys = Object.keys(g.permissions);
            const on = keys.filter((k) => perms.has(k)).length;
            return (
              <fieldset key={gk} className="rounded-md border">
                <legend className="sr-only">{g.label}</legend>
                <div className="flex items-center justify-between border-b bg-subtle px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox disabled={locked} checked={on === keys.length ? true : on ? 'indeterminate' : false} onCheckedChange={(c) => keys.forEach((k) => toggle(k, c === true))} />
                    {g.label}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {on}/{keys.length}
                  </span>
                </div>
                <div className="space-y-1 p-2">
                  {keys.map((p) => (
                    <label key={p} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-subtle">
                      <Checkbox className="mt-0.5" disabled={locked} checked={perms.has(p)} onCheckedChange={(c) => toggle(p, c === true)} />
                      <span>
                        <span className="block">{g.permissions[p]}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{p}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${role?.name}?`} description="Roles can only be deleted when no user has them." destructive confirmLabel="Delete role" loading={del.isPending} onConfirm={() => del.mutate(undefined)} />
    </Section>
  );
}
