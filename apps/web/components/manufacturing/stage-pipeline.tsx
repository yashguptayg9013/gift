'use client';

import { Check, ClipboardCheck, MoreHorizontal, Pause, Play, PlusCircle, SkipForward, Users } from 'lucide-react';
import { useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { prodKeys, productionApi, useWorkstations, type OrderDetail, type OrderStage } from '@/lib/api/manufacturing';
import { loadWorkerOptions } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { Badge, FormError, StatusBadge } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlays';
import { ReasonDialog } from './dialogs';
import { OutputDialog, type OutputTarget } from './output-dialog';
import { ProgressBar } from './progress-bar';

const ACTIVE_ORDER = ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'];
const OPEN_STAGE = ['PENDING', 'IN_PROGRESS', 'PAUSED'];

/** Input available to a stage: good output of the previous non-skipped stage, or planned qty for the first. */
export function stageInput(order: OrderDetail, stage: OrderStage) {
  const prev = order.stages.filter((s) => s.sequence < stage.sequence && s.status !== 'SKIPPED' && s.status !== 'CANCELLED').pop();
  return prev ? prev.qtyGood : order.quantityPlanned;
}

function isLast(order: OrderDetail, stage: OrderStage) {
  return !order.stages.some((s) => s.sequence > stage.sequence && s.status !== 'SKIPPED' && s.status !== 'CANCELLED');
}

export function StagePipeline({ order }: { order: OrderDetail }) {
  const { can, me } = useAuth();
  const [output, setOutput] = useState<OutputTarget | null>(null);
  const [skip, setSkip] = useState<OrderStage | null>(null);
  const [assign, setAssign] = useState<OrderStage | null>(null);
  const invalidate = [prodKeys.all, inventoryKeys.all];
  const act = useApiMutation(({ stageId, action, body }: { stageId: string; action: 'start' | 'pause' | 'complete' | 'skip'; body?: object }) => productionApi.stage(stageId, action, body), {
    invalidate,
    success: 'Stage updated',
    onSuccess: () => setSkip(null),
  });
  const active = ACTIVE_ORDER.includes(order.status);

  if (!order.stages.length) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Stages are created from the SKU&apos;s route when the order is released.</p>;
  }

  return (
    <>
      <ol className="divide-y">
        {order.stages.map((s, idx) => {
          const input = stageInput(order, s);
          const processed = s.qtyGood + s.qtyRejected;
          const remaining = Math.max(0, input - processed);
          const mine = !!me.workerId && s.assignments.some((a) => a.workerId === me.workerId);
          const canAct = active && (can('production.stage.update.any') || (can('production.stage.update.own') && mine));
          const open = OPEN_STAGE.includes(s.status);
          const target = Math.max(order.quantityPlanned, 1);
          return (
            <li key={s.id} className={cn('flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center', s.status === 'IN_PROGRESS' && 'bg-warning/5')}>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    s.status === 'COMPLETED' && 'border-success bg-success text-white',
                    s.status === 'IN_PROGRESS' && 'border-warning text-warning',
                    s.status === 'PAUSED' && 'border-accent text-accent',
                    (s.status === 'SKIPPED' || s.status === 'CANCELLED') && 'border-dashed text-muted-foreground',
                  )}
                >
                  {s.status === 'COMPLETED' ? <Check className="size-3.5" /> : idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.stageDefinition.name}</span>
                    {s.isQcStage && (
                      <Badge tone="info">
                        <ClipboardCheck className="size-3" /> QC
                      </Badge>
                    )}
                    <StatusBadge vocabulary="StageStatus" value={s.status} />
                    {mine && <Badge tone="accent">Assigned to you</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      Good <span className="tabular font-medium text-foreground">{formatNumber(s.qtyGood)}</span>
                    </span>
                    {s.qtyRejected > 0 && (
                      <span>
                        Rejected <span className="tabular font-medium text-danger">{formatNumber(s.qtyRejected)}</span>
                      </span>
                    )}
                    {s.qtyRework > 0 && (
                      <span>
                        Rework <span className="tabular font-medium text-warning">{formatNumber(s.qtyRework)}</span>
                      </span>
                    )}
                    {open && (
                      <span>
                        Available to process <span className="tabular font-medium text-foreground">{formatNumber(remaining)}</span>
                      </span>
                    )}
                    {s.workstation && <span>@ {s.workstation.name}</span>}
                    {s.startedAt && <span>Started {formatDateTime(s.startedAt)}</span>}
                    {s.completedAt && <span>Done {formatDateTime(s.completedAt)}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <Users className="size-3.5 text-muted-foreground" aria-hidden />
                    {s.assignments.length ? s.assignments.map((a) => <Badge key={a.id}>{a.worker.name}</Badge>) : <span className="text-muted-foreground">No workers assigned</span>}
                  </div>
                  {s.instructions && <p className="mt-1 text-xs text-muted-foreground">{s.instructions}</p>}
                  <ProgressBar className="mt-2 max-w-sm" value={s.qtyGood / target} tone={s.status === 'COMPLETED' ? 'success' : 'primary'} label={`${s.stageDefinition.name} progress`} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                {canAct && (s.status === 'PENDING' || s.status === 'PAUSED') && (
                  <Button size="sm" onClick={() => act.mutate({ stageId: s.id, action: 'start' })} loading={act.isPending && act.variables?.stageId === s.id && act.variables.action === 'start'}>
                    <Play /> {s.status === 'PAUSED' ? 'Resume' : 'Start'}
                  </Button>
                )}
                {canAct && s.status === 'IN_PROGRESS' && (
                  <Button size="sm" onClick={() => act.mutate({ stageId: s.id, action: 'pause' })}>
                    <Pause /> Pause
                  </Button>
                )}
                {canAct && (s.status === 'PENDING' || s.status === 'IN_PROGRESS') && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={remaining <= 0 && s.qtyGood + s.qtyRejected > 0 && !s.isQcStage}
                    onClick={() =>
                      setOutput({
                        stageId: s.id,
                        stageName: s.stageDefinition.name,
                        isQcStage: s.isQcStage,
                        itemId: order.itemId,
                        orderNumber: order.number,
                        remaining,
                        assignedWorkers: s.assignments.map((a) => ({ id: a.worker.id, name: a.worker.name })),
                      })
                    }
                  >
                    <PlusCircle /> Record output
                  </Button>
                )}
                {(canAct || (active && can('production.assign'))) && open && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${s.stageDefinition.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {canAct && (
                        <DropdownMenuItem onSelect={() => act.mutate({ stageId: s.id, action: 'complete' })}>
                          <Check /> Complete stage
                        </DropdownMenuItem>
                      )}
                      {can('production.assign') && (
                        <DropdownMenuItem onSelect={() => setAssign(s)}>
                          <Users /> Assign workers / workstation
                        </DropdownMenuItem>
                      )}
                      {can('production.stage.update.any') && s.status === 'PENDING' && processed === 0 && !isLast(order, s) && (
                        <DropdownMenuItem destructive onSelect={() => setSkip(s)}>
                          <SkipForward /> Skip stage
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {act.error && !skip ? (
        <div className="border-t px-4 py-2">
          <FormError error={act.error} />
        </div>
      ) : null}
      {output && <OutputDialog target={output} open onOpenChange={(o) => !o && setOutput(null)} />}
      {skip && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setSkip(null)}
          title={`Skip ${skip.stageDefinition.name}?`}
          description="Materials consumed at this stage will not be backflushed. Use only when the product does not need this operation."
          confirmLabel="Skip stage"
          destructive
          loading={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ stageId: skip.id, action: 'skip', body: { reason } })}
        />
      )}
      {assign && <AssignDialog stage={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

function AssignDialog({ stage, onClose }: { stage: OrderStage; onClose: () => void }) {
  const [workers, setWorkers] = useState(stage.assignments.map((a) => ({ id: a.worker.id, name: a.worker.name })));
  const [picker, setPicker] = useState<string | null>(null);
  const [workstationId, setWorkstationId] = useState(stage.workstationId ?? '');
  const ws = useWorkstations();
  const save = useApiMutation(
    async () => {
      await productionApi.workers(stage.id, workers.map((w) => w.id));
      if ((stage.workstationId ?? '') !== workstationId) await productionApi.workstation(stage.id, workstationId || null);
    },
    { invalidate: [prodKeys.all], success: 'Assignments saved', silentError: true, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Assign — ${stage.stageDefinition.name}`}
        description="Assigned workers can update this stage from the shop-floor view."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Add worker" htmlFor="assign-worker">
            <AsyncCombobox
              id="assign-worker"
              value={picker}
              queryKey={['worker-options']}
              load={loadWorkerOptions}
              placeholder="Search workers…"
              onChange={(v, opt) => {
                setPicker(null);
                if (v && opt && !workers.some((w) => w.id === v)) setWorkers((ws2) => [...ws2, { id: v, name: opt.label }]);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {workers.length === 0 && <span className="text-sm text-muted-foreground">Nobody assigned.</span>}
            {workers.map((w) => (
              <button key={w.id} type="button" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-muted" onClick={() => setWorkers((xs) => xs.filter((x) => x.id !== w.id))} aria-label={`Remove ${w.name}`}>
                {w.name} <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <Field label="Workstation" htmlFor="assign-ws">
            <NativeSelect id="assign-ws" value={workstationId} onChange={(e) => setWorkstationId(e.target.value)}>
              <option value="">None</option>
              {(ws.data ?? [])
                .filter((w) => w.isActive)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <FormError error={save.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
