'use client';

import { ChevronDown, ChevronUp, Plus, Sigma, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { loadItemOptions } from '@/lib/api/catalog';
import { useStages, type BomLine, type BomLineInput } from '@/lib/api/manufacturing';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';

export interface EditLine {
  key: string;
  materialId: string | null;
  materialLabel?: string;
  useFormula: boolean;
  quantity: string;
  quantityFormula: string;
  uomCode: string;
  wastagePercent: string;
  stageDefinitionId: string;
  consumptionMode: 'BACKFLUSH' | 'MANUAL';
  specifications: string;
  alternatives: { materialId: string | null; label?: string; conversionFactor: string }[];
  expanded?: boolean;
}

let seq = 0;
export const newLine = (): EditLine => ({
  key: `l${++seq}`,
  materialId: null,
  useFormula: false,
  quantity: '',
  quantityFormula: '',
  uomCode: '',
  wastagePercent: '0',
  stageDefinitionId: '',
  consumptionMode: 'BACKFLUSH',
  specifications: '',
  alternatives: [],
});

export function linesFromVersion(lines: BomLine[]): EditLine[] {
  return lines.map((l) => ({
    key: `l${++seq}`,
    materialId: l.materialId,
    materialLabel: `${l.material.code} · ${l.material.name}`,
    useFormula: !!l.quantityFormula,
    quantity: l.quantityFormula ? '' : String(l.quantity),
    quantityFormula: l.quantityFormula ?? '',
    uomCode: l.uomCode,
    wastagePercent: String(l.wastagePercent),
    stageDefinitionId: l.stageDefinitionId ?? '',
    consumptionMode: l.consumptionMode,
    specifications: l.specifications ?? '',
    alternatives: l.alternatives.map((a) => ({ materialId: a.materialId, label: `${a.material.code} · ${a.material.name}`, conversionFactor: String(a.conversionFactor) })),
  }));
}

export function toLineInputs(lines: EditLine[]): BomLineInput[] {
  return lines
    .filter((l) => l.materialId)
    .map((l) => ({
      materialId: l.materialId!,
      quantity: l.useFormula ? 0 : Number(l.quantity),
      quantityFormula: l.useFormula ? l.quantityFormula.trim() : undefined,
      uomCode: l.uomCode.trim() || undefined,
      wastagePercent: Number(l.wastagePercent) || 0,
      stageDefinitionId: l.stageDefinitionId || undefined,
      consumptionMode: l.consumptionMode,
      specifications: l.specifications.trim() || undefined,
      alternatives: l.alternatives.filter((a) => a.materialId).map((a, i) => ({ materialId: a.materialId!, conversionFactor: Number(a.conversionFactor) || 1, priority: i + 1 })),
    }));
}

export function lineErrors(lines: EditLine[]): string | null {
  if (!lines.some((l) => l.materialId)) return 'Add at least one component';
  for (const [i, l] of lines.entries()) {
    if (!l.materialId) continue;
    if (l.useFormula ? !l.quantityFormula.trim() : !(Number(l.quantity) > 0)) return `Line ${i + 1}: enter a quantity or formula`;
    const w = Number(l.wastagePercent);
    if (!(w >= 0 && w <= 100)) return `Line ${i + 1}: wastage must be 0–100%`;
  }
  return null;
}

/** Editable component grid for a BOM draft version. */
export function BomEditor({ lines, onChange, variables, outputQuantity, onOutputQuantity, error }: { lines: EditLine[]; onChange: (l: EditLine[]) => void; variables: string[]; outputQuantity: string; onOutputQuantity: (v: string) => void; error?: unknown }) {
  const stages = useStages();
  const update = (key: string, patch: Partial<EditLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...lines];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Output quantity" htmlFor="bom-outq" hint="Line quantities produce this many finished units" className="w-48">
          <Input id="bom-outq" type="number" min={0} step="any" value={outputQuantity} onChange={(e) => onOutputQuantity(e.target.value)} />
        </Field>
        <p className="pb-1 text-xs text-muted-foreground">
          <Sigma className="mr-1 inline size-3.5" aria-hidden />
          Formula variables: {variables.map((v) => <code key={v} className="mr-1 rounded bg-muted px-1 font-mono">{v}</code>)} · functions min, max, ceil, floor, round, abs, sqrt
        </p>
      </div>
      <div className="divide-y rounded-md border">
        {lines.map((l, i) => (
          <div key={l.key} className="space-y-2 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1.4fr_0.7fr_0.7fr_1.2fr_auto]">
              <Field label={i === 0 ? 'Material' : ''} htmlFor={`m-${l.key}`}>
                <AsyncCombobox id={`m-${l.key}`} value={l.materialId} selectedLabel={l.materialLabel} queryKey={['bom-material-options']} load={(s) => loadItemOptions(s, 'MATERIAL')} placeholder="Select material…" onChange={(v, o) => update(l.key, { materialId: v, materialLabel: o?.label, uomCode: o?.description?.split(' · ')[0] ?? l.uomCode })} />
              </Field>
              <Field label={i === 0 ? 'Quantity / formula' : ''}>
                <div className="flex gap-1">
                  <NativeSelect aria-label="Quantity mode" className="w-24" value={l.useFormula ? 'f' : 'q'} onChange={(e) => update(l.key, { useFormula: e.target.value === 'f' })}>
                    <option value="q">Qty</option>
                    <option value="f">Formula</option>
                  </NativeSelect>
                  {l.useFormula ? (
                    <Input aria-label="Quantity formula" className="font-mono text-xs" placeholder="(length_mm+20)*(width_mm+20)/1e6" value={l.quantityFormula} onChange={(e) => update(l.key, { quantityFormula: e.target.value })} />
                  ) : (
                    <Input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                  )}
                </div>
              </Field>
              <Field label={i === 0 ? 'Unit' : ''}>
                <Input aria-label="Unit" value={l.uomCode} placeholder="base" onChange={(e) => update(l.key, { uomCode: e.target.value.toUpperCase() })} />
              </Field>
              <Field label={i === 0 ? 'Wastage %' : ''}>
                <Input aria-label="Wastage percent" type="number" min={0} max={100} step="any" value={l.wastagePercent} onChange={(e) => update(l.key, { wastagePercent: e.target.value })} />
              </Field>
              <Field label={i === 0 ? 'Consumed at stage' : ''}>
                <NativeSelect aria-label="Consumption stage" value={l.stageDefinitionId} onChange={(e) => update(l.key, { stageDefinitionId: e.target.value })}>
                  <option value="">First stage</option>
                  {(stages.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className={`flex items-end gap-0.5 ${i === 0 ? 'md:pt-5' : ''}`}>
                <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                  <ChevronDown />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Remove line" onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => update(l.key, { expanded: !l.expanded })} aria-expanded={!!l.expanded}>
              {l.expanded ? 'Hide' : 'Show'} details ({l.consumptionMode === 'MANUAL' ? 'manual issue' : 'backflush'}, {l.alternatives.length} alternative{l.alternatives.length === 1 ? '' : 's'})
            </button>
            {l.expanded && (
              <div className="grid grid-cols-1 gap-3 rounded-md bg-subtle p-3 md:grid-cols-2">
                <Field label="Consumption" hint="Backflush consumes automatically when output is recorded at the stage">
                  <NativeSelect value={l.consumptionMode} onChange={(e) => update(l.key, { consumptionMode: e.target.value as 'BACKFLUSH' | 'MANUAL' })}>
                    <option value="BACKFLUSH">Backflush at stage</option>
                    <option value="MANUAL">Manual issue</option>
                  </NativeSelect>
                </Field>
                <Field label="Specifications">
                  <Textarea rows={1} value={l.specifications} onChange={(e) => update(l.key, { specifications: e.target.value })} />
                </Field>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-xs font-medium">Alternative materials</p>
                  {l.alternatives.map((a, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <div className="flex-1">
                        <AsyncCombobox value={a.materialId} selectedLabel={a.label} queryKey={['bom-material-options']} load={(s) => loadItemOptions(s, 'MATERIAL')} placeholder="Alternative material…" onChange={(v, o) => update(l.key, { alternatives: l.alternatives.map((x, k) => (k === j ? { ...x, materialId: v, label: o?.label } : x)) })} />
                      </div>
                      <Input aria-label="Conversion factor" className="w-24" type="number" step="any" min={0} value={a.conversionFactor} onChange={(e) => update(l.key, { alternatives: l.alternatives.map((x, k) => (k === j ? { ...x, conversionFactor: e.target.value } : x)) })} />
                      <Button size="icon-sm" variant="ghost" aria-label="Remove alternative" onClick={() => update(l.key, { alternatives: l.alternatives.filter((_, k) => k !== j) })}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => update(l.key, { alternatives: [...l.alternatives, { materialId: null, conversionFactor: '1' }] })}>
                    <Plus /> Add alternative
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" onClick={() => onChange([...lines, newLine()])}>
        <Plus /> Add component
      </Button>
      <FormError error={error} />
    </div>
  );
}

/** Hook: editable lines state seeded once. */
export function useEditLines(initial: () => EditLine[]) {
  return useState<EditLine[]>(initial);
}
