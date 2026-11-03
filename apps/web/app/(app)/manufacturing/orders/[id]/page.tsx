'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCheck, ClipboardList, Lock, MoreHorizontal, PackageCheck, Rocket, Undo2, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { prodKeys, productionApi, useOrder, type OrderDetail, type OrderOutput } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, DescriptionList, ErrorState, LoadingRows, PageHeader, Section, Stat, StatusBadge } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlays';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ReasonDialog } from '@/components/manufacturing/dialogs';
import { AvailabilitySheet, MaterialsPanel } from '@/components/manufacturing/materials-panel';
import { ProgressBar } from '@/components/manufacturing/progress-bar';
import { StagePipeline } from '@/components/manufacturing/stage-pipeline';

const ACTIVE = ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useOrder(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={10} />;
  return <OrderView order={q.data} />;
}

function OrderView({ order }: { order: OrderDetail }) {
  const { can } = useAuth();
  const [availOpen, setAvailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reverse, setReverse] = useState<OrderOutput | null>(null);
  const invalidate = [prodKeys.all, inventoryKeys.all];
  const action = useApiMutation((a: 'release' | 'reserve' | 'release-reservations' | 'close') => productionApi.action(order.id, a), {
    invalidate,
    success: (r) => {
      if (r && typeof r === 'object' && 'allCovered' in r) return (r as { allCovered: boolean }).allCovered ? 'All materials reserved' : 'Reserved what was available — shortages remain';
      return 'Order updated';
    },
    onSuccess: (_r, a) => a === 'reserve' && setAvailOpen(false),
  });
  const cancel = useApiMutation((reason: string) => productionApi.cancel(order.id, reason), { invalidate, success: 'Order cancelled', silentError: true, onSuccess: () => setCancelOpen(false) });
  const rev = useApiMutation(({ outputId, reason }: { outputId: string; reason: string }) => productionApi.reverse(outputId, reason), { invalidate, success: 'Entry reversed', silentError: true, onSuccess: () => setReverse(null) });
  const [remark, setRemark] = useState('');
  const addRemark = useApiMutation((message: string) => productionApi.remark(order.id, message), { invalidate: [prodKeys.order(order.id)], success: 'Remark added', onSuccess: () => setRemark('') });

  const active = ACTIVE.includes(order.status);
  const stageName = (stageId: string | null) => order.stages.find((s) => s.id === stageId)?.stageDefinition.name;

  const outputColumns = useMemo<ColumnDef<OrderOutput, unknown>[]>(
    () => [
      { accessorKey: 'recordedAt', header: 'Recorded', cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.recordedAt)}</span> },
      { id: 'stage', header: 'Stage', accessorFn: (r) => stageName(r.stageId) ?? '' },
      { id: 'worker', header: 'Worker', accessorFn: (r) => r.worker?.name ?? '', cell: ({ row }) => row.original.worker?.name ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'qtyGood', header: 'Good', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.qtyGood) },
      { accessorKey: 'qtyRejected', header: 'Rejected', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.qtyRejected) },
      { accessorKey: 'qtyRework', header: 'Rework', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.qtyRework) },
      { accessorKey: 'recordedByName', header: 'By', cell: ({ row }) => <span className="text-muted-foreground">{row.original.recordedByName ?? '—'}</span> },
      {
        id: 'state',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.reversedAt ? (
            <Badge tone="danger">Reversed</Badge>
          ) : row.original.inspectionId ? (
            <Link href={`/quality/inspections/${row.original.inspectionId}`} className="text-xs text-primary hover:underline">
              Inspection
            </Link>
          ) : null,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          !row.original.reversedAt && can('production.reverse') && order.status !== 'CLOSED' && order.status !== 'CANCELLED' ? (
            <Button size="sm" variant="danger-ghost" onClick={() => setReverse(row.original)}>
              <Undo2 /> Reverse
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order],
  );

  const totalReserved = order.materials.reduce((s, m) => s + m.reservedQty, 0);
  const menuItems = [
    can('production.release') && active && totalReserved > 0 && (
      <DropdownMenuItem key="rr" onSelect={() => action.mutate('release-reservations')}>
        <Unlock /> Release reservations
      </DropdownMenuItem>
    ),
    can('production.release') && order.status === 'COMPLETED' && (
      <DropdownMenuItem key="close" onSelect={() => action.mutate('close')}>
        <Lock /> Close order
      </DropdownMenuItem>
    ),
    can('production.cancel') && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(order.status) && (
      <DropdownMenuItem key="cancel" destructive onSelect={() => setCancelOpen(true)}>
        <Ban /> Cancel order
      </DropdownMenuItem>
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Production orders', href: '/manufacturing' }, { label: order.number }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{order.number}</span>
            <StatusBadge vocabulary="ProductionStatus" value={order.status} />
            <StatusBadge vocabulary="Priority" value={order.priority} />
            {order.isDelayed && <Badge tone="danger">Late</Badge>}
          </span>
        }
        description={
          <span>
            <Link href={`/inventory/products/variant/${order.item.id}`} className="hover:underline">
              <span className="font-mono text-xs">{order.item.code}</span> {order.item.name}
            </Link>
          </span>
        }
        actions={
          <>
            {can('production.release') && order.status === 'DRAFT' && (
              <Button variant="primary" loading={action.isPending && action.variables === 'release'} onClick={() => action.mutate('release')}>
                <Rocket /> Release
              </Button>
            )}
            {active && (
              <Button onClick={() => setAvailOpen(true)}>
                <ClipboardList /> Check availability
              </Button>
            )}
            {can('production.release') && active && order.status !== 'MATERIALS_RESERVED' && (
              <Button variant={order.status === 'RELEASED' ? 'primary' : 'secondary'} loading={action.isPending && action.variables === 'reserve'} onClick={() => action.mutate('reserve')}>
                <PackageCheck /> Reserve materials
              </Button>
            )}
            {menuItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="More order actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>{menuItems}</DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {order.status === 'CANCELLED' && order.cancelReason && (
        <div role="status" className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm">
          Cancelled: {order.cancelReason}
        </div>
      )}

      <Section className="mb-5">
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Planned" value={formatNumber(order.quantityPlanned)} hint={order.item.uom?.code ?? 'pcs'} />
          <Stat label="Completed" value={formatNumber(order.quantityCompleted)} tone={order.quantityCompleted >= order.quantityPlanned ? 'success' : undefined} hint={<ProgressBar value={order.quantityCompleted / Math.max(order.quantityPlanned, 1)} />} />
          <Stat label="Rejected" value={formatNumber(order.quantityRejected)} tone={order.quantityRejected > 0 ? 'danger' : undefined} />
          <Stat label="Rework" value={formatNumber(order.quantityRework)} tone={order.quantityRework > 0 ? 'warning' : undefined} />
        </div>
        <div className="border-t p-4">
          <DescriptionList
            columns={4}
            items={[
              { label: 'Due date', value: formatDate(order.dueDate) },
              { label: 'Planned start', value: formatDate(order.plannedStart) },
              { label: 'Started', value: formatDateTime(order.startedAt) },
              { label: 'Completed', value: formatDateTime(order.completedAt) },
              { label: 'BOM', value: order.bomVersion ? <Link href={`/manufacturing/boms/${order.bomVersion.bom.id}`} className="hover:underline">{order.bomVersion.bom.code} v{order.bomVersion.version}</Link> : 'Frozen at release' },
              { label: 'Route', value: order.route ? `${order.route.code} · ${order.route.name}` : 'Frozen at release' },
              { label: 'Created by', value: order.createdByName ?? '—' },
              { label: 'Remarks', value: order.remarks || '—' },
            ]}
          />
        </div>
      </Section>

      <Tabs defaultValue={order.status === 'DRAFT' ? 'materials' : 'stages'}>
        <TabsList>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="materials">Materials ({order.materials.length})</TabsTrigger>
          <TabsTrigger value="outputs">Production entries ({order.outputs.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="stages">
          <Section>
            <StagePipeline order={order} />
          </Section>
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsPanel order={order} />
        </TabsContent>
        <TabsContent value="outputs">
          <DataTable columns={outputColumns} data={order.outputs} exportName={`${order.number}-entries`} empty={<p className="py-8 text-center text-sm text-muted-foreground">No production recorded yet.</p>} />
        </TabsContent>
        <TabsContent value="history">
          <Section>
            {(can('production.stage.update.any') || can('production.stage.update.own')) && (
              <form
                className="flex flex-col gap-2 border-b p-4 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (remark.trim()) addRemark.mutate(remark.trim());
                }}
              >
                <Textarea aria-label="Add a remark" rows={1} className="min-h-8" placeholder="Add a remark to the production history…" value={remark} onChange={(e) => setRemark(e.target.value)} />
                <Button type="submit" loading={addRemark.isPending} disabled={!remark.trim()}>
                  Add remark
                </Button>
              </form>
            )}
            <ol className="divide-y">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-2.5 text-sm">
                  <CheckCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{humanize(e.type)}</span>
                      {e.stageId && <span className="text-muted-foreground">· {stageName(e.stageId)}</span>}
                      {e.quantity !== null && e.quantity !== undefined && <span className="tabular text-muted-foreground">· {formatNumber(e.quantity)}</span>}
                      {e.actorType === 'AI' && <Badge tone="accent">AI</Badge>}
                    </div>
                    {e.message && <p className="text-muted-foreground">{e.message}</p>}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{formatDateTime(e.createdAt)}</div>
                    <div>{e.createdByName ?? (e.actorType === 'SYSTEM' ? 'System' : '')}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </TabsContent>
      </Tabs>

      <AvailabilitySheet orderId={order.id} open={availOpen} onOpenChange={setAvailOpen} onReserve={() => action.mutate('reserve')} canReserve={can('production.release')} reserving={action.isPending && action.variables === 'reserve'} />
      {cancelOpen && (
        <ReasonDialog
          open
          onOpenChange={setCancelOpen}
          title={`Cancel ${order.number}?`}
          description="Open reservations are released. Consumed material stays consumed — return unused material first if it is physically available."
          confirmLabel="Cancel order"
          destructive
          loading={cancel.isPending}
          error={cancel.error}
          onConfirm={(r) => cancel.mutate(r)}
        />
      )}
      {reverse && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setReverse(null)}
          title="Reverse production entry?"
          description={`Restores consumed material and reverses any finished-goods receipt for ${formatNumber(reverse.qtyGood)} good / ${formatNumber(reverse.qtyRejected)} rejected unit(s). Blocked if the next stage already used these units.`}
          confirmLabel="Reverse entry"
          destructive
          loading={rev.isPending}
          error={rev.error}
          onConfirm={(reason) => rev.mutate({ outputId: reverse.id, reason })}
        />
      )}
    </>
  );
}

