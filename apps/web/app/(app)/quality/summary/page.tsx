'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQualitySummary, type QualitySummary } from '@/lib/api/quality';
import { formatNumber } from '@/lib/format';
import { BarChartCard } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { DateRangePicker, presetRange, type DateRange } from '@/components/ui/date-range';
import { PageHeader, Section, Stat, StatusBadge } from '@/components/ui/feedback';

type Row = QualitySummary['byItem'][number];

export default function QualitySummaryPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const q = useQualitySummary({ from: range.from.toISOString(), to: range.to.toISOString() });
  const totals = (q.data?.byItem ?? []).reduce((s, r) => ({ inspected: s.inspected + r.inspected, accepted: s.accepted + r.accepted, rejected: s.rejected + r.rejected, inspections: s.inspections + r.inspections }), { inspected: 0, accepted: 0, rejected: 0, inspections: 0 });

  // Pareto: defects sorted desc with cumulative share
  const pareto = useMemo(() => {
    const rows = (q.data?.byDefect ?? []).filter((d) => d.quantity > 0);
    const total = rows.reduce((s, d) => s + d.quantity, 0);
    return rows.map((d, i) => {
      const cum = rows.slice(0, i + 1).reduce((s, x) => s + x.quantity, 0);
      return { name: d.defectCategory?.name ?? 'Unknown', quantity: d.quantity, cumulative: total ? Math.round((cum / total) * 1000) / 10 : 0 };
    });
  }, [q.data]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: 'item', header: 'Item', accessorFn: (r) => `${r.item?.code ?? ''} ${r.item?.name ?? ''}`, cell: ({ row }) => <span><span className="font-mono text-xs text-muted-foreground">{row.original.item?.code}</span> {row.original.item?.name}</span> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <StatusBadge vocabulary="InspectionType" value={row.original.type} /> },
      { accessorKey: 'inspections', header: 'Inspections', meta: { numeric: true } },
      { accessorKey: 'inspected', header: 'Inspected', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.inspected) },
      { accessorKey: 'accepted', header: 'Accepted', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.accepted) },
      { accessorKey: 'rejected', header: 'Rejected', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.rejected) },
      { accessorKey: 'rework', header: 'Rework', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.rework) },
      { accessorKey: 'rejectionRate', header: 'Rejection rate', meta: { numeric: true }, cell: ({ row }) => (row.original.rejectionRate === null ? '—' : <span className={row.original.rejectionRate > 0.05 ? 'font-medium text-danger' : ''}>{(row.original.rejectionRate * 100).toFixed(1)}%</span>) },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Quality summary" description="Completed inspections in the period, by item and by defect." actions={<DateRangePicker value={range} onChange={setRange} />} />
      <Section className="mb-5">
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Inspections" value={formatNumber(totals.inspections)} loading={!q.data} />
          <Stat label="Units inspected" value={formatNumber(totals.inspected)} loading={!q.data} />
          <Stat label="Units rejected" value={formatNumber(totals.rejected)} tone={totals.rejected ? 'danger' : undefined} loading={!q.data} />
          <Stat label="Rejection rate" value={totals.inspected ? `${((totals.rejected / totals.inspected) * 100).toFixed(1)}%` : '—'} loading={!q.data} />
        </div>
      </Section>
      <Section className="mb-5" title="Defects (Pareto)" description="Defect quantities, largest first">
        <div className="p-3">
          <BarChartCard data={pareto} xKey="name" series={[{ key: 'quantity', label: 'Units', color: 4 }]} emptyTitle="No defects recorded in this period" />
        </div>
      </Section>
      <DataTable columns={columns} data={q.data?.byItem} loading={q.isFetching} error={q.error} onRetry={() => q.refetch()} searchable exportName="quality-summary" initialSorting={[{ id: 'rejected', desc: true }]} />
    </>
  );
}
