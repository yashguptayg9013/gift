'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useDepartments } from '@/lib/api/manufacturing';
import { useWorkers, type Worker } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/use-debounce';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, PageHeader } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { WorkerFormDialog } from '@/components/workforce/worker-form';

export default function WorkersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [departmentId, setDept] = useState('');
  const [includeInactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search);
  const depts = useDepartments();
  const q = useWorkers({ search: debounced || undefined, departmentId: departmentId || undefined, includeInactive: includeInactive || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<Worker, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { accessorKey: 'jobRole', header: 'Role', cell: ({ row }) => row.original.jobRole ?? '—' },
      { id: 'dept', header: 'Department', accessorFn: (r) => r.department?.name ?? '' },
      { id: 'skills', header: 'Skills', accessorFn: (r) => r.skills.length, cell: ({ row }) => (row.original.skills.length ? <span className="text-xs text-muted-foreground">{row.original.skills.length} stage(s)</span> : '—') },
      { id: 'login', header: 'Sign-in', accessorFn: (r) => (r.user ? 'Linked' : ''), cell: ({ row }) => (row.original.user ? <Badge tone="info">Linked</Badge> : <span className="text-xs text-muted-foreground">—</span>) },
      { id: 'tasks', header: 'Assignments', meta: { numeric: true }, accessorFn: (r) => r._count?.assignments ?? 0 },
      { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Workers"
        description="Production workers, their departments, skills and sign-in links."
        actions={
          can('workforce.manage') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New worker
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
        search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        searchPlaceholder="Name, code, role…"
        exportName="workers"
        onRowClick={(r) => router.push(`/workforce/workers/${r.id}`)}
        toolbar={
          <>
            <NativeSelect aria-label="Department" className="h-7 w-44 text-sm" value={departmentId} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
              <option value="">All departments</option>
              {(depts.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-1.5 pl-1">
              <Checkbox id="inactive" checked={includeInactive} onCheckedChange={(c) => { setInactive(c === true); setPage(1); }} />
              <Label htmlFor="inactive" className="text-sm font-normal">Include inactive</Label>
            </div>
          </>
        }
      />
      {creating && <WorkerFormDialog worker={null} onClose={() => setCreating(false)} onSaved={(w) => router.push(`/workforce/workers/${w.id}`)} />}
    </>
  );
}
