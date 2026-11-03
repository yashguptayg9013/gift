'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { catalogKeys, loadItemOptions, useItem, useWarehouses } from '@/lib/api/catalog';
import { approvalKeys } from '@/lib/api/admin';
import { inventoryKeys, type MovementKind, postMovement, useBalances, type AdjustmentResult } from '@/lib/api/inventory';
import type { TxDetail, Warehouse } from '@/lib/api/types';
import { formatQty } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/overlays';

export const MOVEMENT_META: Record<MovementKind, { title: string; description: string; submit: string; reasonRequired: boolean }> = {
  receipt: { title: 'Stock receipt', description: 'Record material or goods received into a location.', submit: 'Post receipt', reasonRequired: false },
  issue: { title: 'Stock issue', description: 'Issue stock out of usable inventory. Reserved stock cannot be issued.', submit: 'Post issue', reasonRequired: true },
  transfer: { title: 'Stock transfer', description: 'Move stock between locations or warehouses.', submit: 'Post transfer', reasonRequired: false },
  adjustment: { title: 'Stock adjustment', description: 'Correct stock with a signed quantity. Requires approval unless you are an approver.', submit: 'Submit adjustment', reasonRequired: true },
  damage: { title: 'Damaged stock', description: 'Write off damaged stock from inventory.', submit: 'Record damage', reasonRequired: true },
  return: { title: 'Material return', description: 'Return unused material back into stock.', submit: 'Post return', reasonRequired: false },
};

const lineSchema = z.object({
  itemId: z.string().min(1, 'Select an item'),
  quantity: z.string().min(1, 'Required'),
  uomCode: z.string().optional(),
  locationId: z.string().optional(),
  batchId: z.string().optional(),
  batchNumber: z.string().max(60).optional(),
  unitCost: z.string().optional(),
});

