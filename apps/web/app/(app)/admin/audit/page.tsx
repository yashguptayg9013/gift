'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useAudit } from '@/lib/api/admin';
import type { AuditEntry } from '@/lib/api/types';
import { formatDateTime, humanize } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { JsonDiff } from '@/components/admin/json-diff';
import { DataTable } from '@/components/ui/data-table';
import { Badge, DescriptionList, PageHeader } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/overlays';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const dAction = useDebounced(action);
  const dEntity = useDebounced(entityType);
  const dId = useDebounced(entityId);
  const q = useAudit({
    action: dAction || undefined,
    entityType: dEntity || undefined,
    entityId: dId || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    page,
    pageSize: 50,
  });

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      { accessorKey: 'createdAt', header: 'When', enableSorting: false, cell: ({ row }) => <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { id: 'actor', header: 'Actor', enableSorting: false, accessorFn: (r) => r.actor?.name ?? r.actorType, cell: ({ row }) => (row.original.actor ? <span>{row.original.actor.name}{row.original.actorType === 'AI' && <Badge tone="accent" className="ml-1">via AI</Badge>}</span> : <Badge>{humanize(row.original.actorType)}</Badge>) },
      { accessorKey: 'action', header: 'Action', enableSorting: false, cell: ({ row }) => <code className="text-xs">{row.original.action}</code> },
      { id: 'entity', header: 'Entity', enableSorting: false, accessorFn: (r) => `${r.entityType} ${r.entityId ?? ''}`, cell: ({ row }) => <span className="text-sm">{row.original.entityType} <span className="font-mono text-[11px] text-muted-foreground">{row.original.entityId?.slice(0, 10)}</span></span> },
      { accessorKey: 'summary', header: 'Summary', enableSorting: false, cell: ({ row }) => <span className="line-clamp-1 text-muted-foreground">{row.original.summary ?? '—'}</span> },
      { accessorKey: 'ip', header: 'IP', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ip ?? '—'}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every change, sign-in and approval. Rows cannot be edited or deleted." />
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
        onRowClick={setOpen}
        exportName="audit-log"
        dense
        toolbar={
          <>
            <Input aria-label="Action prefix" placeholder="Action (e.g. inventory.)" className="h-7 w-48 text-sm" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
            <Input aria-label="Entity type" placeholder="Entity type" className="h-7 w-36 text-sm" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} />
            <Input aria-label="Entity id" placeholder="Entity ID" className="h-7 w-36 text-sm" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
            <Input aria-label="From date" type="date" className="h-7 w-36 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <Input aria-label="To date" type="date" className="h-7 w-36 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </>
        }
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent size="lg" title={open?.action ?? 'Audit entry'} description={open?.summary ?? undefined}>
          {open && (
            <div className="space-y-5">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'When', value: formatDateTime(open.createdAt) },
                  { label: 'Actor', value: `${open.actor?.name ?? humanize(open.actorType)}${open.actor ? ` (${open.actor.email})` : ''}` },
                  { label: 'Entity', value: `${open.entityType} ${open.entityId ?? ''}` },
                  { label: 'Request ID', value: <code className="text-xs">{open.requestId ?? '—'}</code> },
                  { label: 'IP address', value: open.ip },
                ]}
              />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Changes</h3>
                <JsonDiff before={open.before} after={open.after} />
              </div>
              {open.metadata != null && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Metadata</h3>
                  <pre className="overflow-x-auto rounded-md border bg-subtle p-3 text-xs">{JSON.stringify(open.metadata, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
