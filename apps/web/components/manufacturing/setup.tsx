'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { mfgKeys, useDepartments, useRoutes, useStages, useWorkstations, type Department, type Route, type StageDefinition, type Workstation } from '@/lib/api/manufacturing';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Checkbox, Label } from '@/components/ui/primitives';

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="icon-sm" variant="ghost" aria-label={label} onClick={onClick}>
      <Pencil />
    </Button>
  );
}

function SaveDialog({ title, onClose, onSave, loading, error, children }: { title: string; onClose: () => void; onSave: () => void; loading: boolean; error: unknown; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={loading} onClick={onSave}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {children}
          <FormError error={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stages ────────────────────────────────────────────

export function StagesSetup() {
  const { can } = useAuth();
  const q = useStages(true);
  const [edit, setEdit] = useState<StageDefinition | 'new' | null>(null);
  const manage = can('production.config.manage');
  const columns = useMemo<ColumnDef<StageDefinition, unknown>[]>(
    () => [
      { accessorKey: 'defaultSequence', header: 'Order', meta: { numeric: true } },
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'isQcStage', header: 'QC stage', cell: ({ row }) => (row.original.isQcStage ? <Badge tone="info">Quality control</Badge> : '—') },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
      { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => manage && <EditButton label={`Edit ${row.original.name}`} onClick={() => setEdit(row.original)} /> },
    ],
    [manage],
  );
  return (
    <>
      <DataTable columns={columns} data={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} searchable toolbar={manage && <Button size="sm" variant="primary" onClick={() => setEdit('new')}><Plus /> Stage</Button>} />
      {edit && <StageDialog stage={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StageDialog({ stage, onClose }: { stage: StageDefinition | null; onClose: () => void }) {
  const [code, setCode] = useState(stage?.code ?? '');
  const [name, setName] = useState(stage?.name ?? '');
  const [description, setDescription] = useState(stage?.description ?? '');
  const [seq, setSeq] = useState(String(stage?.defaultSequence ?? ''));
  const [qc, setQc] = useState(stage?.isQcStage ?? false);
  const [active, setActive] = useState(stage?.isActive ?? true);
  const save = useApiMutation(
    () => {
      const body = { name, description: description || undefined, defaultSequence: seq ? Number(seq) : undefined, isQcStage: qc, isActive: active };
      return stage ? api.put(`/manufacturing/stages/${stage.id}`, body) : api.post('/manufacturing/stages', { ...body, code });
    },
    { invalidate: [mfgKeys.all], success: 'Stage saved', silentError: true, onSuccess: onClose },
  );
  return (
    <SaveDialog title={stage ? `Edit ${stage.name}` : 'New stage'} onClose={onClose} onSave={() => save.mutate(undefined)} loading={save.isPending} error={save.error}>
      <FormGrid>
        <Field label="Code" htmlFor="st-code" required hint="e.g. EMBOSSING">
          <Input id="st-code" value={code} disabled={!!stage} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name" htmlFor="st-name" required>
          <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Default order" htmlFor="st-seq">
          <Input id="st-seq" type="number" min={0} value={seq} onChange={(e) => setSeq(e.target.value)} />
        </Field>
      </FormGrid>
      <Field label="Description" htmlFor="st-desc">
        <Textarea id="st-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-5">
        <div className="flex items-center gap-2">
          <Checkbox id="st-qc" checked={qc} onCheckedChange={(c) => setQc(c === true)} />
          <Label htmlFor="st-qc" className="font-normal">Quality-control stage (records inspections)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="st-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
          <Label htmlFor="st-active" className="font-normal">Active</Label>
        </div>
      </div>
    </SaveDialog>
  );
}

// ─── Routes ────────────────────────────────────────────

export function RoutesSetup() {
  const { can } = useAuth();
  const q = useRoutes();
  const [edit, setEdit] = useState<Route | 'new' | null>(null);
  const manage = can('production.config.manage');
  return (
    <>
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-muted-foreground">A route is the ordered list of stages a SKU passes through. Assign routes on the product or the variant.</p>
        {manage && (
          <Button size="sm" variant="primary" onClick={() => setEdit('new')}>
            <Plus /> Route
          </Button>
        )}
      </div>
      {q.data?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No routes yet.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {r.name} <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Used by {r._count?.products ?? 0} product(s), {r._count?.items ?? 0} SKU(s)
                  {!r.isActive && ' · inactive'}
                </div>
              </div>
              {manage && <EditButton label={`Edit ${r.name}`} onClick={() => setEdit(r)} />}
            </div>
            <ol className="flex flex-wrap items-center gap-1.5 text-xs">
              {r.steps.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <Badge tone={s.stageDefinition.isQcStage ? 'info' : 'neutral'}>{s.stageDefinition.name}</Badge>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {edit && <RouteDialog route={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RouteDialog({ route, onClose }: { route: Route | null; onClose: () => void }) {
  const stages = useStages();
  const ws = useWorkstations();
  const [code, setCode] = useState(route?.code ?? '');
  const [name, setName] = useState(route?.name ?? '');
  const [description, setDescription] = useState(route?.description ?? '');
  const [active, setActive] = useState(route?.isActive ?? true);
  const [steps, setSteps] = useState(route?.steps.map((s) => ({ stageDefinitionId: s.stageDefinitionId, workstationId: s.workstationId ?? '', instructions: s.instructions ?? '' })) ?? []);
  const [adding, setAdding] = useState('');
  const save = useApiMutation(
    () => {
      const body = { name, description: description || undefined, isActive: active, steps: steps.map((s) => ({ stageDefinitionId: s.stageDefinitionId, workstationId: s.workstationId || undefined, instructions: s.instructions || undefined })) };
      return route ? api.put(`/manufacturing/routes/${route.id}`, body) : api.post('/manufacturing/routes', { ...body, code });
    },
    { invalidate: [mfgKeys.all], success: 'Route saved', silentError: true, onSuccess: onClose },
  );
  const stageName = (id: string) => stages.data?.find((s) => s.id === id)?.name ?? id;
  const move = (i: number, d: -1 | 1) =>
    setSteps((xs) => {
      const n = [...xs];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });
  return (
    <SaveDialog title={route ? `Edit ${route.name}` : 'New route'} onClose={onClose} onSave={() => save.mutate(undefined)} loading={save.isPending} error={save.error}>
      <FormGrid>
        <Field label="Code" htmlFor="rt-code" required>
          <Input id="rt-code" value={code} disabled={!!route} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name" htmlFor="rt-name" required>
          <Input id="rt-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </FormGrid>
      <Field label="Description" htmlFor="rt-desc">
        <Textarea id="rt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Steps (in order)</p>
        <ol className="divide-y rounded-md border">
          {steps.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Add at least one stage.</li>}
          {steps.map((s, i) => (
            <li key={`${s.stageDefinitionId}-${i}`} className="space-y-2 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-sm font-medium">{stageName(s.stageDefinitionId)}</span>
                <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Remove step" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
                <NativeSelect aria-label="Default workstation" value={s.workstationId} onChange={(e) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, workstationId: e.target.value } : x)))}>
                  <option value="">No default workstation</option>
                  {(ws.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
                <Input aria-label="Instructions" placeholder="Instructions (optional)" value={s.instructions} onChange={(e) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))} />
              </div>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <NativeSelect aria-label="Stage to add" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Select stage…</option>
            {(stages.data ?? [])
              .filter((s) => !steps.some((x) => x.stageDefinitionId === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </NativeSelect>
          <Button
            disabled={!adding}
            onClick={() => {
              setSteps((xs) => [...xs, { stageDefinitionId: adding, workstationId: '', instructions: '' }]);
              setAdding('');
            }}
          >
            <Plus /> Add
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="rt-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
        <Label htmlFor="rt-active" className="font-normal">Active</Label>
      </div>
    </SaveDialog>
  );
}

// ─── Workstations ──────────────────────────────────────

export function WorkstationsSetup() {
  const { can } = useAuth();
  const q = useWorkstations();
  const [edit, setEdit] = useState<Workstation | 'new' | null>(null);
  const manage = can('production.config.manage');
  const columns = useMemo<ColumnDef<Workstation, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name' },
      { id: 'dept', header: 'Department', accessorFn: (r) => r.department?.name ?? '—' },
      { id: 'stage', header: 'Stage', accessorFn: (r) => r.stageDefinition?.name ?? '—' },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
      { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => manage && <EditButton label={`Edit ${row.original.name}`} onClick={() => setEdit(row.original)} /> },
    ],
    [manage],
  );
  return (
    <>
      <DataTable columns={columns} data={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} searchable toolbar={manage && <Button size="sm" variant="primary" onClick={() => setEdit('new')}><Plus /> Workstation</Button>} />
      {edit && <WorkstationDialog ws={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function WorkstationDialog({ ws, onClose }: { ws: Workstation | null; onClose: () => void }) {
  const stages = useStages();
  const depts = useDepartments();
  const [code, setCode] = useState(ws?.code ?? '');
  const [name, setName] = useState(ws?.name ?? '');
  const [departmentId, setDept] = useState(ws?.departmentId ?? '');
  const [stageDefinitionId, setStage] = useState(ws?.stageDefinitionId ?? '');
  const [active, setActive] = useState(ws?.isActive ?? true);
  const save = useApiMutation(
    () => {
      const body = { name, departmentId: departmentId || undefined, stageDefinitionId: stageDefinitionId || undefined, isActive: active };
      return ws ? api.put(`/manufacturing/workstations/${ws.id}`, body) : api.post('/manufacturing/workstations', { ...body, code });
    },
    { invalidate: [mfgKeys.all], success: 'Workstation saved', silentError: true, onSuccess: onClose },
  );
  return (
    <SaveDialog title={ws ? `Edit ${ws.name}` : 'New workstation'} onClose={onClose} onSave={() => save.mutate(undefined)} loading={save.isPending} error={save.error}>
      <FormGrid>
        <Field label="Code" htmlFor="ws-code" required>
          <Input id="ws-code" value={code} disabled={!!ws} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name" htmlFor="ws-name" required>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Department" htmlFor="ws-dept">
          <NativeSelect id="ws-dept" value={departmentId} onChange={(e) => setDept(e.target.value)}>
            <option value="">—</option>
            {(depts.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Stage" htmlFor="ws-stage">
          <NativeSelect id="ws-stage" value={stageDefinitionId} onChange={(e) => setStage(e.target.value)}>
            <option value="">—</option>
            {(stages.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormGrid>
      <div className="flex items-center gap-2">
        <Checkbox id="ws-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
        <Label htmlFor="ws-active" className="font-normal">Active</Label>
      </div>
    </SaveDialog>
  );
}

// ─── Departments ───────────────────────────────────────

export function DepartmentsSetup({ canManage }: { canManage: boolean }) {
  const q = useDepartments();
  const [edit, setEdit] = useState<Department | 'new' | null>(null);
  const columns = useMemo<ColumnDef<Department, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name' },
      { id: 'workers', header: 'Workers', meta: { numeric: true }, accessorFn: (r) => r._count?.workers ?? 0 },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
      { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => canManage && <EditButton label={`Edit ${row.original.name}`} onClick={() => setEdit(row.original)} /> },
    ],
    [canManage],
  );
  return (
    <>
      <DataTable columns={columns} data={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} searchable toolbar={canManage && <Button size="sm" variant="primary" onClick={() => setEdit('new')}><Plus /> Department</Button>} />
      {edit && <DepartmentDialog dept={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function DepartmentDialog({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const [code, setCode] = useState(dept?.code ?? '');
  const [name, setName] = useState(dept?.name ?? '');
  const [active, setActive] = useState(dept?.isActive ?? true);
  const save = useApiMutation(() => (dept ? api.put(`/manufacturing/departments/${dept.id}`, { name, isActive: active }) : api.post('/manufacturing/departments', { code, name })), {
    invalidate: [mfgKeys.all, ['workforce']],
    success: 'Department saved',
    silentError: true,
    onSuccess: onClose,
  });
  return (
    <SaveDialog title={dept ? `Edit ${dept.name}` : 'New department'} onClose={onClose} onSave={() => save.mutate(undefined)} loading={save.isPending} error={save.error}>
      <FormGrid>
        <Field label="Code" htmlFor="dp-code" required>
          <Input id="dp-code" value={code} disabled={!!dept} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name" htmlFor="dp-name" required>
          <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </FormGrid>
      {dept && (
        <div className="flex items-center gap-2">
          <Checkbox id="dp-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
          <Label htmlFor="dp-active" className="font-normal">Active</Label>
        </div>
      )}
    </SaveDialog>
  );
}
