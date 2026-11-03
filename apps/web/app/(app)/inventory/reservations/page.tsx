'use client';

import { Controller, useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { loadItemOptions, useWarehouses } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { inventoryKeys } from '@/lib/api/inventory';
import { useAuth } from '@/lib/auth';
import { newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { FormError, PageHeader } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { ReservationsTable } from '@/components/inventory/reservations-table';

interface Values {
  itemId: string;
  quantity: string;
  warehouseId: string;
  remarks: string;
}

export default function ReservationsPage() {
  const { can } = useAuth();
  const [openOnly, setOpenOnly] = useState(true);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const warehouses = useWarehouses();
  const form = useForm<Values>({ defaultValues: { itemId: '', quantity: '', warehouseId: '', remarks: '' } });
  const reserve = useApiMutation(
    (v: Values) => api.post<{ reserved: number }>('/inventory/reservations', { itemId: v.itemId, quantity: Number(v.quantity), warehouseId: v.warehouseId || undefined, remarks: v.remarks || undefined }, { idempotencyKey: key }),
    {
      invalidate: [inventoryKeys.all],
      success: (r) => `Reserved ${r.reserved}`,
      silentError: true,
      onSuccess: () => {
        setOpen(false);
        form.reset();
        setKey(newIdempotencyKey());
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Stock allocated to production orders, sales orders or manual holds. Reserved stock stays on hand but cannot be issued elsewhere."
        actions={
          can('inventory.reserve') && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Manual reservation
            </Button>
          )
        }
      />
      <ReservationsTable
        openOnly={openOnly}
        toolbar={
          <div className="flex items-center gap-2 pl-1">
            <Switch id="open-only" checked={openOnly} onCheckedChange={setOpenOnly} />
            <Label htmlFor="open-only" className="font-normal text-muted-foreground">
              Open only
            </Label>
          </div>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Manual reservation"
          description="Holds available stock (FIFO across storage locations)."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="reserve-form" loading={reserve.isPending}>
                Reserve
              </Button>
            </>
          }
        >
          <form id="reserve-form" className="space-y-4" onSubmit={form.handleSubmit((v) => reserve.mutate(v))} noValidate>
            <Field label="Item" htmlFor="res-item" required error={form.formState.errors.itemId}>
              <Controller control={form.control} name="itemId" rules={{ required: 'Select an item' }} render={({ field }) => <AsyncCombobox id="res-item" value={field.value} onChange={(v) => field.onChange(v ?? '')} queryKey={['item-picker']} load={(s) => loadItemOptions(s)} />} />
            </Field>
            <Field label="Quantity (base unit)" htmlFor="res-qty" required error={form.formState.errors.quantity}>
              <Input id="res-qty" type="number" step="any" min={0} {...form.register('quantity', { validate: (v) => Number(v) > 0 || 'Must be positive' })} />
            </Field>
            <Field label="Warehouse" htmlFor="res-wh">
              <NativeSelect id="res-wh" {...form.register('warehouseId')}>
                <option value="">Default warehouse</option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Remarks" htmlFor="res-rem">
              <Input id="res-rem" {...form.register('remarks')} />
            </Field>
            {reserve.error ? <FormError error={reserve.error} /> : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
