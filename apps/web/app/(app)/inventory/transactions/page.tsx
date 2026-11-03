'use client';

import { INVENTORY_TX_TYPE } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTransactions } from '@/lib/api/inventory';
import type { TxHeader } from '@/lib/api/types';
import { formatDateTime, humanize } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { DataTable } from '@/components/ui/data-table';
import { Badge, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { LedgerTable } from '@/components/inventory/ledger-table';

export default function TransactionsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const debounced = useDebounced(search);
  const q = useTransactions({
    type: type || undefined,
    search: debounced || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    page,
    pageSize: 50,
  });

  const columns = useMemo<ColumnDef<TxHeader, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      { accessorKey: 'type', header: 'Type', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="InventoryTxType" value={row.original.type} /> },
      { accessorKey: 'postedAt', header: 'Posted', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.postedAt)}</span> },
      { id: 'ref', header: 'Reference', enableSorting: false, accessorFn: (r) => r.referenceNumber ?? '', cell: ({ row }) => (row.original.referenceNumber ? <span>{row.original.referenceNumber} <span className="text-xs text-muted-foreground">{row.original.referenceType && row.original.referenceType !== 'MANUAL' ? humanize(row.original.referenceType) : ''}</span></span> : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'reason', header: 'Reason', enableSorting: false, cell: ({ row }) => <span className="line-clamp-1 text-muted-foreground">{row.original.reason ?? '—'}</span> },
      { id: 'lines', header: 'Lines', enableSorting: false, meta: { numeric: true }, accessorFn: (r) => r._count?.movements ?? 0 },
      { accessorKey: 'actorType', header: 'Actor', enableSorting: false, cell: ({ row }) => (row.original.actorType === 'USER' ? <span className="text-xs text-muted-foreground">User</span> : <Badge tone={row.original.actorType === 'AI' ? 'accent' : 'neutral'}>{humanize(row.original.actorType)}</Badge>) },
      { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => (row.original.status === 'REVERSED' ? <Badge tone="danger">Reversed</Badge> : <Badge tone="success">Posted</Badge>) },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Inventory ledger" description="Every stock change is a posted transaction. Transactions are immutable; corrections are reversals." />
      <Tabs defaultValue="tx">
        <TabsList>
          <TabsTrigger value="tx">Transactions</TabsTrigger>
          <TabsTrigger value="lines">Movement lines</TabsTrigger>
        </TabsList>
        <TabsContent value="tx">
          <DataTable
            columns={columns}
            data={q.data?.data}
            loading={q.isFetching}
            error={q.error}
            onRetry={() => q.refetch()}
            pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
            search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
            searchPlaceholder="Number, reference, reason…"
            exportName="inventory-transactions"
            onRowClick={(r) => router.push(`/inventory/transactions/${r.id}`)}
            toolbar={
              <>
                <NativeSelect aria-label="Type" className="h-7 w-44 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                  <option value="">All types</option>
                  {Object.entries(INVENTORY_TX_TYPE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </NativeSelect>
                <Input aria-label="From date" type="date" className="h-7 w-36 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
                <Input aria-label="To date" type="date" className="h-7 w-36 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
              </>
            }
          />
        </TabsContent>
        <TabsContent value="lines">
          <LedgerTable />
        </TabsContent>
      </Tabs>
    </>
  );
}
