'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { api } from '@/lib/api/client';
import { catalogKeys, useCategories, useUoms } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import type { AttributeDef, Category, ItemType } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Checkbox, Switch } from '@/components/ui/primitives';

interface AttrRow {
  key: string;
  label: string;
  type: AttributeDef['type'];
  unit: string;
  options: string;
  required: boolean;
}
interface Values {
  type: ItemType;
  code: string;
  name: string;
  description: string;
  defaultUomCode: string;
  isActive: boolean;
  attributes: AttrRow[];
}

export function CategoriesSetup() {
  const { can } = useAuth();
  const manage = can(['inventory.item.manage', 'product.manage'], 'any');
  const q = useCategories();
  const uoms = useUoms();
  const [edit, setEdit] = useState<Category | 'new' | null>(null);

  const columns = useMemo<ColumnDef<Category, unknown>[]>(
    () => [
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge tone={row.original.type === 'MATERIAL' ? 'info' : 'accent'}>{row.original.type === 'MATERIAL' ? 'Material' : 'Product'}</Badge> },
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name' },
      { id: 'uom', header: 'Default unit', accessorFn: (r) => uoms.data?.find((u) => u.id === r.defaultUomId)?.code ?? '—' },
      { id: 'attrs', header: 'Attributes', accessorFn: (r) => r.attributeSchema.map((a) => a.label).join(', '), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.attributeSchema.map((a) => a.label).join(', ') || '—'}</span> },
      { id: 'items', header: 'Items', meta: { numeric: true }, accessorFn: (r) => r._count?.items ?? 0 },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <span className="text-muted-foreground">Active</span> : <Badge>Inactive</Badge>) },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          manage ? (
            <Button size="sm" variant="ghost" onClick={() => setEdit(row.original)} aria-label={`Edit ${row.original.name}`}>
              <Pencil />
            </Button>
          ) : null,
      },
    ],
    [uoms.data, manage],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={q.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        searchable
        pageSize={0}
        toolbar={
          manage && (
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => setEdit('new')}>
              <Plus /> New category
            </Button>
          )
        }
      />
      {edit && <CategoryDialog category={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

const toRow = (a: AttributeDef): AttrRow => ({ key: a.key, label: a.label, type: a.type, unit: a.unit ?? '', options: (a.options ?? []).join(', '), required: !!a.required });

function CategoryDialog({ category, onClose }: { category?: Category; onClose: () => void }) {
  const uoms = useUoms();
  const defaultUomCode = uoms.data?.find((u) => u.id === category?.defaultUomId)?.code ?? '';
  const form = useForm<Values>({
    defaultValues: {
      type: category?.type ?? 'MATERIAL',
      code: category?.code ?? '',
      name: category?.name ?? '',
      description: category?.description ?? '',
      defaultUomCode,
      isActive: category?.isActive ?? true,
      attributes: (category?.attributeSchema ?? []).map(toRow),
    },
  });
  const attrs = useFieldArray({ control: form.control, name: 'attributes' });
  const save = useApiMutation(
    (v: Values) => {
      const attributeSchema = v.attributes.map((a) => ({
        key: a.key.trim(),
        label: a.label.trim() || a.key.trim(),
        type: a.type,
        unit: a.unit.trim() || undefined,
        options: a.type === 'select' ? a.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
        required: a.required,
      }));
      const body = { name: v.name.trim(), description: v.description.trim() || undefined, attributeSchema, defaultUomCode: v.defaultUomCode || undefined, isActive: v.isActive };
      return category ? api.put(`/categories/${category.id}`, body) : api.post('/categories', { ...body, type: v.type, code: v.code.trim().toUpperCase() });
    },
    { invalidate: [catalogKeys.all], success: 'Category saved', silentError: true, onSuccess: onClose },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        title={category ? `Edit ${category.name}` : 'New category'}
        description="Attributes defined here become structured fields on every item in the category."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="cat-form" loading={save.isPending}>
              Save category
            </Button>
          </>
        }
      >
        <form id="cat-form" className="space-y-5" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <FormGrid cols={3}>
            <Field label="Applies to" htmlFor="cat-type">
              <NativeSelect id="cat-type" disabled={!!category} {...form.register('type')}>
                <option value="MATERIAL">Materials</option>
                <option value="PRODUCT">Finished goods</option>
              </NativeSelect>
            </Field>
            <Field label="Code" htmlFor="cat-code" required error={form.formState.errors.code}>
              <Input id="cat-code" className="font-mono uppercase" disabled={!!category} {...form.register('code', { validate: (v) => !!category || /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(v.trim()) || 'Letters, digits and underscore' })} />
            </Field>
            <Field label="Name" htmlFor="cat-name" required error={form.formState.errors.name}>
              <Input id="cat-name" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Default unit" htmlFor="cat-uom">
              <NativeSelect id="cat-uom" {...form.register('defaultUomCode')}>
                <option value="">None</option>
                {(uoms.data ?? []).map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Description" htmlFor="cat-desc" className="sm:col-span-2">
              <Textarea id="cat-desc" rows={1} {...form.register('description')} />
            </Field>
          </FormGrid>
          {category && (
            <Controller control={form.control} name="isActive" render={({ field }) => <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>} />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Attributes</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => attrs.append({ key: '', label: '', type: 'text', unit: '', options: '', required: false })} disabled={attrs.fields.length >= 30}>
                <Plus /> Add attribute
              </Button>
            </div>
            {attrs.fields.length === 0 && <p className="text-sm text-muted-foreground">No attributes. Items in this category only have standard fields.</p>}
            {attrs.fields.map((f, i) => {
              const type = form.watch(`attributes.${i}.type`);
              const keyErr = form.formState.errors.attributes?.[i]?.key?.message;
              return (
                <div key={f.id} className="grid grid-cols-2 items-end gap-2 rounded-md border bg-subtle p-2 sm:grid-cols-12">
                  <Field label="Key" htmlFor={`a-${i}-key`} className="sm:col-span-2" error={keyErr}>
                    <Input id={`a-${i}-key`} className="font-mono text-xs" placeholder="thickness_mm" {...form.register(`attributes.${i}.key`, { validate: (v) => /^[a-z][a-z0-9_]{0,39}$/.test(v.trim()) || 'lower_snake_case' })} />
                  </Field>
                  <Field label="Label" htmlFor={`a-${i}-label`} className="sm:col-span-3">
                    <Input id={`a-${i}-label`} {...form.register(`attributes.${i}.label`)} />
                  </Field>
                  <Field label="Type" htmlFor={`a-${i}-type`} className="sm:col-span-2">
                    <NativeSelect id={`a-${i}-type`} {...form.register(`attributes.${i}.type`)}>
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="select">Select</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Unit" htmlFor={`a-${i}-unit`} className="sm:col-span-1">
                    <Input id={`a-${i}-unit`} {...form.register(`attributes.${i}.unit`)} />
                  </Field>
                  <Field label="Options (comma separated)" htmlFor={`a-${i}-opt`} className="sm:col-span-2">
                    <Input id={`a-${i}-opt`} disabled={type !== 'select'} {...form.register(`attributes.${i}.options`, { validate: (v, all) => all.attributes[i].type !== 'select' || v.split(',').some((x) => x.trim()) || 'Add options' })} />
                  </Field>
                  <div className="col-span-2 flex items-center justify-end gap-1 pb-1 sm:col-span-2">
                    <Controller
                      control={form.control}
                      name={`attributes.${i}.required`}
                      render={({ field }) => (
                        <label className="mr-1 flex items-center gap-1.5 text-xs">
                          <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(!!c)} /> Required
                        </label>
                      )}
                    />
                    <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => attrs.move(i, i - 1)} aria-label="Move up">
                      <ArrowUp />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" disabled={i === attrs.fields.length - 1} onClick={() => attrs.move(i, i + 1)} aria-label="Move down">
                      <ArrowDown />
                    </Button>
                    <Button type="button" size="icon-sm" variant="danger-ghost" onClick={() => attrs.remove(i)} aria-label="Remove attribute">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {save.error ? <FormError error={save.error} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
