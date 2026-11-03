'use client';

import { PRIORITY, PRODUCTION_STATUS } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useOrders, type OrderSummary } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { OrderFormDialog } from '@/components/manufacturing/order-form-dialog';
import { ProgressBar } from '@/components/manufacturing/progress-bar';

const OPEN = 'DRAFT,RELEASED,MATERIALS_RESERVED,IN_PROGRESS';

export default function ProductionOrdersPage() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const [status, setStatus] = useState(OPEN);
  const [priority, setPriority] = useState('');
  const [delayed, setDelayed] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const debounced = useDebounced(search);
  const q = useOrders({ status: delayed ? undefined : status || undefined, priority: priority || undefined, delayed: delayed || undefined, search: debounced || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<OrderSummary, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Order', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      {
        id: 'item',
        header: 'SKU',
        enableSorting: false,
        accessorFn: (r) => `${r.item.code} ${r.item.name}`,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">{row.original.item.code}</div>
            <div className="line-clamp-1">{row.original.item.name}</div>
          </div>
        ),
      },
      { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="ProductionStatus" value={row.original.status} /> },
      { accessorKey: 'priority', header: 'Priority', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="Priority" value={row.original.priority} /> },
      {
        id: 'progress',
        header: 'Progress',
        enableSorting: false,
        accessorFn: (r) => r.quantityCompleted,
        meta: { csv: (r: OrderSummary) => `${r.quantityCompleted}/${r.quantityPlanned}` },
        cell: ({ row }) => (
          <div className="w-36">
            <div className="mb-1 flex justify-between text-xs">
              <span className="tabular">
                {formatNumber(row.original.quantityCompleted)} / {formatNumber(row.original.quantityPlanned)}
              </span>
              {row.original.quantityRejected > 0 && <span className="text-danger">{formatNumber(row.original.quantityRejected)} rej.</span>}
            </div>
            <ProgressBar value={row.original.progress} />
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Current stage',
        enableSorting: false,
        accessorFn: (r) => r.currentStage?.name ?? '',
        cell: ({ row }) =>
          row.original.currentStage ? (
            <span className="text-sm">
              {row.original.currentStage.name} <span className="text-xs text-muted-foreground">({row.original.stagesCompleted}/{row.original.stageCount})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'due',
        header: 'Due',
        enableSorting: false,
        accessorFn: (r) => r.dueDate ?? '',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {formatDate(row.original.dueDate)}
            {row.original.isDelayed && <Badge tone="danger">Late</Badge>}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Production orders"
        description="Plan, release and track manufacturing orders through their stages."
        actions={
          can('production.create') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New order
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
        searchPlaceholder="Order number, SKU…"
        exportName="production-orders"
        onRowClick={(r) => router.push(`/manufacturing/orders/${r.id}`)}
        toolbar={
          <>
            <NativeSelect aria-label="Status" className="h-7 w-48 text-sm" value={status} disabled={delayed} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value={OPEN}>Open orders</option>
              <option value="">All statuses</option>
              {Object.entries(PRODUCTION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Priority" className="h-7 w-32 text-sm" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">Any priority</option>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-1.5 pl-1">
              <Checkbox id="delayed" checked={delayed} onCheckedChange={(c) => { setDelayed(c === true); setPage(1); }} />
              <Label htmlFor="delayed" className="text-sm font-normal">Delayed only</Label>
            </div>
          </>
        }
      />
      {creating && <OrderFormDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
