'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { adminKeys, useSequences } from '@/lib/api/admin';
import { useApiMutation } from '@/lib/api/hooks';
import type { Sequence } from '@/lib/api/types';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows, PageHeader, Section } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';

function preview(s: { prefix: string; padding: number; resetYearly: boolean; periodKey: string | null; nextValue: number }) {
  const n = String(s.nextValue).padStart(s.padding, '0');
  return s.resetYearly ? `${s.prefix}/${s.periodKey ?? 'YY-YY'}/${n}` : `${s.prefix}-${n}`;
}

export default function NumberingPage() {
  const q = useSequences();
  return (
    <>
      <PageHeader title="Document numbering" description="Series reset each Indian financial year (April). Numbers are allocated inside the same database transaction as the document, so they never skip on failure." />
      <Section>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <LoadingRows />
        ) : !q.data.length ? (
          <EmptyState compact title="No series yet" description="A series appears after its first document is created." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="h-8 px-4 text-left font-medium">Document</th>
                  <th className="px-3 text-left font-medium">Prefix</th>
                  <th className="px-3 text-left font-medium">Digits</th>
                  <th className="px-3 text-left font-medium">Next number</th>
                  <th className="px-3" />
                </tr>
              </thead>
              <tbody>
                {q.data.map((s) => (
                  <SequenceRow key={s.key} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function SequenceRow({ s }: { s: Sequence }) {
  const [prefix, setPrefix] = useState(s.prefix);
  const [padding, setPadding] = useState(String(s.padding));
  const dirty = prefix !== s.prefix || Number(padding) !== s.padding;
  const valid = /^[A-Za-z0-9-]{1,8}$/.test(prefix) && Number(padding) >= 3 && Number(padding) <= 10;
  const save = useApiMutation(() => api.patch(`/admin/sequences/${s.key}`, { prefix, padding: Number(padding) }), { invalidate: [adminKeys.sequences()], success: 'Series updated' });
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-2">{humanize(s.key)}</td>
      <td className="px-3">
        <Input aria-label={`Prefix for ${s.key}`} className="h-7 w-24 font-mono uppercase" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} />
      </td>
      <td className="px-3">
        <Input aria-label={`Digits for ${s.key}`} type="number" min={3} max={10} className="h-7 w-20" value={padding} onChange={(e) => setPadding(e.target.value)} />
      </td>
      <td className="px-3 font-mono text-xs text-muted-foreground">{preview({ ...s, prefix, padding: Number(padding) || s.padding })}</td>
      <td className="px-3 text-right">
        <Button size="sm" variant="ghost" disabled={!dirty || !valid} loading={save.isPending} onClick={() => save.mutate(undefined)} aria-label={`Save ${s.key}`}>
          <Save />
        </Button>
      </td>
    </tr>
  );
}
