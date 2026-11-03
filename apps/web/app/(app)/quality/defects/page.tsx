'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { qualityApi, qualityKeys, useDefectCategories, type DefectCategory, type QcScope } from '@/lib/api/quality';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, FormError, PageHeader } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Checkbox, Label } from '@/components/ui/primitives';

export default function DefectCategoriesPage() {
  const { can } = useAuth();
  const q = useDefectCategories(true);
  const [edit, setEdit] = useState<DefectCategory | 'new' | null>(null);
  const manage = can('quality.config.manage');
  const columns = useMemo<ColumnDef<DefectCategory, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'appliesTo', header: 'Applies to', cell: ({ row }) => humanize(row.original.appliesTo) },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-muted-foreground">{row.original.description ?? '—'}</span> },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          manage && (
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${row.original.name}`} onClick={() => setEdit(row.original)}>
              <Pencil />
            </Button>
          ),
      },
    ],
    [manage],
  );
  return (
    <>
      <PageHeader
        title="Defect categories"
        description="Used to classify rejected and rework units in inspections and production entries."
        actions={
          manage && (
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus /> Defect category
            </Button>
          )
        }
      />
      <DataTable columns={columns} data={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} searchable exportName="defect-categories" empty={<p className="py-10 text-center text-sm text-muted-foreground">No defect categories yet. Add the defects your inspectors look for.</p>} />
      {edit && <DefectDialog defect={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function DefectDialog({ defect, onClose }: { defect: DefectCategory | null; onClose: () => void }) {
  const [code, setCode] = useState(defect?.code ?? '');
  const [name, setName] = useState(defect?.name ?? '');
  const [description, setDescription] = useState(defect?.description ?? '');
  const [appliesTo, setAppliesTo] = useState<QcScope>(defect?.appliesTo ?? 'BOTH');
  const [active, setActive] = useState(defect?.isActive ?? true);
  const save = useApiMutation(() => qualityApi.saveDefect(defect?.id ?? null, { ...(defect ? {} : { code }), name, description: description || undefined, appliesTo, isActive: active }), {
    invalidate: [qualityKeys.all],
    success: 'Defect category saved',
    silentError: true,
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={defect ? `Edit ${defect.name}` : 'New defect category'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim() || (!defect && !code.trim())} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Code" htmlFor="d-code" required>
              <Input id="d-code" value={code} disabled={!!defect} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Name" htmlFor="d-name" required>
              <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Applies to" htmlFor="d-scope">
              <NativeSelect id="d-scope" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as QcScope)}>
                <option value="BOTH">Materials and products</option>
                <option value="MATERIAL">Materials</option>
                <option value="PRODUCT">Products</option>
              </NativeSelect>
            </Field>
          </FormGrid>
          <Field label="Description" htmlFor="d-desc">
            <Textarea id="d-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="d-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
            <Label htmlFor="d-active" className="font-normal">Active</Label>
          </div>
          <FormError error={save.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
