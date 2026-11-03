'use client';

import { APPROVAL_STATUS } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Bot, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { approvalKeys, useApproval, useApprovals } from '@/lib/api/admin';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import type { Approval } from '@/lib/api/types';
import { formatDateTime, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, DescriptionList, EmptyState, FormError, LoadingRows, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/overlays';
import { Label, Switch } from '@/components/ui/primitives';
import { JsonDiff } from '@/components/admin/json-diff';

const RESULT_LINK: Record<string, (id: string) => string> = {
  InventoryTransaction: (id) => `/inventory/transactions/${id}`,
  StockCount: (id) => `/inventory/counts/${id}`,
};

export default function ApprovalsPage() {
  const [status, setStatus] = useState('PENDING');
  const [type, setType] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useApprovals({ status: status || undefined, type: type || undefined, mine: mine || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<Approval, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      {
        accessorKey: 'title',
        header: 'Request',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-56">
            <span className="flex items-center gap-1.5">
              {row.original.requestedVia === 'AI' && <Bot className="size-3.5 text-accent-foreground" aria-label="Proposed by AI" />}
              {row.original.title}
            </span>
            {row.original.description && <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</span>}
          </div>
        ),
      },
      { accessorKey: 'type', header: 'Type', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{humanize(row.original.type)}</span> },
      { id: 'by', header: 'Requested by', enableSorting: false, accessorFn: (r) => r.requestedBy.name },
      { accessorKey: 'createdAt', header: 'Requested', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="ApprovalStatus" value={row.original.status} /> },
      { id: 'act', header: '', enableHiding: false, cell: ({ row }) => (row.original.canDecide ? <Badge tone="warning">Needs your decision</Badge> : null) },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Approvals" description="Stock adjustments, count reconciliations and AI-proposed actions wait here for a human decision." />
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
        onRowClick={(r) => setOpenId(r.id)}
        empty={<EmptyState compact title={status === 'PENDING' ? 'Nothing waiting for approval' : 'No requests'} />}
        toolbar={
          <>
            <NativeSelect aria-label="Status" className="h-7 w-40 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {Object.entries(APPROVAL_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Type" className="h-7 w-48 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {['STOCK_ADJUSTMENT', 'STOCK_COUNT', 'REJECTED_STOCK_RELEASE', 'AI_ACTION'].map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-2 pl-1">
              <Switch id="mine" checked={mine} onCheckedChange={setMine} />
              <Label htmlFor="mine" className="font-normal text-muted-foreground">
                My requests
              </Label>
            </div>
          </>
        }
      />
      <ApprovalSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function ApprovalSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useApproval(id ?? undefined);
  const [note, setNote] = useState('');
  const decide = useApiMutation((decision: 'approve' | 'reject') => api.post<Approval>(`/approvals/${id}/decision`, { decision, note: note.trim() || undefined }), {
    invalidate: [approvalKeys.all, inventoryKeys.all, ['dashboard']],
    success: (a) => (a.status === 'EXECUTED' ? `${a.number} approved and executed` : a.status === 'FAILED' ? null : `${a.number} ${a.status.toLowerCase()}`),
    silentError: true,
    onSuccess: () => setNote(''),
  });
  const cancel = useApiMutation(() => api.post(`/approvals/${id}/cancel`), { invalidate: [approvalKeys.all], success: 'Request cancelled', onSuccess: onClose });
  const a = q.data;

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        size="lg"
        title={a ? `${a.number} · ${a.title}` : 'Approval request'}
        description={a?.description ?? undefined}
        footer={
          a?.canDecide ? (
            <>
              <Button variant="danger-ghost" onClick={() => decide.mutate('reject')} loading={decide.isPending && decide.variables === 'reject'} disabled={decide.isPending}>
                <X /> Reject
              </Button>
              <Button variant="primary" onClick={() => decide.mutate('approve')} loading={decide.isPending && decide.variables === 'approve'} disabled={decide.isPending}>
                <Check /> Approve &amp; execute
              </Button>
            </>
          ) : a?.status === 'PENDING' ? (
            <Button variant="ghost" onClick={() => cancel.mutate(undefined)} loading={cancel.isPending}>
              Withdraw my request
            </Button>
          ) : undefined
        }
      >
        {!a ? (
          <LoadingRows />
        ) : (
          <div className="space-y-5">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Status', value: <StatusBadge vocabulary="ApprovalStatus" value={a.status} /> },
                { label: 'Type', value: humanize(a.type) },
                { label: 'Requested by', value: `${a.requestedBy.name}${a.requestedVia === 'AI' ? ' (via AI Copilot)' : ''}` },
                { label: 'Requested', value: formatDateTime(a.createdAt) },
                { label: 'Required permission', value: <code className="text-xs">{a.requiredPermission}</code> },
                { label: 'Decided by', value: a.decidedBy ? `${a.decidedBy.name} · ${formatDateTime(a.decidedAt)}` : '—' },
                { label: 'Decision note', value: a.decisionNote },
                {
                  label: 'Result',
                  value: a.resultEntityType && a.resultEntityId && RESULT_LINK[a.resultEntityType] ? (
                    <Link href={RESULT_LINK[a.resultEntityType](a.resultEntityId)} className="text-primary hover:underline">
                      View {humanize(a.resultEntityType)}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
            {a.error && (
              <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                <p className="font-medium">Execution failed</p>
                <p>{a.error}</p>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Proposed change</h3>
              <JsonDiff before={undefined} after={a.payload} />
            </div>
            {a.canDecide && (
              <Field label="Decision note" htmlFor="note" hint="Recorded in the audit log">
                <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            )}
            {decide.error ? <FormError error={decide.error} /> : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
