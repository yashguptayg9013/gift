'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useDepartments } from '@/lib/api/manufacturing';
import { useProductivity, type ProductivityRow } from '@/lib/api/workforce';
import { formatNumber } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { DateRangePicker, presetRange, type DateRange } from '@/components/ui/date-range';
import { PageHeader } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';

export default function ProductivityPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const [departmentId, setDept] = useState('');
  const depts = useDepartments();
  const q = useProductivity({ from: range.from.toISOString(), to: range.to.toISOString(), departmentId: departmentId || undefined });

  const columns = useMemo<ColumnDef<ProductivityRow, unknown>[]>(
    () => [
      {
        id: 'worker',
        header: 'Worker',
        accessorFn: (r) => r.worker.name,
        cell: ({ row }) => (
          <Link href={`/workforce/workers/${row.original.worker.id}`} className="hover:underline">
            <div className="font-medium">{row.original.worker.name}</div>
            <div className="text-xs text-muted-foreground">{[row.original.worker.code, row.original.worker.jobRole, row.original.worker.department].filter(Boolean).join(' · ')}</div>
          </Link>
        ),
      },
      { accessorKey: 'entries', header: 'Entries', meta: { numeric: true } },
      { accessorKey: 'orders', header: 'Orders', meta: { numeric: true } },
      { accessorKey: 'good', header: 'Good', meta: { numeric: true }, cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.good)}</span> },
      { accessorKey: 'rejected', header: 'Rejected', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.rejected) },
      { accessorKey: 'rework', header: 'Rework', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.rework) },
      {
        accessorKey: 'rejectionRate',
        header: 'Rejection rate',
        meta: { numeric: true, csv: (r: ProductivityRow) => r.rejectionRate },
        cell: ({ row }) => (row.original.rejectionRate === null ? '—' : <span className={row.original.rejectionRate > 0.05 ? 'text-danger' : ''}>{(row.original.rejectionRate * 100).toFixed(1)}%</span>),
      },
      { accessorKey: 'daysPresent', header: 'Days present', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.daysPresent) },
      { accessorKey: 'goodPerDayPresent', header: 'Good / day present', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.goodPerDayPresent) },
      {
        id: 'stages',
        header: 'By stage',
        enableSorting: false,
        accessorFn: (r) => r.byStage.map((s) => `${s.stage}: ${s.good}`).join('; '),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1 text-xs">
            {row.original.byStage.map((s) => (
              <span key={s.stage} className="rounded border px-1.5 py-0.5">
                {s.stage} <b className="tabular">{formatNumber(s.good)}</b>
                {s.rejected > 0 && <span className="text-danger"> / {formatNumber(s.rejected)}</span>}
              </span>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Productivity" description="Output per worker for the selected period." />
      <p className="mb-4 flex items-start gap-2 rounded-md border bg-subtle px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Figures are derived only from recorded, non-reversed production entries and attendance records — there are no arbitrary scores. Good units per day present divides good output by days marked present (half days count as 0.5).
      </p>
      <DataTable
        columns={columns}
        data={q.data?.rows}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        searchable
        exportName="productivity"
        initialSorting={[{ id: 'good', desc: true }]}
        empty={<p className="py-10 text-center text-sm text-muted-foreground">No production entries with a worker in this period.</p>}
        toolbar={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <NativeSelect aria-label="Department" className="h-7 w-44 text-sm" value={departmentId} onChange={(e) => setDept(e.target.value)}>
              <option value="">All departments</option>
              {(depts.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
    </>
  );
}
