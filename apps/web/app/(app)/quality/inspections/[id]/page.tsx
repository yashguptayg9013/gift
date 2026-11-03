'use client';

import { Ban, Info, Play, Plus, Trash2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { qualityApi, qualityKeys, useDefectCategories, useInspection, type InspectionDetail } from '@/lib/api/quality';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber, formatQty } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, DescriptionList, ErrorState, FormError, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { CheckRow, type CheckValue } from '@/components/manufacturing/output-dialog';
import { ReasonDialog } from '@/components/manufacturing/dialogs';

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useInspection(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={8} />;
  return <InspectionView insp={q.data} />;
}

function InspectionView({ insp }: { insp: InspectionDetail }) {
  const { can, me } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);
  const invalidate = [qualityKeys.all, inventoryKeys.all];
  const start = useApiMutation(() => qualityApi.start(insp.id), { invalidate, success: 'Inspection started' });
  const assign = useApiMutation(() => qualityApi.assign(insp.id, me.id), { invalidate, success: 'Assigned to you' });
  const cancel = useApiMutation((reason: string) => qualityApi.cancel(insp.id, reason), { invalidate, success: 'Inspection cancelled', silentError: true, onSuccess: () => setCancelOpen(false) });
  const open = insp.status === 'PENDING' || insp.status === 'IN_PROGRESS';
  const isReceipt = insp.type === 'MATERIAL_RECEIPT';
  const uom = insp.item.uom.code;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Inspections', href: '/quality' }, { label: insp.number }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{insp.number}</span>
            <StatusBadge vocabulary="InspectionType" value={insp.type} />
            <StatusBadge vocabulary="InspectionStatus" value={insp.status} />
          </span>
        }
        description={
          <span>
            <span className="font-mono text-xs">{insp.item.code}</span> {insp.item.name}
          </span>
        }
        actions={
          open &&
          can('quality.inspect') && (
            <>
              {insp.inspector?.id !== me.id && (
                <Button onClick={() => assign.mutate(undefined)} loading={assign.isPending}>
                  <UserCheck /> Assign to me
                </Button>
              )}
              {insp.status === 'PENDING' && (
                <Button onClick={() => start.mutate(undefined)} loading={start.isPending}>
                  <Play /> Start
                </Button>
              )}
              {!isReceipt && (
                <Button variant="danger-ghost" onClick={() => setCancelOpen(true)}>
                  <Ban /> Cancel
                </Button>
              )}
            </>
          )
        }
      />

      <Section className="mb-5">
        <div className="p-4">
          <DescriptionList
            columns={4}
            items={[
              { label: 'Quantity', value: formatQty(insp.quantityInspected, uom) },
              { label: 'Inspector', value: insp.inspector?.name ?? 'Unassigned' },
              { label: 'Started', value: formatDateTime(insp.startedAt) },
              { label: 'Completed', value: formatDateTime(insp.completedAt) },
              {
                label: 'Source',
                value: insp.productionOrder ? (
                  <Link href={`/manufacturing/orders/${insp.productionOrder.id}`} className="hover:underline">
                    {insp.productionOrder.number}
                  </Link>
                ) : insp.goodsReceiptLine ? (
                  `${insp.goodsReceiptLine.goodsReceipt.number} · ${insp.goodsReceiptLine.goodsReceipt.supplier.name}`
                ) : (
                  'Manual'
                ),
              },
              { label: 'Checklist', value: insp.checklist?.name ?? 'None' },
              { label: 'Created', value: formatDateTime(insp.createdAt) },
              { label: 'Remarks', value: insp.remarks ?? '—' },
            ]}
          />
        </div>
      </Section>

      {isReceipt && open && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          The received stock is held in the QC-hold location. On completion, accepted quantity moves to the store (usable) and rejected quantity to the rejected location — it is never available for production or sale. Accepted + rejected must equal the received quantity.
        </p>
      )}

      {open && can('quality.inspect') ? <CompleteForm insp={insp} /> : <Results insp={insp} />}

      {cancelOpen && <ReasonDialog open onOpenChange={setCancelOpen} title={`Cancel ${insp.number}?`} confirmLabel="Cancel inspection" destructive loading={cancel.isPending} error={cancel.error} onConfirm={(r) => cancel.mutate(r)} />}
    </>
  );
}

