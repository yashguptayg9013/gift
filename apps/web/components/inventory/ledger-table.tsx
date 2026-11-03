'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMovements } from '@/lib/api/inventory';
import type { Movement } from '@/lib/api/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { Badge, StatusBadge } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { INVENTORY_TX_TYPE } from '@puja/shared';

/** Paged stock ledger (movements), optionally scoped to one item. */
export function LedgerTable({ itemId, showItem = !itemId }: { itemId?: string; showItem?: boolean }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const q = useMovements({ itemId, type: type || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<Movement, unknown>[]>(() => {
    const cols: ColumnDef<Movement, unknown>[] = [
      { accessorKey: 'createdAt', header: 'Date', enableSorting: false, cell: ({ row }) => <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      {
        id: 'tx',
        header: 'Transaction',
        enableSorting: false,
        accessorFn: (r) => r.transaction?.number ?? '',
        cell: ({ row }) =>
          row.original.transaction ? (
            <Link href={`/inventory/transactions/${row.original.transaction.id}`} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.transaction.number}
            </Link>
          ) : null,
      },
      { id: 'type', header: 'Type', enableSorting: false, accessorFn: (r) => r.transaction?.type ?? '', cell: ({ row }) => <StatusBadge vocabulary="InventoryTxType" value={row.original.transaction?.type} /> },
    ];
    if (showItem) cols.push({ id: 'item', header: 'Item', enableSorting: false, accessorFn: (r) => `${r.item.code} ${r.item.name}`, cell: ({ row }) => <span><span className="font-mono text-xs">{row.original.item.code}</span> <span className="text-muted-foreground">{row.original.item.name}</span></span> });
    cols.push(
      { id: 'location', header: 'Location', enableSorting: false, accessorFn: (r) => r.location.code, cell: ({ row }) => <span className="font-mono text-xs">{row.original.location.code}</span> },
      { id: 'batch', header: 'Batch', enableSorting: false, accessorFn: (r) => r.batch?.batchNumber ?? '', cell: ({ row }) => row.original.batch?.batchNumber ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'bucket', header: 'Bucket', enableSorting: false, cell: ({ row }) => (row.original.bucket === 'RESERVED' ? <Badge tone="accent">Reserved</Badge> : <span className="text-xs text-muted-foreground">On hand</span>) },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        enableSorting: false,
        meta: { numeric: true },
        cell: ({ row }) => <span className={cn('font-medium', row.original.quantity > 0 ? 'text-success' : 'text-danger')}>{row.original.quantity > 0 ? '+' : ''}{formatNumber(row.original.quantity)} {row.original.item.uom.code}</span>,
      },
      { accessorKey: 'onHandAfter', header: 'On hand after', enableSorting: false, meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.onHandAfter) },
      { accessorKey: 'reservedAfter', header: 'Reserved after', enableSorting: false, meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.reservedAfter) },
      { id: 'ref', header: 'Reference', enableSorting: false, accessorFn: (r) => r.transaction?.referenceNumber ?? r.transaction?.reason ?? '', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.transaction?.referenceNumber ?? row.original.transaction?.reason ?? '—'}</span> },
    );
    return cols;
  }, [showItem]);

  return (
    <DataTable
      columns={columns}
      data={q.data?.data}
      loading={q.isFetching}
      error={q.error}
      onRetry={() => q.refetch()}
      pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
      exportName={itemId ? 'item-ledger' : 'stock-ledger'}
      dense
      toolbar={
        <NativeSelect aria-label="Transaction type" className="h-7 w-48 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All transaction types</option>
          {Object.entries(INVENTORY_TX_TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      }
    />
  );
}
