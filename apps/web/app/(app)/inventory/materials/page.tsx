'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCategories, useItems } from '@/lib/api/catalog';
import type { Item } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, EmptyState, PageHeader } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';

export default function MaterialsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inactive, setInactive] = useState(false);
  const debounced = useDebounced(search);
  const categories = useCategories('MATERIAL');
  const q = useItems({ type: 'MATERIAL', search: debounced || undefined, categoryId: categoryId || undefined, includeInactive: inactive || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<Item, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name', enableSorting: false },
      { id: 'category', header: 'Category', enableSorting: false, accessorFn: (r) => r.category?.name ?? '', cell: ({ row }) => row.original.category?.name ?? <span className="text-muted-foreground">—</span> },
      {
        id: 'specs',
        header: 'Specifications',
        enableSorting: false,
        accessorFn: (r) => Object.entries(r.attributes ?? {}).map(([k, v]) => `${k}: ${v}`).join('; '),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {Object.entries(row.original.attributes ?? {})
              .map(([, v]) => String(v))
              .join(' · ') || '—'}
          </span>
        ),
      },
      { id: 'uom', header: 'Unit', enableSorting: false, accessorFn: (r) => r.uom.code },
      { accessorKey: 'reorderLevel', header: 'Reorder at', enableSorting: false, meta: { numeric: true }, cell: ({ row }) => (row.original.reorderLevel ? formatNumber(row.original.reorderLevel) : '—') },
      {
        id: 'flags',
        header: 'Flags',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.trackBatches && <Badge tone="info">Batches</Badge>}
            {row.original.requiresInspection && <Badge tone="accent">QC</Badge>}
            {!row.original.isActive && <Badge tone="neutral">Inactive</Badge>}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Materials"
        description="Raw materials, fittings and consumables."
        actions={
          can('inventory.item.manage') && (
            <Button variant="primary" asChild>
              <Link href="/inventory/materials/new">
                <Plus /> New material
              </Link>
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
        search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        searchPlaceholder="Search code, name, colour…"
        exportName="materials"
        onRowClick={(r) => router.push(`/inventory/materials/${r.id}`)}
        empty={<EmptyState compact title={debounced ? 'No matching materials' : 'No materials yet'} description={!debounced && can('inventory.item.manage') ? 'Create your first material to start recording stock.' : undefined} />}
        toolbar={
          <>
            <NativeSelect aria-label="Category" className="h-7 w-44 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-2 pl-1">
              <Switch id="inactive" checked={inactive} onCheckedChange={setInactive} />
              <Label htmlFor="inactive" className="font-normal text-muted-foreground">
                Include inactive
              </Label>
            </div>
          </>
        }
      />
    </>
  );
}