function Results({ insp }: { insp: InspectionDetail }) {
  const uom = insp.item.uom.code;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Outcome">
        <div className="grid grid-cols-3 divide-x">
          {[
            ['Accepted', insp.quantityAccepted, ''],
            ['Rejected', insp.quantityRejected, 'text-danger'],
            ['Rework', insp.quantityRework, 'text-warning'],
          ].map(([l, v, c]) => (
            <div key={l as string} className="px-4 py-3">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className={`tabular text-xl font-semibold ${c}`}>{formatQty(v as number, uom)}</div>
            </div>
          ))}
        </div>
        {insp.defects.length > 0 && (
          <ul className="divide-y border-t">
            {insp.defects.map((d) => (
              <li key={d.id} className="flex justify-between px-4 py-2 text-sm">
                <span>{d.defectCategory.name}</span>
                <span className="tabular">{formatNumber(d.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Checklist results">
        {!insp.checklist || insp.results.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No checklist results recorded.</p>
        ) : (
          <ul className="divide-y">
            {insp.checklist.items.map((ci) => {
              const r = insp.results.find((x) => x.checklistItemId === ci.id);
              return (
                <li key={ci.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span>{ci.label}</span>
                  <span className="flex items-center gap-2">
                    {r?.numericValue !== null && r?.numericValue !== undefined && (
                      <span className="tabular">
                        {formatNumber(r.numericValue)} {ci.unit ?? ''}
                      </span>
                    )}
                    {r?.textValue && <span>{r.textValue}</span>}
                    {r?.passed === true && <Badge tone="success">Pass</Badge>}
                    {r?.passed === false && <Badge tone="danger">Fail</Badge>}
                    {!r && <span className="text-muted-foreground">—</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CompleteForm({ insp }: { insp: InspectionDetail }) {
  const defectsQ = useDefectCategories();
  const [accepted, setAccepted] = useState(insp.type === 'MATERIAL_RECEIPT' ? String(insp.quantityInspected) : '');
  const [rejected, setRejected] = useState('0');
  const [rework, setRework] = useState('0');
  const [remarks, setRemarks] = useState(insp.remarks ?? '');
  const [checks, setChecks] = useState<Record<string, CheckValue>>({});
  const [defects, setDefects] = useState<{ defectCategoryId: string; quantity: string }[]>([]);
  const n = (v: string) => Number(v || 0);
  const complete = useApiMutation(
    () =>
      qualityApi.complete(insp.id, {
        quantityAccepted: n(accepted),
        quantityRejected: n(rejected),
        quantityRework: n(rework) || undefined,
        remarks: remarks || undefined,
        results: insp.checklist?.items
          .filter((ci) => checks[ci.id])
          .map((ci) => ({ checklistItemId: ci.id, passed: checks[ci.id].passed, numericValue: checks[ci.id].numericValue ? Number(checks[ci.id].numericValue) : undefined, textValue: checks[ci.id].textValue || undefined })),
        defects: defects.filter((d) => d.defectCategoryId && Number(d.quantity) > 0).map((d) => ({ defectCategoryId: d.defectCategoryId, quantity: Number(d.quantity) })),
      }),
    { invalidate: [qualityKeys.all, inventoryKeys.all], success: 'Inspection completed', silentError: true },
  );
  const missing = useMemo(
    () =>
      (insp.checklist?.items ?? []).filter((ci) => {
        if (!ci.isRequired) return false;
        const v = checks[ci.id];
        if (!v) return true;
        return ci.type === 'PASS_FAIL' ? v.passed === undefined : ci.type === 'NUMERIC' ? !v.numericValue : !v.textValue?.trim();
      }).length,
    [insp.checklist, checks],
  );
  const receiptMismatch = insp.type === 'MATERIAL_RECEIPT' && Math.abs(n(accepted) + n(rejected) - insp.quantityInspected) > 1e-9;
  const defectSum = defects.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const invalid = missing > 0 || receiptMismatch || [accepted, rejected, rework].some((v) => !(n(v) >= 0)) || defectSum > n(rejected) + n(rework);
  const uom = insp.item.uom.code;
  const defectOptions = (defectsQ.data ?? []).filter((d) => d.isActive && d.appliesTo !== (insp.type === 'MATERIAL_RECEIPT' ? 'PRODUCT' : 'MATERIAL'));

  return (
    <Section title="Record result" actions={<Button variant="primary" size="sm" disabled={invalid} loading={complete.isPending} onClick={() => complete.mutate(undefined)}>Complete inspection</Button>}>
      <div className="space-y-5 p-4">
        <FormGrid cols={3}>
          <Field label={`Accepted (${uom})`} htmlFor="c-acc" required>
            <Input id="c-acc" type="number" min={0} step="any" value={accepted} onChange={(e) => setAccepted(e.target.value)} />
          </Field>
          <Field label={`Rejected (${uom})`} htmlFor="c-rej">
            <Input id="c-rej" type="number" min={0} step="any" value={rejected} onChange={(e) => setRejected(e.target.value)} />
          </Field>
          <Field label={`Rework (${uom})`} htmlFor="c-rew">
            <Input id="c-rew" type="number" min={0} step="any" value={rework} onChange={(e) => setRework(e.target.value)} />
          </Field>
        </FormGrid>
        {receiptMismatch && <p className="text-sm text-danger">Accepted + rejected must equal {formatQty(insp.quantityInspected, uom)} received.</p>}

        {insp.checklist && (
          <div>
            <p className="mb-2 text-sm font-medium">
              {insp.checklist.name} {missing > 0 && <span className="text-xs font-normal text-muted-foreground">· {missing} required check(s) remaining</span>}
            </p>
            <div className="divide-y rounded-md border">
              {insp.checklist.items.map((ci) => (
                <CheckRow key={ci.id} item={ci} value={checks[ci.id] ?? {}} onChange={(v) => setChecks((c) => ({ ...c, [ci.id]: v }))} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Defects</p>
          {defects.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <NativeSelect aria-label="Defect category" className="flex-1" value={d.defectCategoryId} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, defectCategoryId: e.target.value } : x)))}>
                <option value="">Select…</option>
                {defectOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Input aria-label="Defect quantity" className="w-28" type="number" min={0} step="any" value={d.quantity} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
              <Button size="icon" variant="ghost" aria-label="Remove defect" onClick={() => setDefects((xs) => xs.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" disabled={!defectOptions.length} onClick={() => setDefects((xs) => [...xs, { defectCategoryId: '', quantity: '' }])}>
            <Plus /> Add defect
          </Button>
          {!defectOptions.length && <p className="text-xs text-muted-foreground">No defect categories configured yet.</p>}
          {defectSum > n(rejected) + n(rework) && <p className="text-xs text-danger">Defect quantities exceed rejected + rework.</p>}
        </div>

        <Field label="Remarks" htmlFor="c-remarks">
          <Textarea id="c-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <FormError error={complete.error} />
      </div>
    </Section>
  );
}
