'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { loadItemOptions, useItem } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { mfgKeys, useBoms, type Bom, type BomSummary } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/data-table';
import { Badge, PageHeader } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { BomEditor, lineErrors, newLine, toLineInputs, type EditLine } from '@/components/manufacturing/bom-editor';

export default function BomsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search);
  const q = useBoms({ search: debounced || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<BomSummary, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'BOM', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { id: 'sku', header: 'SKU', accessorFn: (r) => `${r.item.code} ${r.item.name}`, cell: ({ row }) => <span><span className="font-mono text-xs text-muted-foreground">{row.original.item.code}</span> {row.original.item.name}</span> },
      {
        id: 'active',
        header: 'Active version',
        accessorFn: (r) => r.versions.find((v) => v.status === 'ACTIVE')?.version ?? '',
        cell: ({ row }) => {
          const a = row.original.versions.find((v) => v.status === 'ACTIVE');
          return a ? <Badge tone="success">v{a.version} · {a._count.lines} lines</Badge> : <Badge tone="warning">None active</Badge>;
        },
      },
      { id: 'versions', header: 'Versions', meta: { numeric: true }, accessorFn: (r) => r.versions.length },
      { id: 'drafts', header: 'Drafts', meta: { numeric: true }, accessorFn: (r) => r.versions.filter((v) => v.status === 'DRAFT').length },
      { accessorKey: 'updatedAt', header: 'Updated', cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.updatedAt)}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Bills of materials"
        description="Versioned material recipes per finished-goods SKU. Exactly one version is active; production orders freeze the version at release."
        actions={
          can('bom.manage') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New BOM
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
        searchPlaceholder="BOM code, SKU…"
        exportName="boms"
        onRowClick={(r) => router.push(`/manufacturing/boms/${r.id}`)}
      />
      {creating && <NewBomDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function NewBomDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [itemId, setItemId] = useState<string | null>(null);
  const [lines, setLines] = useState<EditLine[]>(() => [newLine()]);
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [localError, setLocalError] = useState<string | null>(null);
  const item = useItem(itemId ?? undefined);
  const variables = ['qty', ...Object.entries(item.data?.attributes ?? {}).filter(([, v]) => v !== '' && Number.isFinite(Number(v))).map(([k]) => k)];
  const create = useApiMutation(() => api.post<Bom>('/boms', { itemId, outputQuantity: Number(outputQuantity) || 1, lines: toLineInputs(lines) }), {
    invalidate: [mfgKeys.all],
    success: (b) => `Created ${b.code}`,
    silentError: true,
    onSuccess: (b) => router.push(`/manufacturing/boms/${b.id}`),
  });
  const submit = () => {
    const err = !itemId ? 'Select a SKU' : lineErrors(lines);
    setLocalError(err);
    if (!err) create.mutate(undefined);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        title="New bill of materials"
        description="Creates version 1 as a draft. Activate it to use it for production."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={submit}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Finished-goods SKU" htmlFor="bom-sku" required>
            <AsyncCombobox id="bom-sku" value={itemId} onChange={(v) => setItemId(v)} queryKey={['bom-sku-options']} load={(s) => loadItemOptions(s, 'PRODUCT')} placeholder="Search SKU…" />
          </Field>
          <BomEditor lines={lines} onChange={setLines} variables={variables} outputQuantity={outputQuantity} onOutputQuantity={setOutputQuantity} error={localError ? new Error(localError) : create.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
