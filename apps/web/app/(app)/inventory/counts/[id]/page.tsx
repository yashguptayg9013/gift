'use client';

import { Save, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { approvalKeys } from '@/lib/api/admin';
import { inventoryKeys, useStockCount } from '@/lib/api/inventory';
import type { Approval, StockCountDetail } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DescriptionList, ErrorState, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/overlays';

export default function CountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useStockCount(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={8} />;
  // remount the editor whenever fresh server data arrives so entered counts reset to saved values
  return <CountSheet key={q.dataUpdatedAt} id={id} c={q.data} />;
}

function CountSheet({ id, c }: { id: string; c: StockCountDetail }) {
  const { can } = useAuth();
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(c.lines.map((l) => [l.id, l.countedQty === null ? '' : String(l.countedQty)])));
  const [filter, setFilter] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const editable = c.status === 'DRAFT' && can('inventory.count');
  const dirty = useMemo(() => c.lines.some((l) => (l.countedQty === null ? '' : String(l.countedQty)) !== (counts[l.id] ?? '')), [c, counts]);

  const save = useApiMutation(
    () =>
      api.post<StockCountDetail>(`/inventory/stock-counts/${id}/lines`, {
        lines: Object.entries(counts)
          .filter(([, v]) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0)
          .map(([lineId, v]) => ({ lineId, countedQty: Number(v) })),
      }),
    { invalidate: [inventoryKeys.count(id)], success: 'Counts saved' },
  );
  const submit = useApiMutation(() => api.post<{ status: string; approval?: Approval }>(`/inventory/stock-counts/${id}/submit`), {
    invalidate: [inventoryKeys.all, approvalKeys.all],
    onSuccess: (r) => {
      setConfirmSubmit(false);
      if (r.status === 'PENDING_APPROVAL') toast.success(`Submitted for approval${r.approval ? ` (${r.approval.number})` : ''}`);
      else toast.success('Reconciliation posted');
    },
  });
  const cancel = useApiMutation(() => api.post(`/inventory/stock-counts/${id}/cancel`), { invalidate: [inventoryKeys.all], success: 'Count cancelled', onSuccess: () => setConfirmCancel(false) });

  const counted = c.lines.filter((l) => (counts[l.id] ?? '') !== '').length;
  const variances = c.lines.filter((l) => counts[l.id] !== '' && counts[l.id] !== undefined && Number(counts[l.id]) !== l.systemQty).length;
  const visible = c.lines.filter((l) => !filter || `${l.item?.code} ${l.item?.name} ${l.location?.code}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Stock counts', href: '/inventory/counts' }, { label: c.number }]}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{c.number}</span> <StatusBadge vocabulary="StockCountStatus" value={c.status} />
          </span>
        }
        description={`${counted} of ${c.lines.length} lines counted · ${variances} with variance`}
        actions={
          editable && (
            <>
              <Button variant="danger-ghost" onClick={() => setConfirmCancel(true)}>
                <XCircle /> Cancel count
              </Button>
              <Button onClick={() => save.mutate(undefined)} disabled={!dirty} loading={save.isPending}>
                <Save /> Save counts
              </Button>
              <Button variant="primary" onClick={() => setConfirmSubmit(true)} disabled={dirty || counted < c.lines.length}>
                <Send /> Submit
              </Button>
            </>
          )
        }
      />
      <Section className="mb-5">
        <div className="p-4">
          <DescriptionList
            columns={4}
            items={[
              { label: 'Created', value: formatDateTime(c.createdAt) },
              { label: 'Submitted', value: formatDateTime(c.submittedAt) },
              { label: 'Posted', value: formatDateTime(c.postedAt) },
              { label: 'Reconciliation', value: c.transactionId ? <Link className="text-primary hover:underline" href={`/inventory/transactions/${c.transactionId}`}>View transaction</Link> : '—' },
            ]}
          />
        </div>
      </Section>
      <Section title="Count sheet" description={editable ? 'Enter the physical quantity found for each line. Save before submitting.' : undefined} actions={<Input aria-label="Filter lines" placeholder="Filter…" className="h-7 w-48" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="h-8 px-3 text-left font-medium">Item</th>
                <th className="px-3 text-left font-medium">Location</th>
                <th className="px-3 text-left font-medium">Batch</th>
                <th className="px-3 text-right font-medium">System</th>
                <th className="px-3 text-right font-medium">Counted</th>
                <th className="px-3 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const v = counts[l.id] ?? '';
                const variance = v === '' ? null : Number(v) - l.systemQty;
                return (
                  <tr key={l.id} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs">{l.item?.code}</span> <span className="text-muted-foreground">{l.item?.name}</span>
                    </td>
                    <td className="px-3 font-mono text-xs">{l.location?.code}</td>
                    <td className="px-3">{l.batch?.batchNumber ?? '—'}</td>
                    <td className="tabular px-3 text-right">
                      {formatNumber(l.systemQty)} <span className="text-xs text-muted-foreground">{l.item?.uom.code}</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      {editable ? (
                        <Input aria-label={`Counted quantity for ${l.item?.code}`} type="number" step="any" min={0} className="ml-auto h-7 w-28 text-right" value={v} onChange={(e) => setCounts((s) => ({ ...s, [l.id]: e.target.value }))} />
                      ) : (
                        <span className="tabular">{formatNumber(l.countedQty)}</span>
                      )}
                    </td>
                    <td className={cn('tabular px-3 text-right font-medium', variance === null || variance === 0 ? 'text-muted-foreground' : variance > 0 ? 'text-success' : 'text-danger')}>
                      {variance === null ? '—' : `${variance > 0 ? '+' : ''}${formatNumber(variance)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit stock count?"
        description={`${variances} line(s) differ from the system. ${can('inventory.count.approve') ? 'You can approve counts, so variances post immediately.' : 'An approver must accept the reconciliation before stock changes.'}`}
        confirmLabel="Submit"
        loading={submit.isPending}
        onConfirm={() => submit.mutate(undefined)}
      />
      <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} title="Cancel this count?" description="No stock changes are made." confirmLabel="Cancel count" destructive loading={cancel.isPending} onConfirm={() => cancel.mutate(undefined)} />
    </>
  );
}
