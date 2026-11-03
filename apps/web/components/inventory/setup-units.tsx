'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api/client';
import { catalogKeys, useUoms } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import type { Uom, UomDimension } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

const columns: ColumnDef<Uom, unknown>[] = [
  { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'dimension', header: 'Dimension', cell: ({ row }) => humanize(row.original.dimension) },
  { accessorKey: 'precision', header: 'Decimals', meta: { numeric: true } },
];

interface Values {
  code: string;
  name: string;
  dimension: UomDimension;
  precision: string;
}

export function UnitsSetup() {
  const { can } = useAuth();
  const q = useUoms();
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({ defaultValues: { code: '', name: '', dimension: 'COUNT', precision: '0' } });
  const save = useApiMutation((v: Values) => api.post('/uoms', { code: v.code.trim().toUpperCase(), name: v.name.trim(), dimension: v.dimension, precision: Number(v.precision) }), {
    invalidate: [catalogKeys.uoms()],
    success: 'Unit created',
    silentError: true,
    onSuccess: () => {
      setOpen(false);
      form.reset();
    },
  });
  return (
    <>
      <DataTable
        columns={columns}
        data={q.data}
        loading={q.isFetching}
        error={q.error}
        searchable
        pageSize={0}
        toolbar={
          can('inventory.item.manage') && (
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => setOpen(true)}>
              <Plus /> New unit
            </Button>
          )
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          title="New unit of measure"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="uom-form" loading={save.isPending}>
                Create
              </Button>
            </>
          }
        >
          <form id="uom-form" className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <FormGrid>
              <Field label="Code" htmlFor="u-code" required error={form.formState.errors.code}>
                <Input id="u-code" className="font-mono uppercase" {...form.register('code', { validate: (v) => /^[A-Za-z0-9]{1,10}$/.test(v.trim()) || '1–10 letters/digits' })} />
              </Field>
              <Field label="Name" htmlFor="u-name" required error={form.formState.errors.name}>
                <Input id="u-name" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
              </Field>
              <Field label="Dimension" htmlFor="u-dim">
                <NativeSelect id="u-dim" {...form.register('dimension')}>
                  {['COUNT', 'LENGTH', 'AREA', 'WEIGHT', 'VOLUME'].map((d) => (
                    <option key={d} value={d}>
                      {humanize(d)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Decimal places" htmlFor="u-prec">
                <Input id="u-prec" type="number" min={0} max={6} {...form.register('precision')} />
              </Field>
            </FormGrid>
            {save.error ? <FormError error={save.error} /> : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
