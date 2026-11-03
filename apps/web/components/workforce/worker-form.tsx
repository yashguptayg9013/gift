'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminKeys } from '@/lib/api/admin';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/hooks';
import { useDepartments, useStages } from '@/lib/api/manufacturing';
import { workforceApi, workforceKeys, type Worker, type WorkerDetail } from '@/lib/api/workforce';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Checkbox, Label } from '@/components/ui/primitives';

/** Create or edit a worker profile. Linking a user account lets the worker use the shop-floor view. */
export function WorkerFormDialog({ worker, onClose, onSaved }: { worker: Worker | null; onClose: () => void; onSaved?: (w: WorkerDetail) => void }) {
  const { can } = useAuth();
  const stages = useStages();
  const depts = useDepartments();
  const canLinkUsers = can('admin.users.manage');
  const users = useQuery({ queryKey: adminKeys.users(undefined), queryFn: ({ signal }) => api.get<{ id: string; name: string; email: string; isActive: boolean }[]>('/admin/users', signal), enabled: canLinkUsers });
  const [code, setCode] = useState(worker?.code ?? '');
  const [name, setName] = useState(worker?.name ?? '');
  const [phone, setPhone] = useState(worker?.phone ?? '');
  const [departmentId, setDept] = useState(worker?.departmentId ?? '');
  const [jobRole, setJobRole] = useState(worker?.jobRole ?? '');
  const [skills, setSkills] = useState<string[]>(worker?.skills ?? []);
  const [userId, setUserId] = useState(worker?.userId ?? '');
  const [joinedOn, setJoinedOn] = useState(worker?.joinedOn?.slice(0, 10) ?? '');
  const [isActive, setActive] = useState(worker?.isActive ?? true);
  const [notes, setNotes] = useState(worker?.notes ?? '');

  const save = useApiMutation(
    () => {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone || undefined,
        departmentId: departmentId || undefined,
        jobRole: jobRole || undefined,
        skills,
        joinedOn: joinedOn || undefined,
        isActive,
        notes: notes || undefined,
      };
      if (canLinkUsers) body.userId = userId || undefined;
      return worker ? workforceApi.update(worker.id, body) : workforceApi.create({ ...body, code: code.trim() });
    },
    { invalidate: [workforceKeys.all], success: 'Worker saved', silentError: true, onSuccess: (w) => (onSaved ? onSaved(w) : onClose()) },
  );
  const invalid = !name.trim() || (!worker && !code.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        title={worker ? `Edit ${worker.name}` : 'New worker'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Worker code" htmlFor="w-code" required>
              <Input id="w-code" value={code} disabled={!!worker} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Name" htmlFor="w-name" required>
              <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="w-phone">
              <Input id="w-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Department" htmlFor="w-dept">
              <NativeSelect id="w-dept" value={departmentId} onChange={(e) => setDept(e.target.value)}>
                <option value="">—</option>
                {(depts.data ?? [])
                  .filter((d) => d.isActive || d.id === departmentId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Job role" htmlFor="w-role" hint="e.g. Cutter, Stitcher, Helper">
              <Input id="w-role" value={jobRole} onChange={(e) => setJobRole(e.target.value)} />
            </Field>
            <Field label="Joined on" htmlFor="w-joined">
              <Input id="w-joined" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
            </Field>
            {canLinkUsers && (
              <Field label="Linked user account" htmlFor="w-user" hint="Lets this worker sign in and update assigned tasks">
                <NativeSelect id="w-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Not linked</option>
                  {(users.data ?? [])
                    .filter((u) => u.isActive || u.id === userId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            )}
          </FormGrid>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Skills (stages)</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(stages.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox id={`skill-${s.code}`} checked={skills.includes(s.code)} onCheckedChange={(c) => setSkills((xs) => (c === true ? [...xs, s.code] : xs.filter((x) => x !== s.code)))} />
                  <Label htmlFor={`skill-${s.code}`} className="font-normal">
                    {s.name}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>
          <Field label="Notes" htmlFor="w-notes">
            <Textarea id="w-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {worker && (
            <div className="flex items-center gap-2">
              <Checkbox id="w-active" checked={isActive} onCheckedChange={(c) => setActive(c === true)} />
              <Label htmlFor="w-active" className="font-normal">Active</Label>
            </div>
          )}
          <FormError error={save.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
