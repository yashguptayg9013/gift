'use client';

import { cn } from '@/lib/utils';

type Json = unknown;

function flatten(value: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = String(value);
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length && prefix) out[prefix] = '[]';
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, Json>);
    if (!entries.length && prefix) out[prefix] = '{}';
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix || '(value)'] = typeof value === 'string' ? value : JSON.stringify(value);
  return out;
}

/** Field-level before/after comparison for audit entries. */
export function JsonDiff({ before, after }: { before: Json; after: Json }) {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changed = keys.filter((k) => a[k] !== b[k]);
  if (!keys.length) return <p className="text-sm text-muted-foreground">No data recorded.</p>;
  const rows = before === undefined || before === null ? keys : changed;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No field changes.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-subtle text-muted-foreground">
          <tr className="border-b">
            <th className="px-2 py-1.5 text-left font-medium">Field</th>
            <th className="px-2 py-1.5 text-left font-medium">Before</th>
            <th className="px-2 py-1.5 text-left font-medium">After</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((k) => (
            <tr key={k} className="border-b align-top last:border-b-0">
              <td className="px-2 py-1 text-muted-foreground">{k}</td>
              <td className={cn('px-2 py-1 break-all', a[k] !== undefined && a[k] !== b[k] && 'bg-danger/5 text-danger')}>{a[k] ?? '—'}</td>
              <td className={cn('px-2 py-1 break-all', b[k] !== undefined && a[k] !== b[k] && 'bg-success/5 text-success')}>{b[k] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
