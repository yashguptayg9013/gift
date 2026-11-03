'use client';

import { STOCK_COUNT_STATUS } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api/client';
import { useCategories, useWarehouses } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys, useStockCounts } from '@/lib/api/inventory';
import type { StockCountDetail, StockCountSummary } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FormError, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

interface Values {
  warehouseId: string;
  locationId: string;
  categoryId: string;
  remarks: string;
}

function CountsList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const q = useStockCounts({ status: status || undefined, page });
  const warehouses = useWarehouses();
  const categories = useCategories();
  const form = useForm<Values>({ defaultValues: { warehouseId: '', locationId: '', categoryId: '', remarks: '' } });
  const whId = form.watch('warehouseId');
  const wh = warehouses.data?.find((w) => w.id === whId);

  useEffect(() => {
    if (params.get('new') === '1' && can('inventory.count')) setOpen(true);
  }, [params, can]);
  useEffect(() => {
    if (!form.getValues('warehouseId') && warehouses.data?.[0]) form.setValue('warehouseId', warehouses.data[0].id);
  }, [warehouses.data, form]);

  const create = useApiMutation(
    (v: Values) => api.post<StockCountDetail>('/inventory/stock-counts', { warehouseId: v.warehouseId, locationId: v.locationId || undefined, categoryId: v.categoryId || undefined, remarks: v.remarks || undefined }),
    { invalidate: [inventoryKeys.all], success: (c) => `${c.number} created`, silentError: true, onSuccess: (c) => router.push(`/inventory/counts/${c.id}`) },
  );

  const columns = useMemo<ColumnDef<StockCountSummary, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="StockCountStatus" value={row.original.status} /> },
      { id: 'lines', header: 'Lines', enableSorting: false, meta: { numeric: true }, accessorFn: (r) => r._count?.lines ?? 0 },
      { accessorKey: 'createdAt', header: 'Created', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { accessorKey: 'postedAt', header: 'Posted', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.postedAt)}</span> },
      { accessorKey: 'remarks', header: 'Remarks', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{row.original.remarks ?? '—'}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Physical counts reconcile the system with the shelf. Variances post as a reconciliation transaction after approval."
        actions={
          can('inventory.count') && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New count
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
        onRowClick={(r) => router.push(`/inventory/counts/${r.id}`)}
        toolbar={
          <NativeSelect aria-label="Status" className="h-7 w-44 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.entries(STOCK_COUNT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="New stock count"
          description="Snapshots current system quantities for the selected scope."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="count-form" loading={create.isPending}>
                Start count
              </Button>
            </>
          }
        >
          <form id="count-form" className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
            <Field label="Warehouse" htmlFor="c-wh" required>
              <NativeSelect id="c-wh" {...form.register('warehouseId', { required: true })}>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Location" htmlFor="c-loc" hint="Leave empty to count the whole warehouse">
              <NativeSelect id="c-loc" {...form.register('locationId')}>
                <option value="">All locations</option>
                {(wh?.locations ?? []).filter((l) => l.isActive).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Category" htmlFor="c-cat">
              <NativeSelect id="c-cat" {...form.register('categoryId')}>
                <option value="">All categories</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Remarks" htmlFor="c-rem">
              <Input id="c-rem" {...form.register('remarks')} />
            </Field>
            {create.error ? <FormError error={create.error} /> : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CountsPage() {
  return (
    <Suspense>
      <CountsList />
    </Suspense>
  );
}
