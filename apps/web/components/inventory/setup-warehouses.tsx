'use client';

import { LOCATION_TYPE } from '@puja/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api } from '@/lib/api/client';
import { catalogKeys, useWarehouses } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import type { Location, LocationType, Warehouse } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, FormError, LoadingRows, Section, StatusBadge } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Switch } from '@/components/ui/primitives';

interface WhValues {
  code: string;
  name: string;
  address: string;
  isActive: boolean;
  allowNegativeStock: boolean;
}
interface LocValues {
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
  isDefault: boolean;
}

export function WarehousesSetup() {
  const { can } = useAuth();
  const manage = can('inventory.location.manage');
  const q = useWarehouses();
  const [whEdit, setWhEdit] = useState<Warehouse | 'new' | null>(null);
  const [locEdit, setLocEdit] = useState<{ warehouse: Warehouse; location?: Location } | null>(null);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows />;

  return (
    <div className="space-y-5">
      {manage && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setWhEdit('new')}>
            <Plus /> New warehouse
          </Button>
        </div>
      )}
      {q.data.length === 0 && <EmptyState title="No warehouses" />}
      {q.data.map((w) => (
        <Section
          key={w.id}
          title={
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{w.code}</span> {w.name}
              {!w.isActive && <Badge>Inactive</Badge>}
              {w.allowNegativeStock && <Badge tone="warning">Negative stock allowed</Badge>}
            </span>
          }
          description={w.address ?? undefined}
          actions={
            manage && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setWhEdit(w)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" onClick={() => setLocEdit({ warehouse: w })}>
                  <Plus /> Location
                </Button>
              </>
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="h-8 px-3 text-left font-medium">Code</th>
                  <th className="px-3 text-left font-medium">Name</th>
                  <th className="px-3 text-left font-medium">Type</th>
                  <th className="px-3 text-left font-medium">Status</th>
                  <th className="px-3" />
                </tr>
              </thead>
              <tbody>
                {w.locations.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                    <td className="px-3">
                      {l.name} {l.isDefault && <Badge tone="info">Default</Badge>}
                    </td>
                    <td className="px-3">
                      <StatusBadge vocabulary="LocationType" value={l.type} />
                    </td>
                    <td className="px-3">{l.isActive ? <span className="text-muted-foreground">Active</span> : <Badge>Inactive</Badge>}</td>
                    <td className="px-3 text-right">
                      {manage && (
                        <Button size="sm" variant="ghost" onClick={() => setLocEdit({ warehouse: w, location: l })} aria-label={`Edit location ${l.code}`}>
                          <Pencil />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <p className="text-xs text-muted-foreground">Only Storage locations count as available stock. Receiving, QC hold, rejected and production locations hold stock that cannot be reserved, issued or sold.</p>
      {whEdit && <WarehouseDialog warehouse={whEdit === 'new' ? undefined : whEdit} onClose={() => setWhEdit(null)} />}
      {locEdit && <LocationDialog warehouse={locEdit.warehouse} location={locEdit.location} onClose={() => setLocEdit(null)} />}
    </div>
  );
}

function WarehouseDialog({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const form = useForm<WhValues>({ defaultValues: { code: warehouse?.code ?? '', name: warehouse?.name ?? '', address: warehouse?.address ?? '', isActive: warehouse?.isActive ?? true, allowNegativeStock: warehouse?.allowNegativeStock ?? false } });
  const save = useApiMutation(
    (v: WhValues) =>
      warehouse
        ? api.put(`/warehouses/${warehouse.id}`, { name: v.name, address: v.address || undefined, isActive: v.isActive, allowNegativeStock: v.allowNegativeStock })
        : api.post('/warehouses', { code: v.code.toUpperCase(), name: v.name, address: v.address || undefined, allowNegativeStock: v.allowNegativeStock }),
    { invalidate: [catalogKeys.warehouses()], success: 'Warehouse saved', silentError: true, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={warehouse ? `Edit ${warehouse.code}` : 'New warehouse'}
        description={warehouse ? undefined : 'Standard locations (store, receiving, QC hold, rejected, WIP) are created automatically.'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="wh-form" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="wh-form" className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <FormGrid>
            <Field label="Code" htmlFor="wh-code" required error={form.formState.errors.code}>
              <Input id="wh-code" className="font-mono uppercase" disabled={!!warehouse} {...form.register('code', { validate: (v) => !!warehouse || !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Name" htmlFor="wh-name" required error={form.formState.errors.name}>
              <Input id="wh-name" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
            </Field>
          </FormGrid>
          <Field label="Address" htmlFor="wh-addr">
            <Textarea id="wh-addr" rows={2} {...form.register('address')} />
          </Field>
          <div className="flex flex-wrap gap-6">
            {warehouse && (
              <Controller control={form.control} name="isActive" render={({ field }) => <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>} />
            )}
            <Controller
              control={form.control}
              name="allowNegativeStock"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} /> Allow negative stock (with override permission)
                </label>
              )}
            />
          </div>
          {save.error ? <FormError error={save.error} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocationDialog({ warehouse, location, onClose }: { warehouse: Warehouse; location?: Location; onClose: () => void }) {
  const form = useForm<LocValues>({ defaultValues: { code: location?.code ?? '', name: location?.name ?? '', type: location?.type ?? 'STORAGE', isActive: location?.isActive ?? true, isDefault: location?.isDefault ?? false } });
  const save = useApiMutation(
    (v: LocValues) =>
      location
        ? api.put(`/locations/${location.id}`, { name: v.name, type: v.type, isActive: v.isActive, isDefault: v.isDefault })
        : api.post('/locations', { warehouseId: warehouse.id, code: v.code.toUpperCase(), name: v.name, type: v.type, isDefault: v.isDefault }),
    { invalidate: [catalogKeys.warehouses()], success: 'Location saved', silentError: true, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={location ? `Edit ${warehouse.code} / ${location.code}` : `New location in ${warehouse.code}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="loc-form" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="loc-form" className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <FormGrid>
            <Field label="Code" htmlFor="loc-code" required error={form.formState.errors.code}>
              <Input id="loc-code" className="font-mono uppercase" disabled={!!location} {...form.register('code', { validate: (v) => !!location || !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Name" htmlFor="loc-name" required error={form.formState.errors.name}>
              <Input id="loc-name" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Type" htmlFor="loc-type">
              <NativeSelect id="loc-type" {...form.register('type')}>
                {Object.entries(LOCATION_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FormGrid>
          <div className="flex flex-wrap gap-6">
            <Controller control={form.control} name="isDefault" render={({ field }) => <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Default for its type</label>} />
            {location && <Controller control={form.control} name="isActive" render={({ field }) => <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>} />}
          </div>
          {save.error ? <FormError error={save.error} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
