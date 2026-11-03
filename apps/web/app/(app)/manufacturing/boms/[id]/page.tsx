'use client';

import { Archive, Calculator, Copy, GitCompare, Plus, Save, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { loadItemOptions } from '@/lib/api/catalog';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { mfgKeys, useBom, useBomCompare, type Bom, type BomVersion, type Requirements } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber, formatQty, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { Badge, EmptyState, ErrorState, FormError, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { BomEditor, lineErrors, linesFromVersion, toLineInputs, type EditLine } from '@/components/manufacturing/bom-editor';

export default function BomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useBom(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={10} />;
  return <BomView bom={q.data} />;
}

function BomView({ bom }: { bom: Bom }) {
  const { can } = useAuth();
  const router = useRouter();
  const preferred = bom.versions.find((v) => v.status === 'ACTIVE') ?? bom.versions[0];
  const [versionId, setVersionId] = useState(preferred?.id);
  const version = bom.versions.find((v) => v.id === versionId) ?? preferred;
  const [dialog, setDialog] = useState<null | 'duplicate' | 'compare' | 'requirements'>(null);
  const variables = ['qty', ...Object.entries(bom.item.attributes ?? {}).filter(([, v]) => v !== '' && v !== null && Number.isFinite(Number(v))).map(([k]) => k)];

  const act = useApiMutation((a: 'activate' | 'archive') => api.post<BomVersion>(`/boms/versions/${version!.id}/${a}`), { invalidate: [mfgKeys.all], success: (v) => `Version ${v.version} ${v.status === 'ACTIVE' ? 'activated' : 'archived'}` });
  const newVersion = useApiMutation(() => api.post<BomVersion>(`/boms/${bom.id}/versions`, { copyFromVersionId: version!.id }), {
    invalidate: [mfgKeys.all],
    success: (v) => `Draft version ${v.version} created`,
    onSuccess: (v) => setVersionId(v.id),
  });

  if (!version) return <EmptyState title="This BOM has no versions" />;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Bills of materials', href: '/manufacturing/boms' }, { label: bom.code }]}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{bom.code}</span> <span className="font-normal text-muted-foreground">·</span> {bom.name}
          </span>
        }
        description={
          <Link href={`/inventory/products/variant/${bom.item.id}`} className="hover:underline">
            <span className="font-mono text-xs">{bom.item.code}</span> {bom.item.name}
          </Link>
        }
        actions={
          <>
            <Button onClick={() => setDialog('requirements')}>
              <Calculator /> Requirements
            </Button>
            {bom.versions.length > 1 && (
              <Button onClick={() => setDialog('compare')}>
                <GitCompare /> Compare
              </Button>
            )}
            {can('bom.manage') && (
              <Button onClick={() => setDialog('duplicate')}>
                <Copy /> Duplicate
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Version</span>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="BOM versions">
          {bom.versions.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === version.id}
              onClick={() => setVersionId(v.id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${v.id === version.id ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'}`}
            >
              v{v.version} <StatusBadge vocabulary="BomStatus" value={v.status} />
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {can('bom.manage') && (
            <Button size="sm" loading={newVersion.isPending} onClick={() => newVersion.mutate(undefined)}>
              <Plus /> New version from v{version.version}
            </Button>
          )}
          {can('bom.activate') && version.status !== 'ACTIVE' && (
            <Button size="sm" variant="primary" loading={act.isPending && act.variables === 'activate'} onClick={() => act.mutate('activate')}>
              <ShieldCheck /> Activate v{version.version}
            </Button>
          )}
          {can('bom.activate') && version.status !== 'ARCHIVED' && (
            <Button size="sm" variant="danger-ghost" loading={act.isPending && act.variables === 'archive'} onClick={() => act.mutate('archive')}>
              <Archive /> Archive
            </Button>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Created {formatDateTime(version.createdAt)}
        {version.activatedAt && ` · activated ${formatDateTime(version.activatedAt)}`} · output quantity {formatNumber(version.outputQuantity)}
        {version.notes && ` · ${version.notes}`}
      </p>

      {version.status === 'DRAFT' && can('bom.manage') ? (
        <DraftEditor key={version.id} version={version} variables={variables} />
      ) : (
        <Section>
          <VersionTable version={version} />
        </Section>
      )}

      {dialog === 'duplicate' && <DuplicateDialog bom={bom} version={version} onClose={() => setDialog(null)} onDone={(bomId) => router.push(`/manufacturing/boms/${bomId}`)} />}
      {dialog === 'compare' && <CompareDialog bom={bom} current={version} onClose={() => setDialog(null)} />}
      {dialog === 'requirements' && <RequirementsDialog version={version} onClose={() => setDialog(null)} />}
    </>
  );
}

function VersionTable({ version }: { version: BomVersion }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Material</th>
            <th className="px-3 py-2 text-right font-medium">Quantity</th>
            <th className="px-3 py-2 text-right font-medium">Wastage</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Alternatives</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {version.lines.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2 text-muted-foreground">{l.lineNo}</td>
              <td className="px-3 py-2">
                <span className="font-mono text-xs">{l.material.code}</span> {l.material.name}
                {l.specifications && <div className="text-xs text-muted-foreground">{l.specifications}</div>}
              </td>
              <td className="tabular px-3 py-2 text-right">{l.quantityFormula ? <code className="rounded bg-muted px-1 font-mono text-xs">{l.quantityFormula}</code> : formatQty(l.quantity, l.uomCode)}</td>
              <td className="tabular px-3 py-2 text-right">{formatNumber(l.wastagePercent)}%</td>
              <td className="px-3 py-2">
                {l.stageDefinition?.name ?? 'First stage'} <span className="text-xs text-muted-foreground">{l.consumptionMode === 'MANUAL' ? '· manual' : ''}</span>
              </td>
              <td className="px-3 py-2 text-xs">{l.alternatives.length ? l.alternatives.map((a) => `${a.material.code} ×${a.conversionFactor}`).join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftEditor({ version, variables }: { version: BomVersion; variables: string[] }) {
  const [lines, setLines] = useState<EditLine[]>(() => linesFromVersion(version.lines));
  const [outputQuantity, setOutputQuantity] = useState(String(version.outputQuantity));
  const [localError, setLocalError] = useState<string | null>(null);
  const save = useApiMutation(() => api.put<BomVersion>(`/boms/versions/${version.id}`, { outputQuantity: Number(outputQuantity) || 1, notes: version.notes ?? undefined, lines: toLineInputs(lines) }), {
    invalidate: [mfgKeys.all],
    success: 'Draft saved',
    silentError: true,
  });
  return (
    <Section
      title="Draft components"
      description="Drafts can be edited freely. Activating validates formulas against the SKU's attributes."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={save.isPending}
          onClick={() => {
            const err = lineErrors(lines);
            setLocalError(err);
            if (!err) save.mutate(undefined);
          }}
        >
          <Save /> Save draft
        </Button>
      }
    >
      <div className="p-4">
        <BomEditor lines={lines} onChange={setLines} variables={variables} outputQuantity={outputQuantity} onOutputQuantity={setOutputQuantity} error={localError ? new Error(localError) : save.error} />
      </div>
    </Section>
  );
}

function DuplicateDialog({ bom, version, onClose, onDone }: { bom: Bom; version: BomVersion; onClose: () => void; onDone: (bomId: string) => void }) {
  const [targetItemId, setTarget] = useState<string | null>(null);
  const materials = [...new Map(version.lines.map((l) => [l.materialId, l.material])).values()];
  const [subs, setSubs] = useState<Record<string, string | null>>({});
  const dup = useApiMutation(
    () =>
      api.post<BomVersion>(`/boms/versions/${version.id}/duplicate`, {
        targetItemId: targetItemId ?? undefined,
        substitutions: Object.entries(subs)
          .filter(([, to]) => to)
          .map(([fromMaterialId, toMaterialId]) => ({ fromMaterialId, toMaterialId })),
      }),
    { invalidate: [mfgKeys.all], success: (v) => `Draft v${v.version} created`, silentError: true, onSuccess: (v) => onDone(v.bomId) },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        title={`Duplicate ${bom.code} v${version.version}`}
        description="Copies the components to another SKU (or a new draft of this BOM), swapping materials — e.g. black PU leather → blue PU leather for the Blue variant."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={dup.isPending} onClick={() => dup.mutate(undefined)}>
              Duplicate as draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Target SKU" htmlFor="dup-target" hint="Leave empty to create a new draft version of this BOM">
            <AsyncCombobox id="dup-target" value={targetItemId} onChange={(v) => setTarget(v)} clearable queryKey={['bom-sku-options']} load={(s) => loadItemOptions(s, 'PRODUCT')} placeholder="Same SKU" />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium">Material substitutions</p>
            {materials.map((m) => (
              <div key={m.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                <span className="text-sm">
                  <span className="font-mono text-xs">{m.code}</span> {m.name}
                </span>
                <AsyncCombobox aria-invalid={false} value={subs[m.id] ?? null} onChange={(v) => setSubs((s) => ({ ...s, [m.id]: v }))} clearable queryKey={['bom-material-options']} load={(s) => loadItemOptions(s, 'MATERIAL')} placeholder="Keep same material" />
              </div>
            ))}
          </div>
          <FormError error={dup.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog({ bom, current, onClose }: { bom: Bom; current: BomVersion; onClose: () => void }) {
  const other = bom.versions.find((v) => v.id !== current.id);
  const [a, setA] = useState(other?.id ?? '');
  const [b, setB] = useState(current.id);
  const q = useBomCompare(a, b);
  const tone = { added: 'success', removed: 'danger', changed: 'warning', same: 'neutral' } as const;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" title="Compare versions">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="From version" className="w-36" value={a} onChange={(e) => setA(e.target.value)}>
            {bom.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} ({humanize(v.status)})
              </option>
            ))}
          </NativeSelect>
          <span className="text-sm text-muted-foreground">→</span>
          <NativeSelect aria-label="To version" className="w-36" value={b} onChange={(e) => setB(e.target.value)}>
            {bom.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} ({humanize(v.status)})
              </option>
            ))}
          </NativeSelect>
        </div>
        {a === b ? (
          <p className="text-sm text-muted-foreground">Pick two different versions.</p>
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data ? (
          <LoadingRows rows={4} />
        ) : (
          <ul className="divide-y rounded-md border">
            {q.data.rows.map((r) => (
              <li key={r.materialId} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone={tone[r.change]}>{humanize(r.change)}</Badge>
                  <span className="font-mono text-xs">{r.material.code}</span> {r.material.name}
                </div>
                {r.differences.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-2 text-xs text-muted-foreground">
                    {r.differences.map((d) => (
                      <li key={d.field}>
                        {humanize(d.field)}: <span className="text-danger line-through">{String(d.from ?? '—')}</span> → <span className="text-success">{String(d.to ?? '—')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequirementsDialog({ version, onClose }: { version: BomVersion; onClose: () => void }) {
  const [qty, setQty] = useState('100');
  const calc = useApiMutation((quantity: number) => api.post<Requirements>(`/boms/versions/${version.id}/requirements`, { quantity }), { silentError: true });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" title={`Material requirements — v${version.version}`} description="Required = per-unit quantity × finished units × (1 + wastage allowance). Availability is current free stock.">
        <form
          className="mb-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(qty) > 0) calc.mutate(Number(qty));
          }}
        >
          <Field label="Finished units" htmlFor="req-qty" className="w-40">
            <Input id="req-qty" type="number" min={1} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" loading={calc.isPending}>
            Calculate
          </Button>
        </form>
        <FormError error={calc.error} />
        {calc.data && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Per unit</th>
                  <th className="px-3 py-2 text-right font-medium">Standard</th>
                  <th className="px-3 py-2 text-right font-medium">Required</th>
                  <th className="px-3 py-2 text-right font-medium">Available</th>
                  <th className="px-3 py-2 text-right font-medium">Shortage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {calc.data.lines.map((l) => (
                  <tr key={l.bomLineId}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{l.material.code}</span> {l.material.name}
                      <div className="text-xs text-muted-foreground">{l.stage?.name ?? 'First stage'}</div>
                    </td>
                    <td className="tabular px-3 py-2 text-right">{formatNumber(l.qtyPerUnit)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatNumber(l.standardQty)}</td>
                    <td className="tabular px-3 py-2 text-right font-medium">{formatQty(l.requiredQty, l.uom)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatNumber(l.available)}</td>
                    <td className={`tabular px-3 py-2 text-right ${l.shortage ? 'font-medium text-danger' : ''}`}>{formatNumber(l.shortage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
