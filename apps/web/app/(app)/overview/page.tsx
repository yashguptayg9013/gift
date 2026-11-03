'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { Bell, LayoutDashboard, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, isNotFound } from '@/lib/api/client';
import { notificationKeys, useDashboard, useNotifications } from '@/lib/api/dashboard';
import { useApiMutation } from '@/lib/api/hooks';
import type { DashboardData } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateTime, formatInteger, formatNumber, formatQty } from '@/lib/format';
import { NotificationItem } from '@/components/shell/notifications-popover';
import { AreaChartCard, BarChartCard } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { type DateRange, DateRangePicker, presetRange } from '@/components/ui/date-range';
import { EmptyState, ErrorState, LoadingRows, PageHeader, Section, Stat, StatusBadge } from '@/components/ui/feedback';

const dayFmt = (v: string) => {
  try {
    return format(parseISO(v), 'dd MMM');
  } catch {
    return v;
  }
};
const monthFmt = (v: string) => {
  try {
    return format(parseISO(`${v}-01`), 'MMM yy');
  } catch {
    return v;
  }
};

type RecentTx = DashboardData['recentTransactions'][number];

const txColumns: ColumnDef<RecentTx, unknown>[] = [
  { accessorKey: 'number', header: 'Number', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
  { accessorKey: 'type', header: 'Type', cell: ({ row }) => <StatusBadge vocabulary="InventoryTxType" value={row.original.type} /> },
  { accessorKey: 'referenceNumber', header: 'Reference', cell: ({ row }) => row.original.referenceNumber ?? <span className="text-muted-foreground">—</span> },
  { accessorKey: 'lineCount', header: 'Lines', meta: { numeric: true } },
  { accessorKey: 'postedAt', header: 'Posted', cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.postedAt)}</span> },
];

