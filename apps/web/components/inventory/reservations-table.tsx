'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys, useReservations } from '@/lib/api/inventory';
import type { Reservation } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/overlays';

export function ReservationsTable({ itemId, openOnly = true, toolbar }: { itemId?: string; openOnly?: boolean; toolbar?: React.ReactNode }) {
  const { can } = useAuth();
  const q = useReservations({ itemId, openOnly });
  const [releasing, setReleasing] = useState<Reservation | null>(null);
  const release = useApiMutation((r: Reservation) => api.post(`/inventory/reservations/${r.id}/release`, {}), {
    invalidate: [inventoryKeys.all],
    success: 'Reservation released',
    onSuccess: () => setReleasing(null),
  });

  const columns = useMemo<ColumnDef<Reservation, unknown>[]>(
    () => [
      { accessorKey: 'createdAt', header: 'Reserved', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      ...(itemId ? [] : [{ id: 'item', header: 'Item', accessorFn: (r: Reservation) => `${r.item.code} ${r.item.name}`, cell: ({ row }: { row: { original: Reservation } }) => <span><span className="font-mono text-xs">{row.original.item.code}</span> {row.original.item.name}</span> } as ColumnDef<Reservation, unknown>]),
      { id: 'source', header: 'Source', accessorFn: (r) => r.sourceType, cell: ({ row }) => <span className="text-sm">{humanize(row.original.sourceType)}</span> },
      { id: 'location', header: 'Location', accessorFn: (r) => r.location.code, cell: ({ row }) => <span className="font-mono text-xs">{row.original.location.code}</span> },
      { id: 'batch', header: 'Batch', accessorFn: (r) => r.batch?.batchNumber ?? '', cell: ({ row }) => row.original.batch?.batchNumber ?? '—' },
      { accessorKey: 'quantity', header: 'Reserved', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.quantity) },
      { accessorKey: 'consumedQty', header: 'Consumed', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.consumedQty) },
      { accessorKey: 'releasedQty', header: 'Released', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.releasedQty) },
      { accessorKey: 'openQty', header: 'Open', meta: { numeric: true }, cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.openQty)}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge vocabulary="ReservationStatus" value={row.original.status} /> },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.sourceType === 'MANUAL' && row.original.openQty > 0 && can('inventory.reserve') ? (
            <Button size="sm" variant="ghost" onClick={() => setReleasing(row.original)}>
              Release
            </Button>
          ) : null,
      },
    ],
    [itemId, can],
  );

  return (
    <>
      <DataTable columns={columns} data={q.data} loading={q.isFetching} error={q.error} onRetry={() => q.refetch()} exportName="reservations" searchable={!itemId} toolbar={toolbar} />
      <ConfirmDialog
        open={!!releasing}
        onOpenChange={(o) => !o && setReleasing(null)}
        title="Release reservation?"
        description={releasing ? `${formatNumber(releasing.openQty)} of ${releasing.item.code} becomes available for other use.` : undefined}
        confirmLabel="Release"
        loading={release.isPending}
        onConfirm={() => releasing && release.mutate(releasing)}
      />
    </>
  );
}
