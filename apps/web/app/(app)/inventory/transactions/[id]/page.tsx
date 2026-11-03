'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys, useTransaction } from '@/lib/api/inventory';
import type { Movement, TxDetail } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateTime, formatNumber, humanize } from '@/lib/format';
import { cn, newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, DescriptionList, ErrorState, FormError, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

const REVERSIBLE = ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'DAMAGE', 'RETURN'];

const columns: ColumnDef<Movement, unknown>[] = [
  { id: 'item', header: 'Item', accessorFn: (r) => r.item.code, cell: ({ row }) => <Link href={`/inventory/materials/${row.original.item.id}`} className="hover:underline"><span className="font-mono text-xs">{row.original.item.code}</span> {row.original.item.name}</Link> },
  { id: 'location', header: 'Location', accessorFn: (r) => r.location.code, cell: ({ row }) => <span className="font-mono text-xs">{row.original.location.code}</span> },
  { id: 'batch', header: 'Batch', accessorFn: (r) => r.batch?.batchNumber ?? '', cell: ({ row }) => row.original.batch?.batchNumber ?? '—' },
  { accessorKey: 'bucket', header: 'Bucket', cell: ({ row }) => (row.original.bucket === 'RESERVED' ? <Badge tone="accent">Reserved</Badge> : 'On hand') },
  { accessorKey: 'quantity', header: 'Quantity', meta: { numeric: true }, cell: ({ row }) => <span className={cn('font-medium', row.original.quantity > 0 ? 'text-success' : 'text-danger')}>{row.original.quantity > 0 ? '+' : ''}{formatNumber(row.original.quantity)} {row.original.item.uom.code}</span> },
  { accessorKey: 'unitCost', header: 'Unit cost', meta: { numeric: true }, cell: ({ row }) => formatCurrency(row.original.unitCost) },
  { accessorKey: 'onHandAfter', header: 'On hand after', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.onHandAfter) },
  { accessorKey: 'reservedAfter', header: 'Reserved after', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.reservedAfter) },
];

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const q = useTransaction(id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const reverse = useApiMutation((r: string) => api.post<TxDetail>(`/inventory/transactions/${id}/reverse`, { reason: r }, { idempotencyKey: key }), {
    invalidate: [inventoryKeys.all],
    success: (t) => `Reversed as ${t.number}`,
    silentError: true,
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setKey(newIdempotencyKey());
    },
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={8} />;
  const t = q.data;
  const canReverse = can('inventory.reverse') && t.status === 'POSTED' && !t.reversedBy && REVERSIBLE.includes(t.type) && (!t.referenceType || t.referenceType === 'MANUAL');

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Ledger', href: '/inventory/transactions' }, { label: t.number }]}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{t.number}</span> <StatusBadge vocabulary="InventoryTxType" value={t.type} />
            {t.status === 'REVERSED' && <Badge tone="danger">Reversed</Badge>}
          </span>
        }
        description={`Posted ${formatDateTime(t.postedAt)}`}
        actions={
          canReverse && (
            <Button variant="danger-ghost" onClick={() => setOpen(true)}>
              <Undo2 /> Reverse
            </Button>
          )
        }
      />
      <Section className="mb-5">
        <div className="p-4">
          <DescriptionList
            columns={4}
            items={[
              { label: 'Reference', value: t.referenceNumber ? `${t.referenceNumber}${t.referenceType && t.referenceType !== 'MANUAL' ? ` (${humanize(t.referenceType)})` : ''}` : '—' },
              { label: 'Reason', value: t.reason },
              { label: 'Created by', value: t.createdBy?.name ?? (t.actorType === 'SYSTEM' ? 'System' : '—') },
              { label: 'Approved by', value: t.approvedBy?.name },
              { label: 'Actor', value: humanize(t.actorType) },
              { label: 'Remarks', value: t.remarks },
              { label: 'Reversal of', value: t.reversalOf ? <Link className="text-primary hover:underline" href={`/inventory/transactions/${t.reversalOf.id}`}>{t.reversalOf.number}</Link> : '—' },
              { label: 'Reversed by', value: t.reversedBy ? <Link className="text-primary hover:underline" href={`/inventory/transactions/${t.reversedBy.id}`}>{t.reversedBy.number}</Link> : '—' },
            ]}
          />
        </div>
      </Section>
      <DataTable columns={columns} data={t.movements} pageSize={0} exportName={`tx-${t.number.replace(/\//g, '-')}`} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          title={`Reverse ${t.number}?`}
          description="A new REVERSAL transaction posts the negated movements. This fails if the stock has since been used."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={!reason.trim()} loading={reverse.isPending} onClick={() => reverse.mutate(reason.trim())}>
                Reverse transaction
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Reason" htmlFor="rev-reason" required>
              <Input id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" autoFocus />
            </Field>
            {reverse.error ? <FormError error={reverse.error} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
