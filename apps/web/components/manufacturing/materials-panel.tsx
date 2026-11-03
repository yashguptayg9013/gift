'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { prodKeys, productionApi, useAvailability, type Availability, type OrderDetail, type OrderMaterial } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatNumber, formatQty } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, ErrorState, FormError, LoadingRows } from '@/components/ui/feedback';
import { Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Sheet, SheetContent } from '@/components/ui/overlays';
import { QtyReasonDialog } from './dialogs';

type MatAction = { kind: 'issue-material' | 'wastage' | 'return-material'; line: OrderMaterial };

const ACTIVE = ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'];

export function MaterialsPanel({ order }: { order: OrderDetail }) {
  const { can } = useAuth();
  const [action, setAction] = useState<MatAction | null>(null);
  const [substitute, setSubstitute] = useState<OrderMaterial | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const stageName = (id: string | null) => order.stages.find((s) => s.stageDefinitionId === id)?.stageDefinition.name ?? '—';
  const active = ACTIVE.includes(order.status);

  const mat = useApiMutation(({ kind, line, quantity, reason }: { kind: MatAction['kind']; line: OrderMaterial; quantity: number; reason: string }) => productionApi.material(order.id, kind, { materialLineId: line.id, quantity, reason: reason || undefined }, key), {
    invalidate: [prodKeys.all, inventoryKeys.all],
    success: 'Material updated',
    silentError: true,
    onSuccess: () => {
      setAction(null);
      setKey(newIdempotencyKey());
    },
  });

  const columns = useMemo<ColumnDef<OrderMaterial, unknown>[]>(
    () => [
      {
        id: 'item',
        header: 'Material',
        accessorFn: (r) => `${r.item.code} ${r.item.name}`,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/inventory/materials/${row.original.item.id}`} className="font-mono text-xs hover:underline">
              {row.original.item.code}
            </Link>
            <div className="line-clamp-1">{row.original.item.name}</div>
            {row.original.originalItemId && <Badge tone="accent">Substituted</Badge>}
          </div>
        ),
      },
      { id: 'stage', header: 'Consumed at', accessorFn: (r) => stageName(r.stageDefinitionId), cell: ({ row }) => <span className="text-sm">{stageName(row.original.stageDefinitionId)} <span className="text-xs text-muted-foreground">{row.original.consumptionMode === 'MANUAL' ? '· manual' : '· backflush'}</span></span> },
      { accessorKey: 'qtyPerUnit', header: 'Per unit', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.qtyPerUnit) },
      { accessorKey: 'requiredQty', header: 'Required', meta: { numeric: true }, cell: ({ row }) => <span title={`Includes ${row.original.wastagePercent}% wastage allowance`}>{formatQty(row.original.requiredQty, row.original.uomCode)}</span> },
      { accessorKey: 'reservedQty', header: 'Reserved', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.reservedQty) },
      { accessorKey: 'consumedQty', header: 'Consumed', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.consumedQty) },
      { accessorKey: 'wastageQty', header: 'Wastage', meta: { numeric: true }, cell: ({ row }) => (row.original.wastageQty > 0 ? <span className="text-warning">{formatNumber(row.original.wastageQty)}</span> : '0') },
      { accessorKey: 'returnedQty', header: 'Returned', meta: { numeric: true }, cell: ({ row }) => formatNumber(row.original.returnedQty) },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          const canIssue = active && can('production.material.issue');
          const canWaste = active && can(['production.material.issue', 'production.stage.update.any'], 'any');
          const canReturn = order.status !== 'DRAFT' && can('production.material.issue') && l.consumedQty > 0;
          const canSub = active && can('production.release') && l.consumedQty === 0 && !!l.bomLineId;
          if (!canIssue && !canWaste && !canReturn && !canSub) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${l.item.code}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {canIssue && <DropdownMenuItem onSelect={() => setAction({ kind: 'issue-material', line: l })}>Issue material</DropdownMenuItem>}
                {canWaste && <DropdownMenuItem onSelect={() => setAction({ kind: 'wastage', line: l })}>Report wastage</DropdownMenuItem>}
                {canReturn && <DropdownMenuItem onSelect={() => setAction({ kind: 'return-material', line: l })}>Return unused</DropdownMenuItem>}
                {canSub && (
                  <DropdownMenuItem onSelect={() => setSubstitute(l)}>
                    <ArrowLeftRight /> Substitute alternative
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, active],
  );

  const meta: Record<MatAction['kind'], { title: string; description: string; reasonRequired: boolean; confirm: string }> = {
    'issue-material': { title: 'Issue material', description: 'Consumes stock for this order (reserved stock first).', reasonRequired: false, confirm: 'Issue' },
    wastage: { title: 'Report wastage', description: 'Consumes extra material beyond standard use and records it as wastage.', reasonRequired: true, confirm: 'Report' },
    'return-material': { title: 'Return unused material', description: 'Returns physically unused material to the store.', reasonRequired: false, confirm: 'Return' },
  };

  return (
    <>
      <DataTable columns={columns} data={order.materials} pageSize={0} exportName={`${order.number}-materials`} empty={<p className="py-8 text-center text-sm text-muted-foreground">Material requirements are created when the order is released.</p>} />
      {action && (
        <QtyReasonDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={`${meta[action.kind].title} — ${action.line.item.code}`}
          description={meta[action.kind].description}
          uom={action.line.uomCode}
          max={action.kind === 'return-material' ? action.line.consumedQty : undefined}
          reasonRequired={meta[action.kind].reasonRequired}
          confirmLabel={meta[action.kind].confirm}
          loading={mat.isPending}
          error={mat.error}
          onConfirm={(quantity, reason) => mat.mutate({ kind: action.kind, line: action.line, quantity, reason })}
        />
      )}
      {substitute && <SubstituteDialog order={order} line={substitute} onClose={() => setSubstitute(null)} />}
    </>
  );
}

function SubstituteDialog({ order, line, onClose }: { order: OrderDetail; line: OrderMaterial; onClose: () => void }) {
  const q = useAvailability(order.id);
  const alts = q.data?.lines.find((l) => l.id === line.id)?.alternatives ?? [];
  const sub = useApiMutation((materialId: string) => productionApi.substitute(order.id, line.id, materialId), { invalidate: [prodKeys.all, inventoryKeys.all], success: 'Material substituted', silentError: true, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Substitute ${line.item.code}`} description="Replaces this requirement with a BOM alternative. Any reservation for the original material is released.">
        {q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data ? (
          <LoadingRows rows={3} />
        ) : alts.length === 0 ? (
          <p className="text-sm text-muted-foreground">This BOM line has no configured alternatives.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {alts.map((a) => {
              const need = (line.requiredQty - line.consumedQty) * a.conversionFactor;
              return (
                <li key={a.materialId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <div>
                      <span className="font-mono text-xs">{a.material.code}</span> {a.material.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Factor ×{a.conversionFactor} · needs {formatNumber(need)} · available {formatNumber(a.available)}
                    </div>
                  </div>
                  <Button size="sm" loading={sub.isPending && sub.variables === a.materialId} onClick={() => sub.mutate(a.materialId)}>
                    Use
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <FormError error={sub.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const AVAIL_TONE: Record<Availability['lines'][number]['status'], 'success' | 'info' | 'warning' | 'danger'> = { COVERED: 'success', AVAILABLE: 'info', PARTIAL: 'warning', SHORT: 'danger' };
const AVAIL_LABEL: Record<Availability['lines'][number]['status'], string> = { COVERED: 'Covered', AVAILABLE: 'Available', PARTIAL: 'Partial', SHORT: 'Short' };

/** Material availability check (required vs reserved vs free stock, with alternatives). */
export function AvailabilitySheet({ orderId, open, onOpenChange, onReserve, canReserve, reserving }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onReserve: () => void; canReserve: boolean; reserving: boolean }) {
  const q = useAvailability(orderId, open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        title="Material availability"
        description={q.data ? (q.data.allCovered ? 'All requirements are reserved or consumed.' : q.data.canReserveAll ? 'Enough free stock exists to reserve every requirement.' : 'Some materials are short — reservation will be partial.') : undefined}
        footer={
          canReserve && q.data && !q.data.allCovered ? (
            <Button variant="primary" loading={reserving} onClick={onReserve}>
              Reserve materials
            </Button>
          ) : undefined
        }
      >
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <LoadingRows rows={6} />
        ) : (
          <div className="space-y-2">
            {q.data.lines.map((l) => (
              <div key={l.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-mono text-xs">{l.item.code}</span> {l.item.name}
                  </div>
                  <Badge tone={AVAIL_TONE[l.status]}>{AVAIL_LABEL[l.status]}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                  {[
                    ['Required', l.requiredQty],
                    ['Consumed', l.consumedQty],
                    ['Reserved', l.reservedQty],
                    ['To reserve', l.toReserve],
                    ['Free stock', l.freeAvailable],
                    ['Shortage', l.shortage],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className={`tabular font-medium ${k === 'Shortage' && Number(v) > 0 ? 'text-danger' : ''}`}>{formatNumber(v as number)}</dd>
                    </div>
                  ))}
                </dl>
                {l.shortage > 0 && l.alternatives.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Alternatives: {l.alternatives.map((a) => `${a.material.code} (${formatNumber(a.available)} available, ×${a.conversionFactor})`).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
