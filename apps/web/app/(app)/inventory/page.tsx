'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useCategories } from '@/lib/api/catalog';
import { type MovementKind, useStock } from '@/lib/api/inventory';
import type { ItemType, StockRow } from '@/lib/api/types';
import { formatCurrency, formatInteger, formatQty, formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { MovementMenu } from '@/components/inventory/movement-menu';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader, StockStatusBadge } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';

const KINDS: MovementKind[] = ['receipt', 'issue', 'transfer', 'adjustment', 'damage', 'return'];

function StockOverview() {
  const params = useSearchParams();
  const router = useRouter();
  const [type, setType] = useState<ItemType | ''>((params.get('type') as ItemType) ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(params.get('lowStockOnly') === '1');
  const action = params.get('action') as MovementKind | null;
  const debounced = useDebounced(search);
  const categories = useCategories(type || undefined);
  const q = useStock({ type: type || undefined, categoryId: categoryId || undefined, search: debounced || undefined, lowStockOnly: lowOnly || undefined });
  const clearAction = useCallback(() => router.replace('/inventory'), [router]);

  const columns = useMemo<ColumnDef<StockRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      {
        accessorKey: 'name',
        header: 'Item',
        cell: ({ row }) => (
          <div className="min-w-48">
            <span className="block">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">{row.original.category?.name ?? (row.original.type === 'PRODUCT' ? 'Finished good' : 'Uncategorised')}</span>
          </div>
        ),
      },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <span className="text-muted-foreground">{row.original.type === 'MATERIAL' ? 'Material' : 'Finished good'}</span> },
      { accessorKey: 'onHand', header: 'On hand', meta: { numeric: true, csv: (r) => r.onHand }, cell: ({ row }) => formatQty(row.original.onHand, row.original.uom) },
      { accessorKey: 'reserved', header: 'Reserved', meta: { numeric: true }, cell: ({ row }) => (row.original.reserved ? formatQty(row.original.reserved) : <span className="text-muted-foreground">0</span>) },
      {
        accessorKey: 'available',
        header: 'Available',
        meta: { numeric: true },
        cell: ({ row }) => <span className={row.original.stockStatus === 'OUT' ? 'text-danger' : row.original.stockStatus === 'LOW' ? 'text-warning' : 'font-medium'}>{formatQty(row.original.available, row.original.uom)}</span>,
      },
      { accessorKey: 'nonUsable', header: 'QC / rejected', meta: { numeric: true, headerLabel: 'Non-usable' }, cell: ({ row }) => (row.original.nonUsable ? formatQty(row.original.nonUsable) : <span className="text-muted-foreground">0</span>) },
      { accessorKey: 'reorderLevel', header: 'Reorder at', meta: { numeric: true }, cell: ({ row }) => (row.original.reorderLevel ? formatQty(row.original.reorderLevel) : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'stockStatus', header: 'Status', cell: ({ row }) => <StockStatusBadge status={row.original.stockStatus} /> },
      { accessorKey: 'lastPurchasePrice', header: 'Last price', meta: { numeric: true }, cell: ({ row }) => formatCurrency(row.original.lastPurchasePrice) },
      { accessorKey: 'lastMovementAt', header: 'Last movement', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lastMovementAt ? formatRelative(row.original.lastMovementAt) : 'Never'}</span> },
    ],
    [],
  );

  const totals = useMemo(() => {
    const rows = q.data ?? [];
    return { count: rows.length, low: rows.filter((r) => r.stockStatus === 'LOW').length, out: rows.filter((r) => r.stockStatus === 'OUT' && (r.reorderLevel > 0 || r.minStock > 0)).length };
  }, [q.data]);

  return (
    <>
      <PageHeader
        title="Stock"
        description={q.data ? `${formatInteger(totals.count)} items · ${formatInteger(totals.low)} low · ${formatInteger(totals.out)} out of stock. Available = usable on hand − reserved.` : 'Live balances from the inventory ledger.'}
        actions={<MovementMenu initialKind={action && KINDS.includes(action) ? action : null} onInitialHandled={clearAction} />}
      />
      <DataTable
        columns={columns}
        data={q.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        search={{ value: search, onChange: setSearch }}
        searchPlaceholder="Search code, name, colour…"
        exportName="stock"
        initialHidden={{ lastPurchasePrice: false, nonUsable: false }}
        onRowClick={(r) => router.push(r.type === 'MATERIAL' ? `/inventory/materials/${r.id}` : `/inventory/products/variant/${r.id}`)}
        toolbar={
          <>
            <NativeSelect aria-label="Item type" className="h-7 w-36 text-sm" value={type} onChange={(e) => { setType(e.target.value as ItemType | ''); setCategoryId(''); }}>
              <option value="">All types</option>
              <option value="MATERIAL">Materials</option>
              <option value="PRODUCT">Finished goods</option>
            </NativeSelect>
            <NativeSelect aria-label="Category" className="h-7 w-44 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-2 pl-1">
              <Switch id="low-only" checked={lowOnly} onCheckedChange={setLowOnly} />
              <Label htmlFor="low-only" className="font-normal text-muted-foreground">
                Low stock only
              </Label>
            </div>
          </>
        }
      />
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <StockOverview />
    </Suspense>
  );
}
