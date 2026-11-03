'use client';

import { ATTENDANCE_STATUS } from '@puja/shared';
import { format } from 'date-fns';
import { CheckCheck, Save } from 'lucide-react';
import { useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { useDaySheet, workforceApi, workforceKeys, type AttendanceStatus, type DaySheetRow } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, FormError, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, NativeSelect } from '@/components/ui/input';

interface Entry {
  status: AttendanceStatus | '';
  checkIn: string;
  checkOut: string;
  remarks: string;
}

const time = (iso: string | null) => (iso ? format(new Date(iso), 'HH:mm') : '');

export default function AttendancePage() {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const q = useDaySheet(date);
  return (
    <>
      <PageHeader title="Attendance" description="Daily attendance sheet for active workers. Days present feed productivity reports." />
      <div className="mb-4 flex items-end gap-3">
        <Field label="Date" htmlFor="att-date" className="w-48">
          <Input id="att-date" type="date" max={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <LoadingRows rows={8} /> : q.data.length === 0 ? <EmptyState title="No active workers" description="Add workers in the Workers tab first." /> : <Sheet key={date} date={date} rows={q.data} />}
    </>
  );
}

function Sheet({ date, rows }: { date: string; rows: DaySheetRow[] }) {
  const { can } = useAuth();
  const editable = can('workforce.attendance');
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(rows.map((r) => [r.worker.id, { status: r.attendance?.status ?? '', checkIn: time(r.attendance?.checkIn ?? null), checkOut: time(r.attendance?.checkOut ?? null), remarks: r.attendance?.remarks ?? '' }])),
  );
  const set = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const toIso = (hhmm: string) => (hhmm ? new Date(`${date}T${hhmm}:00`).toISOString() : undefined);
  const save = useApiMutation(
    () =>
      workforceApi.attendance(
        date,
        Object.entries(entries)
          .filter(([, e]) => e.status)
          .map(([workerId, e]) => ({ workerId, status: e.status, checkIn: toIso(e.checkIn), checkOut: toIso(e.checkOut), remarks: e.remarks || undefined })),
      ),
    { invalidate: [workforceKeys.all], success: 'Attendance saved', silentError: true },
  );
  const recorded = Object.values(entries).filter((e) => e.status).length;

  return (
    <Section
      title={`${recorded} of ${rows.length} recorded`}
      actions={
        editable && (
          <>
            <Button size="sm" onClick={() => setEntries((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.status ? v : { ...v, status: 'PRESENT' as AttendanceStatus }])))}>
              <CheckCheck /> Mark rest present
            </Button>
            <Button size="sm" variant="primary" loading={save.isPending} disabled={!recorded} onClick={() => save.mutate(undefined)}>
              <Save /> Save
            </Button>
          </>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Worker</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Check-in</th>
              <th className="px-4 py-2 font-medium">Check-out</th>
              <th className="px-4 py-2 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const e = entries[r.worker.id];
              return (
                <tr key={r.worker.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.worker.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.worker.code}
                      {r.worker.department && ` · ${r.worker.department}`}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <NativeSelect aria-label={`Status for ${r.worker.name}`} className="w-36" value={e.status} onChange={(ev) => set(r.worker.id, { status: ev.target.value as AttendanceStatus })}>
                        <option value="">Not recorded</option>
                        {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : e.status ? (
                      <StatusBadge vocabulary="AttendanceStatus" value={e.status} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Input aria-label={`Check-in for ${r.worker.name}`} type="time" className="w-28" disabled={!editable || !['PRESENT', 'HALF_DAY'].includes(e.status)} value={e.checkIn} onChange={(ev) => set(r.worker.id, { checkIn: ev.target.value })} />
                  </td>
                  <td className="px-4 py-2">
                    <Input aria-label={`Check-out for ${r.worker.name}`} type="time" className="w-28" disabled={!editable || !['PRESENT', 'HALF_DAY'].includes(e.status)} value={e.checkOut} onChange={(ev) => set(r.worker.id, { checkOut: ev.target.value })} />
                  </td>
                  <td className="px-4 py-2">
                    <Input aria-label={`Remarks for ${r.worker.name}`} disabled={!editable} value={e.remarks} onChange={(ev) => set(r.worker.id, { remarks: ev.target.value })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3">
        <FormError error={save.error} />
      </div>
    </Section>
  );
}