export default function OverviewPage() {
  const { me, can } = useAuth();
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const q = useDashboard(range.from, range.to);
  const d = q.data;
  const loading = q.isLoading;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Good to see you, ${me.name.split(' ')[0]}. Figures reflect posted records only.`}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {isNotFound(q.error) ? (
        <Section>
          <EmptyState icon={LayoutDashboard} title="Dashboard service is being connected" description="Executive metrics appear here once the dashboard API is available. Inventory screens already show live stock." action={<Link href="/inventory" className="text-sm text-primary hover:underline">Open inventory</Link>} />
        </Section>
      ) : q.error ? (
        <Section>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Section>
      ) : (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card shadow-xs sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 [&>*]:border-border">
            <Stat loading={loading} label="Raw material SKUs" value={formatInteger(d?.rawMaterials.skuCount)} hint={d ? `${formatInteger(d.rawMaterials.inStockSkuCount)} in stock` : undefined} href="/inventory?type=MATERIAL" />
            <Stat
              loading={loading}
              label="Low-stock materials"
              value={formatInteger(d?.rawMaterials.lowStockCount)}
              tone={d && d.rawMaterials.lowStockCount > 0 ? 'warning' : undefined}
              hint="At or below reorder level"
              href="/inventory?lowStockOnly=1"
            />
            <Stat loading={loading} label="Finished goods units" value={formatInteger(d?.finishedGoods.units)} hint={d ? `${formatInteger(d.finishedGoods.skuCount)} SKUs · ${formatInteger(d.finishedGoods.reserved)} reserved` : undefined} href="/inventory?type=PRODUCT" />
            <Stat loading={loading} label="Active production" value={formatInteger(d?.production.active)} hint={d ? `${formatInteger(d.production.pending)} pending · ${formatInteger(d.production.delayed)} delayed` : undefined} tone={d && d.production.delayed > 0 ? 'danger' : undefined} href="/production" />
            <Stat loading={loading} label="Pending sales orders" value={formatInteger(d?.sales.pendingOrders)} hint={d ? `${formatInteger(d.sales.ordersInRange)} received in period` : undefined} href="/sales" />
            <Stat loading={loading} label="Open purchase orders" value={formatInteger(d?.procurement.openOrders)} hint={d ? `${formatInteger(d.procurement.overdueOrders)} overdue · ${formatInteger(d.procurement.pendingApproval)} awaiting approval` : undefined} tone={d && d.procurement.overdueOrders > 0 ? 'warning' : undefined} href="/procurement" />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section title="Production performance" description="Good units completed vs rejected per day">
              <div className="p-3">{loading ? <LoadingRows rows={5} /> : <BarChartCard data={d?.productionPerformance ?? []} xKey="date" xFormatter={dayFmt} series={[{ key: 'completed', label: 'Completed', color: 1 }, { key: 'rejected', label: 'Rejected', color: 4 }]} emptyTitle="No production output in this period" />}</div>
            </Section>
            <Section title="Inventory movement" description="Ledger lines posted per day by source">
              <div className="p-3">
                {loading ? (
                  <LoadingRows rows={5} />
                ) : (
                  <AreaChartCard
                    data={d?.inventoryMovement ?? []}
                    xKey="date"
                    xFormatter={dayFmt}
                    series={[
                      { key: 'receipts', label: 'Receipts', color: 6 },
                      { key: 'issues', label: 'Issues', color: 3 },
                      { key: 'production', label: 'Production', color: 1 },
                      { key: 'sales', label: 'Sales', color: 2 },
                    ]}
                    emptyTitle="No stock movements in this period"
                  />
                )}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Section title="Monthly business activity" description="Documents created per month" className="xl:col-span-2">
              <div className="p-3">
                {loading ? (
                  <LoadingRows rows={5} />
                ) : (
                  <BarChartCard
                    data={d?.monthlyActivity ?? []}
                    xKey="month"
                    xFormatter={monthFmt}
                    series={[
                      { key: 'productionOrders', label: 'Production orders', color: 1 },
                      { key: 'salesOrders', label: 'Sales orders', color: 2 },
                      { key: 'purchaseOrders', label: 'Purchase orders', color: 3 },
                      { key: 'inventoryTransactions', label: 'Stock transactions', color: 5 },
                    ]}
                  />
                )}
              </div>
            </Section>
            <Section title="Raw material stock by category" description={d?.rawMaterials.valueEstimate != null && d.rawMaterials.valuedSkuCount > 0 ?`Estimated value ${formatCurrency(d.rawMaterials.valueEstimate)} (${formatInteger(d.rawMaterials.valuedSkuCount)} priced SKUs)` : 'On-hand quantity per unit'}>
              {loading ? (
                <LoadingRows rows={5} />
              ) : !d?.rawMaterials.byCategory.length ? (
                <EmptyState compact icon={PackageCheck} title="No material stock yet" />
              ) : (
                <ul className="divide-y">
                  {d.rawMaterials.byCategory.map((c) => (
                    <li key={c.categoryId ?? c.name} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{formatInteger(c.skuCount)} SKUs</span>
                      </span>
                      <span className="tabular text-right text-sm">{c.quantities.length ? c.quantities.map((qq) => <span key={qq.uom} className="block">{formatQty(qq.onHand, qq.uom)}</span>) : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Section title="Recent transactions" className="xl:col-span-2" bodyClassName="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
              <DataTable columns={txColumns} data={d?.recentTransactions} loading={loading} pageSize={0} dense onRowClick={can('inventory.view') ? (r) => router.push(`/inventory/transactions/${r.id}`) : undefined} empty={<EmptyState compact title="No transactions in this period" />} />
            </Section>
            <div className="space-y-5">
              <Section title="Low stock" actions={<Link href="/inventory?lowStockOnly=1" className="text-xs text-primary hover:underline">View all</Link>}>
                {loading ? (
                  <LoadingRows rows={4} />
                ) : !d?.lowStock.length ? (
                  <EmptyState compact icon={PackageCheck} title="No materials below reorder level" />
                ) : (
                  <ul className="divide-y">
                    {d.lowStock.slice(0, 8).map((m) => (
                      <li key={m.id}>
                        <Link href={`/inventory/materials/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-subtle">
                          <span className="min-w-0">
                            <span className="block truncate">{m.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                          </span>
                          <span className="tabular text-right">
                            <span className={m.available <= 0 ? 'text-danger' : 'text-warning'}>{formatQty(m.available, m.uom)}</span>
                            <span className="block text-xs text-muted-foreground">reorder at {formatNumber(m.reorderLevel)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <NotificationsPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NotificationsPanel() {
  const list = useNotifications({ pageSize: 6 });
  const markRead = useApiMutation((id: string) => api.post(`/notifications/${id}/read`), { invalidate: [notificationKeys.all] });
  return (
    <Section title="Notifications">
      {isNotFound(list.error) ? (
        <EmptyState compact icon={Bell} title="Notifications not available yet" />
      ) : list.isLoading ? (
        <LoadingRows rows={3} />
      ) : !list.data?.data.length ? (
        <EmptyState compact icon={Bell} title="No notifications" />
      ) : (
        <div className="p-1">
          {list.data.data.map((n) => (
            <NotificationItem key={n.id} n={n} compact onRead={(id) => markRead.mutate(id)} />
          ))}
        </div>
      )}
    </Section>
  );
}
