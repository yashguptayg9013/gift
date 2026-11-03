'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loadItemOptions } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { prodKeys, productionApi, type OrderDetail, type Priority } from '@/lib/api/manufacturing';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/** Create a draft production order for a finished-goods SKU. */
export function OrderFormDialog({ open, onOpenChange, initialItemId }: { open: boolean; onOpenChange: (o: boolean) => void; initialItemId?: string }) {
  const router = useRouter();
  const [itemId, setItemId] = useState<string | null>(initialItemId ?? null);
  const [quantity, setQuantity] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);

  const create = useApiMutation(
    () =>
      productionApi.create({
        itemId,
        quantity: Number(quantity),
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : undefined,
        plannedStart: plannedStart ? new Date(`${plannedStart}T09:00:00`).toISOString() : undefined,
        remarks: remarks || undefined,
      }),
    {
      invalidate: [prodKeys.all],
      success: (o: OrderDetail) => `Created ${o.number}`,
      silentError: true,
      onSuccess: (o: OrderDetail) => {
        onOpenChange(false);
        router.push(`/manufacturing/orders/${o.id}`);
      },
    },
  );

  const qtyInvalid = !(Number(quantity) > 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!itemId || qtyInvalid) return;
    create.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New production order"
        description="Creates a draft. Releasing it freezes the active BOM version and route."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="order-form" loading={create.isPending}>
              Create draft
            </Button>
          </>
        }
      >
        <form id="order-form" onSubmit={submit} className="space-y-4">
          <Field label="Finished-goods SKU" htmlFor="po-item" required error={touched && !itemId ? 'Select a SKU' : null}>
            <AsyncCombobox id="po-item" value={itemId} onChange={(v) => setItemId(v)} queryKey={['po-item-options']} load={(s) => loadItemOptions(s, 'PRODUCT')} placeholder="Search SKU…" />
          </Field>
          <FormGrid>
            <Field label="Quantity (pcs)" htmlFor="po-qty" required error={touched && qtyInvalid ? 'Enter a quantity greater than zero' : null}>
              <Input id="po-qty" type="number" min={0} step="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Priority" htmlFor="po-priority">
              <NativeSelect id="po-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Planned start" htmlFor="po-start">
              <Input id="po-start" type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </Field>
            <Field label="Due date" htmlFor="po-due">
              <Input id="po-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </FormGrid>
          <Field label="Remarks" htmlFor="po-remarks">
            <Textarea id="po-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <FormError error={create.error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