function makeSchema(kind: MovementKind) {
  return z
    .object({
      lines: z.array(lineSchema).min(1),
      fromLocationId: z.string().optional(),
      toLocationId: z.string().optional(),
      reason: z.string().max(300).optional(),
      remarks: z.string().max(1000).optional(),
      referenceNumber: z.string().max(60).optional(),
    })
    .superRefine((v, ctx) => {
      v.lines.forEach((l, i) => {
        const n = Number(l.quantity);
        if (!Number.isFinite(n) || n === 0) ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Enter a non-zero number' });
        else if (kind !== 'adjustment' && n < 0) ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Must be positive' });
        if (l.unitCost && !(Number(l.unitCost) >= 0)) ctx.addIssue({ code: 'custom', path: ['lines', i, 'unitCost'], message: 'Invalid cost' });
      });
      if (MOVEMENT_META[kind].reasonRequired && !v.reason?.trim()) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required' });
      if (kind === 'transfer') {
        if (!v.fromLocationId) ctx.addIssue({ code: 'custom', path: ['fromLocationId'], message: 'Select source' });
        if (!v.toLocationId) ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Select destination' });
        if (v.fromLocationId && v.fromLocationId === v.toLocationId) ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Must differ from source' });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function locationOptions(warehouses: Warehouse[] | undefined) {
  return (warehouses ?? []).flatMap((w) =>
    w.locations.filter((l) => l.isActive).map((l) => ({ value: l.id, label: `${w.code} / ${l.code} — ${l.name}`, type: l.type, isDefault: l.isDefault })),
  );
}

const emptyLine = (itemId = '') => ({ itemId, quantity: '', uomCode: '', locationId: '', batchId: '', batchNumber: '', unitCost: '' });

export function MovementSheet({ kind, open, onOpenChange, defaultItemId }: { kind: MovementKind; open: boolean; onOpenChange: (o: boolean) => void; defaultItemId?: string }) {
  const meta = MOVEMENT_META[kind];
  const qc = useQueryClient();
  const warehouses = useWarehouses();
  const locs = locationOptions(warehouses.data);
  const [key, setKey] = React.useState(newIdempotencyKey);
  const [error, setError] = React.useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(makeSchema(kind)),
    defaultValues: { lines: [emptyLine(defaultItemId)], reason: '', remarks: '', referenceNumber: '', fromLocationId: '', toLocationId: '' },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });

  React.useEffect(() => {
    if (open) {
      form.reset({ lines: [emptyLine(defaultItemId)], reason: '', remarks: '', referenceNumber: '', fromLocationId: '', toLocationId: '' });
      setKey(newIdempotencyKey());
      setError(null);
    }
  }, [open, defaultItemId, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== '' && x !== undefined && x !== null)) as Partial<T>;
    const body: Record<string, unknown> = clean({ reason: v.reason?.trim(), remarks: v.remarks?.trim(), referenceNumber: v.referenceNumber?.trim() });
    body.lines = v.lines.map((l) =>
      clean({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        uomCode: l.uomCode,
        locationId: kind === 'transfer' ? undefined : l.locationId,
        batchId: kind === 'receipt' || kind === 'return' ? undefined : l.batchId,
        batchNumber: kind === 'receipt' || kind === 'return' || kind === 'adjustment' ? l.batchNumber?.trim() : undefined,
        unitCost: kind === 'receipt' && l.unitCost ? Number(l.unitCost) : undefined,
      }),
    );
    if (kind === 'transfer') {
      body.fromLocationId = v.fromLocationId;
      body.toLocationId = v.toLocationId;
    }
    try {
      const res = await postMovement(kind, body, key);
      await Promise.all([qc.invalidateQueries({ queryKey: inventoryKeys.all }), qc.invalidateQueries({ queryKey: approvalKeys.all }), qc.invalidateQueries({ queryKey: catalogKeys.all }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
      if (kind === 'adjustment' && (res as AdjustmentResult).status === 'PENDING_APPROVAL') {
        const a = (res as Extract<AdjustmentResult, { status: 'PENDING_APPROVAL' }>).approval;
        toast.success(`Sent for approval as ${a.number}`, { description: 'Stock changes once an approver accepts it.', action: { label: 'View', onClick: () => (window.location.href = '/approvals') } });
      } else {
        const tx = kind === 'adjustment' ? (res as Extract<AdjustmentResult, { status: 'POSTED' }>).transaction : (res as TxDetail);
        toast.success(`${meta.title} posted · ${tx.number}`, { action: { label: 'Open', onClick: () => (window.location.href = `/inventory/transactions/${tx.id}`) } });
      }
      onOpenChange(false);
    } catch (e) {
      setError(e);
    }
  });

  const storage = locs.filter((l) => l.type === 'STORAGE');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        title={meta.title}
        description={meta.description}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={`movement-${kind}`} loading={form.formState.isSubmitting}>
              {meta.submit}
            </Button>
          </>
        }
      >
        <form id={`movement-${kind}`} onSubmit={onSubmit} className="space-y-5" noValidate>
          {kind === 'transfer' && (
            <FormGrid>
              <Field label="From location" htmlFor="from" required error={form.formState.errors.fromLocationId}>
                <NativeSelect id="from" {...form.register('fromLocationId')}>
                  <option value="">Select…</option>
                  {locs.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="To location" htmlFor="to" required error={form.formState.errors.toLocationId}>
                <NativeSelect id="to" {...form.register('toLocationId')}>
                  <option value="">Select…</option>
                  {locs.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormGrid>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Lines</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => lines.append(emptyLine())} disabled={lines.fields.length >= 50}>
                <Plus /> Add line
              </Button>
            </div>
            {lines.fields.map((f, i) => (
              <LineRow
                key={f.id}
                index={i}
                kind={kind}
                control={form.control}
                register={form.register}
                setValue={form.setValue}
                locations={kind === 'receipt' || kind === 'return' || kind === 'adjustment' ? locs : storage}
                errors={form.formState.errors.lines?.[i]}
                onRemove={lines.fields.length > 1 ? () => lines.remove(i) : undefined}
                fromLocationId={kind === 'transfer' ? form.watch('fromLocationId') : undefined}
              />
            ))}
          </div>

          <FormGrid>
            <Field label="Reason" htmlFor="reason" required={meta.reasonRequired} error={form.formState.errors.reason}>
              <Input id="reason" placeholder={kind === 'adjustment' ? 'e.g. Count difference' : kind === 'damage' ? 'e.g. Water damage in store' : ''} {...form.register('reason')} />
            </Field>
            <Field label="Reference number" htmlFor="ref" hint="Supplier invoice, challan or internal reference">
              <Input id="ref" {...form.register('referenceNumber')} />
            </Field>
          </FormGrid>
          <Field label="Remarks" htmlFor="remarks">
            <Textarea id="remarks" rows={2} {...form.register('remarks')} />
          </Field>
          {error ? <FormError error={error} /> : null}
          <p className="text-xs text-muted-foreground">
            Submissions are idempotent — retrying after a network error will not post twice. See the <Link href="/inventory/transactions" className="underline">ledger</Link> for posted transactions.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function LineRow({
  index,
  kind,
  control,
  register,
  setValue,
  locations,
  errors,
  onRemove,
  fromLocationId,
}: {
  index: number;
  kind: MovementKind;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  locations: ReturnType<typeof locationOptions>;
  errors?: Partial<Record<keyof z.infer<typeof lineSchema>, { message?: string }>>;
  onRemove?: () => void;
  fromLocationId?: string;
}) {
  const itemId = useWatch({ control, name: `lines.${index}.itemId` });
  const locationId = useWatch({ control, name: `lines.${index}.locationId` });
  const item = useItem(itemId || undefined);
  const needsBalances = kind !== 'receipt' && kind !== 'return';
  const balances = useBalances(needsBalances && itemId ? itemId : undefined);
  const uoms = item.data ? [item.data.uom.code, ...item.data.uomConversions.map((c) => c.uomCode)] : [];
  const batchSource = (balances.data ?? []).filter((b) => b.batch && (!(fromLocationId || locationId) || b.location.id === (fromLocationId || locationId)));
  const id = (s: string) => `line-${index}-${s}`;

  return (
    <div className="rounded-md border bg-subtle p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <Field label="Item" htmlFor={id('item')} className="sm:col-span-6" required error={errors?.itemId?.message}>
          <Controller
            control={control}
            name={`lines.${index}.itemId`}
            render={({ field }) => (
              <AsyncCombobox
                id={id('item')}
                value={field.value}
                onChange={(v) => {
                  field.onChange(v ?? '');
                  setValue(`lines.${index}.uomCode`, '');
                  setValue(`lines.${index}.batchId`, '');
                }}
                queryKey={['item-picker']}
                load={(s) => loadItemOptions(s)}
                placeholder="Search by code or name"
                selectedLabel={item.data ? `${item.data.code} · ${item.data.name}` : undefined}
                aria-invalid={!!errors?.itemId}
              />
            )}
          />
        </Field>
        <Field label={kind === 'adjustment' ? 'Quantity (+/−)' : 'Quantity'} htmlFor={id('qty')} className="sm:col-span-3" required error={errors?.quantity?.message}>
          <Input id={id('qty')} type="number" step="any" inputMode="decimal" aria-invalid={!!errors?.quantity} {...register(`lines.${index}.quantity`)} />
        </Field>
        <Field label="Unit" htmlFor={id('uom')} className="sm:col-span-3">
          <NativeSelect id={id('uom')} disabled={!item.data} {...register(`lines.${index}.uomCode`)}>
            {uoms.length === 0 ? <option value="">—</option> : uoms.map((u, ui) => <option key={u} value={ui === 0 ? '' : u}>{u}{ui === 0 ? ' (base)' : ''}</option>)}
          </NativeSelect>
        </Field>
        {kind !== 'transfer' && (
          <Field label="Location" htmlFor={id('loc')} className="sm:col-span-6" hint={kind === 'issue' || kind === 'damage' ? 'Leave empty to pick FIFO from storage' : undefined}>
            <NativeSelect id={id('loc')} {...register(`lines.${index}.locationId`)}>
              <option value="">{kind === 'issue' || kind === 'damage' ? 'Automatic (FIFO)' : 'Default storage'}</option>
              {locations.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {(kind === 'receipt' || kind === 'return') && (
          <>
            <Field label="Batch number" htmlFor={id('batch')} className="sm:col-span-3" hint={item.data?.trackBatches ? 'Required for this item' : undefined}>
              <Input id={id('batch')} {...register(`lines.${index}.batchNumber`)} />
            </Field>
            {kind === 'receipt' && (
              <Field label="Unit cost (₹)" htmlFor={id('cost')} className="sm:col-span-3" error={errors?.unitCost?.message}>
                <Input id={id('cost')} type="number" step="any" min={0} {...register(`lines.${index}.unitCost`)} />
              </Field>
            )}
          </>
        )}
        {needsBalances && (batchSource.length > 0 || item.data?.trackBatches) && (
          <Field label="Batch" htmlFor={id('batchsel')} className={kind === 'transfer' ? 'sm:col-span-6' : 'sm:col-span-6'}>
            <NativeSelect id={id('batchsel')} {...register(`lines.${index}.batchId`)}>
              <option value="">{kind === 'transfer' ? 'Unbatched stock' : 'Any (FIFO)'}</option>
              {batchSource.map((b) => (
                <option key={b.id} value={b.batch!.id}>
                  {b.batch!.batchNumber} · {b.location.code} · avail {formatQty(b.available)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{item.data ? `Base unit ${item.data.uom.code}${item.data.uomConversions.length ? ` · ${item.data.uomConversions.map((c) => `1 ${c.uomCode} = ${c.factorToBase} ${item.data!.uom.code}`).join(', ')}` : ''}` : ' '}</span>
        {onRemove && (
          <Button type="button" variant="danger-ghost" size="sm" onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
