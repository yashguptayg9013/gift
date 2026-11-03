'use client';

import { format, subDays } from 'date-fns';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useWorker, useWorkerDaily } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { BarChartCard } from '@/components/ui/charts';
import { Badge, DescriptionList, EmptyState, ErrorState, LoadingRows, PageHeader, Section, StatusBadge } from '@/components/ui/feedback';
import { WorkerFormDialog } from '@/components/workforce/worker-form';

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const q = useWorker(id);
  const [editing, setEditing] = useState(false);
  const [range] = useState(() => ({ from: subDays(new Date(), 29).toISOString(), to: new Date().toISOString() }));
  const daily = useWorkerDaily(id, range.from, range.to);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={10} />;
  const w = q.data;
  const totals = (daily.data ?? []).reduce((s, d) => ({ good: s.good + d.good, rejected: s.rejected + d.rejected }), { good: 0, rejected: 0 });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Workers', href: '/workforce' }, { label: w.name }]}
        title={
          <span className="flex items-center gap-2">
            {w.name} {!w.isActive && <Badge>Inactive</Badge>}
          </span>
        }
        description={[w.code, w.jobRole, w.department?.name].filter(Boolean).join(' · ')}
        actions={
          can('workforce.manage') && (
            <Button onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )
        }
      />
      <Section className="mb-5">
        <div className="p-4">
          <DescriptionList
            columns={4}
            items={[
              { label: 'Phone', value: w.phone ?? '—' },
              { label: 'Joined', value: formatDate(w.joinedOn) },
              { label: 'Sign-in account', value: w.user ? w.user.email : 'Not linked' },
              { label: 'Skills', value: w.skills.length ? w.skills.join(', ') : '—' },
            ]}
          />
          {w.notes && <p className="mt-3 text-sm text-muted-foreground">{w.notes}</p>}
        </div>
      </Section>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Output — last 30 days" description={`${formatNumber(totals.good)} good · ${formatNumber(totals.rejected)} rejected (from recorded production entries)`}>
          <div className="p-3">
            <BarChartCard
              data={(daily.data ?? []).map((d) => ({ ...d, label: format(new Date(d.date), 'dd MMM') }))}
              xKey="label"
              series={[
                { key: 'good', label: 'Good', color: 1 },
                { key: 'rejected', label: 'Rejected', color: 4 },
              ]}
              stacked
              emptyTitle="No production recorded in the last 30 days"
            />
          </div>
        </Section>
        <Section title="Open tasks">
          {w.openTasks.length === 0 ? (
            <EmptyState compact title="No open tasks" />
          ) : (
            <ul className="divide-y">
              {w.openTasks.map((t) => (
                <li key={t.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.stageDefinition.name}</span>
                    <StatusBadge vocabulary="StageStatus" value={t.status} />
                  </div>
                  <Link href={`/manufacturing/orders/${t.productionOrder.id}`} className="text-xs text-muted-foreground hover:underline">
                    {t.productionOrder.number} · {t.productionOrder.item.code} · due {formatDate(t.productionOrder.dueDate)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Recent production entries">
          {w.recentOutputs.length === 0 ? (
            <EmptyState compact title="No production recorded" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Order · stage</th>
                    <th className="px-4 py-2 text-right font-medium">Good</th>
                    <th className="px-4 py-2 text-right font-medium">Rej.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {w.recentOutputs.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDateTime(o.recordedAt)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/manufacturing/orders/${o.productionOrder.id}`} className="hover:underline">
                          {o.productionOrder.number}
                        </Link>{' '}
                        · {o.stage.stageDefinition.name}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{formatNumber(o.qtyGood)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatNumber(o.qtyRejected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title="Attendance (latest)">
          {w.attendance.length === 0 ? (
            <EmptyState compact title="No attendance recorded" />
          ) : (
            <ul className="divide-y">
              {w.attendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{formatDate(a.date)}</span>
                  <span className="flex items-center gap-2">
                    {a.hoursWorked !== null && <span className="text-xs text-muted-foreground">{formatNumber(a.hoursWorked)} h</span>}
                    <StatusBadge vocabulary="AttendanceStatus" value={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      {editing && <WorkerFormDialog worker={w} onClose={() => setEditing(false)} />}
    </>
  );
}
