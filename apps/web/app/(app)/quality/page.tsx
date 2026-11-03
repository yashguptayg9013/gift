'use client';

import { INSPECTION_STATUS, INSPECTION_TYPE } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { loadItemOptions } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { qualityApi, qualityKeys, useInspections, type InspectionSummary } from '@/lib/api/quality';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/data-table';
import { FormError, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

export default function InspectionsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useInspections({ status: status || undefined, type: type || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<InspectionSummary, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Inspection', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <StatusBadge vocabulary="InspectionType" value={row.original.type} /> },
      { id: 'item', header: 'Item', accessorFn: (r) => `${r.item.code} ${r.item.name}`, cell: ({ row }) => <span><span className="font-mono text-xs text-muted-foreground">{row.original.item.code}</span> {row.original.item.name}</span> },
      { id: 'source', header: 'Source', accessorFn: (r) => r.productionOrder?.number ?? '', cell: ({ row }) => row.original.productionOrder?.number ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'quantityInspected', header: 'Qty', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.quantityInspected) },
      { accessorKey: 'quantityAccepted', header: 'Accepted', meta: { numeric: true }, cell: ({ row }) => (row.original.status === 'COMPLETED' ? formatNumber(row.original.quantityAccepted) : '—') },
      { accessorKey: 'quantityRejected', header: 'Rejected', meta: { numeric: true }, cell: ({ row }) => (row.original.status === 'COMPLETED' ? <span className={row.original.quantityRejected > 0 ? 'text-danger' : ''}>{formatNumber(row.original.quantityRejected)}</span> : '—') },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge vocabulary="InspectionStatus" value={row.original.status} /> },
      { id: 'inspector', header: 'Inspector', accessorFn: (r) => r.inspector?.name ?? '', cell: ({ row }) => row.original.inspector?.name ?? <span className="text-muted-foreground">Unassigned</span> },
      { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Quality inspections"
        description="Material receipt, in-process, final and random inspections. Rejected units never enter saleable stock without explicit release."
        actions={
          can('quality.inspect') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New inspection
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
        exportName="inspections"
        onRowClick={(r) => router.push(`/quality/inspections/${r.id}`)}
        toolbar={
          <>
            <NativeSelect aria-label="Status" className="h-7 w-40 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {Object.entries(INSPECTION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Type" className="h-7 w-44 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {Object.entries(INSPECTION_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
      {creating && <NewInspectionDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function NewInspectionDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState('RANDOM');
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');
  const create = useApiMutation(() => qualityApi.createInspection({ type, itemId, quantity: Number(quantity), remarks: remarks || undefined }), {
    invalidate: [qualityKeys.all],
    success: (i) => `Created ${i.number}`,
    silentError: true,
    onSuccess: (i) => router.push(`/quality/inspections/${i.id}`),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="New inspection"
        description="Receipt inspections are created automatically from goods receipts; final inspections from QC production stages."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!itemId || !(Number(quantity) > 0)} loading={create.isPending} onClick={() => create.mutate(undefined)}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Type" htmlFor="ni-type">
              <NativeSelect id="ni-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="RANDOM">Random</option>
                <option value="IN_PROCESS">In-process</option>
                <option value="FINAL">Final</option>
              </NativeSelect>
            </Field>
            <Field label="Quantity to inspect" htmlFor="ni-qty" required>
              <Input id="ni-qty" type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          </FormGrid>
          <Field label="Item" htmlFor="ni-item" required>
            <AsyncCombobox id="ni-item" value={itemId} onChange={(v) => setItemId(v)} queryKey={['inspection-item-options']} load={(s) => loadItemOptions(s)} placeholder="Material or SKU…" />
          </Field>
          <Field label="Remarks" htmlFor="ni-remarks">
            <Textarea id="ni-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <FormError error={create.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
