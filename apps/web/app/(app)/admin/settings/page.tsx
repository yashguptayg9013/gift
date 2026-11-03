'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { adminKeys, useSettings } from '@/lib/api/admin';
import { useApiMutation } from '@/lib/api/hooks';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ErrorState, FormError, LoadingRows, PageHeader, Section } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';

const GROUPS: Record<string, { title: string; description: string }> = {
  company: { title: 'Company profile', description: 'Printed on quotations and challans and used for GST (CGST/SGST vs IGST) decisions. Enter your registered details.' },
  inventory: { title: 'Inventory', description: 'Approval policy and stock alerts.' },
  procurement: { title: 'Procurement', description: 'Purchase approval and reorder recommendation parameters.' },
  production: { title: 'Production', description: 'Shop-floor tolerances and delay monitoring.' },
  notifications: { title: 'Notifications', description: 'Daily summary schedule (Asia/Kolkata).' },
};

const LABELS: Record<string, { label: string; hint?: string; multiline?: boolean }> = {
  legalName: { label: 'Legal name' },
  tradeName: { label: 'Trade name' },
  address: { label: 'Registered address', multiline: true },
  stateCode: { label: 'State code', hint: 'Two-digit GST state code' },
  gstin: { label: 'GSTIN' },
  quotationTerms: { label: 'Default quotation terms', multiline: true },
  poApprovalRequired: { label: 'Purchase orders require approval' },
  segregationOfDuties: { label: 'Creator cannot approve their own PO' },
  reorderLookbackDays: { label: 'Consumption look-back (days)', hint: 'Window used to compute average daily consumption' },
  reorderCoverDays: { label: 'Cover days', hint: 'Days of stock to cover beyond lead time' },
  defaultLeadTimeDays: { label: 'Default lead time (days)' },
  allAdjustmentsRequireApproval: { label: 'All stock adjustments require approval', hint: 'Even for users holding the approve permission' },
  lowStockScanEnabled: { label: 'Low-stock alerts' },
  deadStockDays: { label: 'Dead stock threshold (days)' },
  overProductionPercent: { label: 'Allowed over-production (%)' },
  delayScanEnabled: { label: 'Production delay alerts' },
  dailySummaryEnabled: { label: 'Daily business summary' },
  dailySummaryHour: { label: 'Summary hour (0–23)' },
};

export default function SettingsPage() {
  const q = useSettings();
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <PageHeader title="Company settings" description="System-wide configuration. Every change is recorded in the audit log." />
      {!q.data ? (
        <LoadingRows />
      ) : (
        <div className="space-y-5">
          {Object.keys(GROUPS)
            .filter((k) => q.data[k])
            .map((k) => (
              // remount when the saved value changes so the draft resets to server state
              <SettingsGroup key={`${k}:${JSON.stringify(q.data[k])}`} groupKey={k} value={q.data[k]} />
            ))}
        </div>
      )}
    </>
  );
}

function SettingsGroup({ groupKey, value }: { groupKey: string; value: Record<string, unknown> }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const save = useApiMutation(() => api.put(`/admin/settings/${groupKey}`, { value: draft }), { invalidate: [adminKeys.settings()], success: `${GROUPS[groupKey].title} saved`, silentError: true });
  const meta = GROUPS[groupKey];
  const entries = Object.entries(draft);
  const bools = entries.filter(([, v]) => typeof v === 'boolean');
  const others = entries.filter(([, v]) => typeof v !== 'boolean');

  return (
    <Section
      title={meta.title}
      description={meta.description}
      actions={
        <Button size="sm" variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          <Save /> Save
        </Button>
      }
    >
      <div className="space-y-4 p-4">
        {others.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map(([k, v]) => {
              const l = LABELS[k] ?? { label: humanize(k.replace(/([A-Z])/g, '_$1')) };
              const id = `${groupKey}-${k}`;
              return (
                <Field key={k} label={l.label} htmlFor={id} hint={l.hint} className={l.multiline ? 'sm:col-span-2 lg:col-span-3' : undefined}>
                  {l.multiline ? (
                    <Textarea id={id} rows={3} value={String(v ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
                  ) : typeof v === 'number' ? (
                    <Input id={id} type="number" value={String(v)} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                  ) : (
                    <Input id={id} value={String(v ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} className={k === 'gstin' ? 'font-mono uppercase' : undefined} />
                  )}
                </Field>
              );
            })}
          </div>
        )}
        {bools.length > 0 && (
          <div className="space-y-2">
            {bools.map(([k, v]) => {
              const l = LABELS[k] ?? { label: humanize(k.replace(/([A-Z])/g, '_$1')) };
              return (
                <label key={k} className="flex items-start gap-3 text-sm">
                  <Switch className="mt-0.5" checked={v as boolean} onCheckedChange={(c) => setDraft((d) => ({ ...d, [k]: c }))} />
                  <span>
                    {l.label}
                    {l.hint && <span className="block text-xs text-muted-foreground">{l.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {save.error ? <FormError error={save.error} /> : null}
      </div>
    </Section>
  );
}
