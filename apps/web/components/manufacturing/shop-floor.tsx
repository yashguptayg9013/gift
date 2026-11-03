'use client';

import { CalendarClock, ClipboardCheck, Pause, Play, PlusCircle, RefreshCw, UserX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApiMutation } from '@/lib/api/hooks';
import { prodKeys, productionApi, useOrder, useTasks, type StageTask } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { OutputDialog } from './output-dialog';
import { stageInput } from './stage-pipeline';

/**
 * Shop-floor task board: large touch-friendly cards. Workers see stages assigned
 * to them; supervisors can switch to every open stage.
 */
export function ShopFloor({ defaultAll }: { defaultAll: boolean }) {
  const { me, can } = useAuth();
  const supervisor = can('production.stage.update.any');
  const [all, setAll] = useState(defaultAll && supervisor);
  const q = useTasks({ all: all && supervisor });
  const [recording, setRecording] = useState<StageTask | null>(null);
  const [now] = useState(() => Date.now());
  const act = useApiMutation(({ id, action }: { id: string; action: 'start' | 'pause' }) => productionApi.stage(id, action), { invalidate: [prodKeys.all], success: 'Stage updated' });

  const noWorker = !me.workerId && !all;
  const tasks = q.data ?? [];

  return (
    <>
      <PageHeader
        title={all ? 'Shop floor — all open stages' : 'My tasks'}
        description={all ? 'Every pending, running or paused stage of active production orders.' : 'Production stages assigned to you. Record output as you finish work.'}
        actions={
          <>
            {supervisor && (
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Task scope">
                <Button size="sm" variant={!all ? 'subtle' : 'ghost'} aria-pressed={!all} onClick={() => setAll(false)}>
                  Mine
                </Button>
                <Button size="sm" variant={all ? 'subtle' : 'ghost'} aria-pressed={all} onClick={() => setAll(true)}>
                  All open stages
                </Button>
              </div>
            )}
            <Button size="icon" variant="ghost" aria-label="Refresh" onClick={() => q.refetch()}>
              <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />
      {noWorker ? (
        <EmptyState icon={UserX} title="Your account is not linked to a worker profile" description="Ask a supervisor to link your user account to your worker record in Workforce. Tasks assigned to that worker will then appear here." />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingRows rows={6} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={all ? 'No open stages' : 'Nothing assigned to you right now'} description={all ? 'Release a production order to create stages.' : 'New assignments appear here automatically.'} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => {
            const late = !!t.productionOrder.dueDate && new Date(t.productionOrder.dueDate).getTime() < now;
            return (
              <li key={t.id} className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs', t.status === 'IN_PROGRESS' && 'border-warning/50')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold leading-tight">{t.stageDefinition.name}</div>
                    <Link href={`/manufacturing/orders/${t.productionOrder.id}`} className="text-sm text-muted-foreground hover:underline">
                      <span className="font-mono">{t.productionOrder.number}</span> · {t.productionOrder.item.code}
                    </Link>
                    <div className="line-clamp-1 text-sm">{t.productionOrder.item.name}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge vocabulary="StageStatus" value={t.status} />
                    {t.productionOrder.priority !== 'NORMAL' && <StatusBadge vocabulary="Priority" value={t.productionOrder.priority} />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    Good <b className="tabular">{formatNumber(t.qtyGood)}</b> / {formatNumber(t.productionOrder.quantityPlanned)}
                  </span>
                  {t.qtyRejected > 0 && <span className="text-danger">Rejected {formatNumber(t.qtyRejected)}</span>}
                  {t.workstation && <span className="text-muted-foreground">@ {t.workstation.name}</span>}
                  {t.productionOrder.dueDate && (
                    <span className={cn('inline-flex items-center gap-1', late ? 'text-danger' : 'text-muted-foreground')}>
                      <CalendarClock className="size-3.5" aria-hidden /> Due {formatDate(t.productionOrder.dueDate)}
                    </span>
                  )}
                </div>
                {all && t.assignments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.assignments.map((a) => (
                      <Badge key={a.worker.id}>{a.worker.name}</Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto grid grid-cols-2 gap-2">
                  {t.status === 'IN_PROGRESS' ? (
                    <Button size="lg" onClick={() => act.mutate({ id: t.id, action: 'pause' })} loading={act.isPending && act.variables?.id === t.id}>
                      <Pause /> Pause
                    </Button>
                  ) : (
                    <Button size="lg" onClick={() => act.mutate({ id: t.id, action: 'start' })} loading={act.isPending && act.variables?.id === t.id}>
                      <Play /> {t.status === 'PAUSED' ? 'Resume' : 'Start'}
                    </Button>
                  )}
                  <Button size="lg" variant="primary" disabled={t.status === 'PAUSED'} onClick={() => setRecording(t)}>
                    <PlusCircle /> Output
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {recording && <TaskOutput task={recording} onClose={() => setRecording(null)} />}
    </>
  );
}

/** Loads the order to compute the stage's available input, then opens the output dialog. */
function TaskOutput({ task, onClose }: { task: StageTask; onClose: () => void }) {
  const q = useOrder(task.productionOrder.id);
  const stage = q.data?.stages.find((s) => s.id === task.id);
  if (!q.data || !stage) return null;
  return (
    <OutputDialog
      open
      onOpenChange={(o) => !o && onClose()}
      target={{
        stageId: stage.id,
        stageName: stage.stageDefinition.name,
        isQcStage: stage.isQcStage,
        itemId: q.data.itemId,
        orderNumber: q.data.number,
        remaining: Math.max(0, stageInput(q.data, stage) - stage.qtyGood - stage.qtyRejected),
        assignedWorkers: stage.assignments.map((a) => ({ id: a.worker.id, name: a.worker.name })),
      }}
    />
  );
}

