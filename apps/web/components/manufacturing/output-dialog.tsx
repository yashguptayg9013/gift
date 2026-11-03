'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { prodKeys, productionApi, type OutputInput } from '@/lib/api/manufacturing';
import { qualityKeys, useChecklistFor, useDefectCategories, type ChecklistItem } from '@/lib/api/quality';
import { loadWorkerOptions } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid, FormSection } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

export interface OutputTarget {
  stageId: string;
  stageName: string;
  isQcStage: boolean;
  itemId: string;
  orderNumber: string;
  /** units still available to process at this stage */
  remaining: number;
  assignedWorkers: { id: string; name: string }[];
}

export type CheckValue = { passed?: boolean; numericValue?: string; textValue?: string };

/**
 * Record production at a stage. QC stages also capture checklist results and
 * defects; the backend turns this into a quality inspection record.
 */
export function OutputDialog({ target, open, onOpenChange }: { target: OutputTarget; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { me, can } = useAuth();
  const supervisor = can('production.stage.update.any');
  const [key] = useState(newIdempotencyKey);
  const [good, setGood] = useState('');
  const [rejected, setRejected] = useState('');
  const [rework, setRework] = useState('');
  const [workerId, setWorkerId] = useState<string | null>(supervisor ? (target.assignedWorkers.length === 1 ? target.assignedWorkers[0].id : null) : me.workerId);
  const [defectCategoryId, setDefectCategoryId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [checks, setChecks] = useState<Record<string, CheckValue>>({});
  const [defects, setDefects] = useState<{ defectCategoryId: string; quantity: string }[]>([]);
  const defectsQ = useDefectCategories();
  const checklistQ = useChecklistFor(target.itemId, target.isQcStage);
  const checklist = target.isQcStage ? checklistQ.data : null;

  const n = (v: string) => (v === '' ? 0 : Number(v));
  const processed = n(good) + n(rejected);
  const total = processed + n(rework);
  const overInput = processed > target.remaining + 1e-9;

  const missingChecks = useMemo(() => {
    if (!checklist) return [] as ChecklistItem[];
    return checklist.items.filter((ci) => {
      if (!ci.isRequired) return false;
      const v = checks[ci.id];
      if (!v) return true;
      if (ci.type === 'PASS_FAIL') return v.passed === undefined;
      if (ci.type === 'NUMERIC') return !v.numericValue;
      return !v.textValue?.trim();
    });
  }, [checklist, checks]);

  const submit = useApiMutation(
    () => {
      const body: OutputInput = {
        qtyGood: n(good),
        qtyRejected: n(rejected) || undefined,
        qtyRework: n(rework) || undefined,
        workerId: workerId ?? undefined,
        defectCategoryId: !target.isQcStage && defectCategoryId ? defectCategoryId : undefined,
        remarks: remarks || undefined,
      };
      if (target.isQcStage) {
        if (checklist) {
          body.checklistId = checklist.id;
          body.checklistResults = checklist.items
            .filter((ci) => checks[ci.id])
            .map((ci) => {
              const v = checks[ci.id];
              return { checklistItemId: ci.id, passed: v.passed, numericValue: v.numericValue ? Number(v.numericValue) : undefined, textValue: v.textValue || undefined };
            });
        }
        const d = defects.filter((x) => x.defectCategoryId && Number(x.quantity) > 0).map((x) => ({ defectCategoryId: x.defectCategoryId, quantity: Number(x.quantity) }));
        if (d.length) body.defects = d;
      }
      return productionApi.output(target.stageId, body, key);
    },
    {
      invalidate: [prodKeys.all, inventoryKeys.all, qualityKeys.all],
      success: (r) => (r.replayed ? 'Already recorded' : 'Output recorded'),
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const defectSum = defects.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const invalid = total <= 0 || overInput || [good, rejected, rework].some((v) => v !== '' && !(Number(v) >= 0)) || (target.isQcStage && missingChecks.length > 0) || defectSum > n(rejected) + n(rework);
  const defectOptions = (defectsQ.data ?? []).filter((d) => d.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={target.isQcStage ? 'lg' : 'md'}
        title={`Record output — ${target.stageName}`}
        description={`${target.orderNumber} · ${formatNumber(Math.max(0, target.remaining))} unit(s) available to process`}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={invalid} loading={submit.isPending} onClick={() => submit.mutate(undefined)}>
              Record
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid cols={3}>
            <Field label={target.isQcStage ? 'Accepted' : 'Good'} htmlFor="o-good">
              <Input id="o-good" type="number" min={0} step="any" inputMode="decimal" value={good} onChange={(e) => setGood(e.target.value)} autoFocus className="h-10 text-base" />
            </Field>
            <Field label="Rejected" htmlFor="o-rej">
              <Input id="o-rej" type="number" min={0} step="any" inputMode="decimal" value={rejected} onChange={(e) => setRejected(e.target.value)} className="h-10 text-base" />
            </Field>
            <Field label="Rework" htmlFor="o-rew" hint="Sent back for rework; not counted as processed">
              <Input id="o-rew" type="number" min={0} step="any" inputMode="decimal" value={rework} onChange={(e) => setRework(e.target.value)} className="h-10 text-base" />
            </Field>
          </FormGrid>
          {overInput && <p className="text-sm text-danger">Good + rejected exceeds the {formatNumber(target.remaining)} unit(s) available at this stage.</p>}
          <FormGrid>
            {supervisor ? (
              <Field label="Worker" htmlFor="o-worker" hint="Productivity is credited to this worker">
                <AsyncCombobox id="o-worker" value={workerId} onChange={(v) => setWorkerId(v)} queryKey={['worker-options']} load={loadWorkerOptions} clearable placeholder="Select worker…" selectedLabel={target.assignedWorkers.find((w) => w.id === workerId)?.name} />
              </Field>
            ) : (
              <Field label="Worker">
                <p className="pt-1.5 text-sm">{me.name} (you)</p>
              </Field>
            )}
            {!target.isQcStage && (
              <Field label="Defect category" htmlFor="o-defect" hint="For rejected or rework units">
                <NativeSelect id="o-defect" value={defectCategoryId} onChange={(e) => setDefectCategoryId(e.target.value)}>
                  <option value="">—</option>
                  {defectOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </FormGrid>

          {target.isQcStage && (
            <>
              <FormSection title="Checklist" description={checklist ? checklist.name : checklistQ.isLoading ? 'Loading…' : 'No checklist is configured for this product. Results are recorded without one.'}>
                {checklist && (
                  <div className="divide-y rounded-md border">
                    {checklist.items.map((ci) => (
                      <CheckRow key={ci.id} item={ci} value={checks[ci.id] ?? {}} onChange={(v) => setChecks((c) => ({ ...c, [ci.id]: v }))} />
                    ))}
                  </div>
                )}
                {missingChecks.length > 0 && <p className="text-xs text-muted-foreground">{missingChecks.length} required check(s) remaining.</p>}
              </FormSection>
              <FormSection title="Defects" description="Break down rejected and rework units by defect category.">
                {defects.map((d, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label={i === 0 ? 'Category' : ''} className="flex-1">
                      <NativeSelect aria-label="Defect category" value={d.defectCategoryId} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, defectCategoryId: e.target.value } : x)))}>
                        <option value="">Select…</option>
                        {defectOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={i === 0 ? 'Qty' : ''} className="w-24">
                      <Input aria-label="Defect quantity" type="number" min={0} step="any" value={d.quantity} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                    </Field>
                    <Button variant="ghost" size="icon" aria-label="Remove defect" onClick={() => setDefects((xs) => xs.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setDefects((xs) => [...xs, { defectCategoryId: '', quantity: '' }])} disabled={!defectOptions.length}>
                  <Plus /> Add defect
                </Button>
                {defectSum > n(rejected) + n(rework) && <p className="text-xs text-danger">Defect quantities exceed rejected + rework.</p>}
              </FormSection>
            </>
          )}

          <Field label="Remarks" htmlFor="o-remarks">
            <Textarea id="o-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <FormError error={submit.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CheckRow({ item, value, onChange }: { item: ChecklistItem; value: CheckValue; onChange: (v: CheckValue) => void }) {
  const num = value.numericValue ? Number(value.numericValue) : null;
  const outOfRange = num !== null && ((item.minValue !== null && num < item.minValue) || (item.maxValue !== null && num > item.maxValue));
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        {item.label}
        {item.isRequired && <span className="ml-0.5 text-danger">*</span>}
        {item.type === 'NUMERIC' && (item.minValue !== null || item.maxValue !== null) && (
          <span className="ml-2 text-xs text-muted-foreground">
            spec {item.minValue ?? '−∞'} – {item.maxValue ?? '∞'} {item.unit ?? ''}
          </span>
        )}
      </div>
      {item.type === 'PASS_FAIL' && (
        <div className="flex gap-1" role="radiogroup" aria-label={item.label}>
          <Button size="sm" variant={value.passed === true ? 'primary' : 'secondary'} role="radio" aria-checked={value.passed === true} onClick={() => onChange({ passed: true })}>
            Pass
          </Button>
          <Button size="sm" variant={value.passed === false ? 'danger' : 'secondary'} role="radio" aria-checked={value.passed === false} onClick={() => onChange({ passed: false })}>
            Fail
          </Button>
        </div>
      )}
      {item.type === 'NUMERIC' && (
        <Input aria-label={item.label} type="number" step="any" className={`h-8 w-32 ${outOfRange ? 'border-danger' : ''}`} value={value.numericValue ?? ''} onChange={(e) => onChange({ numericValue: e.target.value, passed: e.target.value === '' ? undefined : !(item.minValue !== null && Number(e.target.value) < item.minValue) && !(item.maxValue !== null && Number(e.target.value) > item.maxValue) })} />
      )}
      {item.type === 'TEXT' && <Input aria-label={item.label} className="h-8 sm:w-64" value={value.textValue ?? ''} onChange={(e) => onChange({ textValue: e.target.value })} />}
    </div>
  );
}
