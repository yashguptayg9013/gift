'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { catalogKeys, useCategories, useUoms } from '@/lib/api/catalog';
import { inventoryKeys } from '@/lib/api/inventory';
import type { AttributeDef, ItemDetail, ItemType } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { FormError, Section } from '@/components/ui/feedback';
import { Field, FormGrid, FormSection, optionalNumber } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';

interface Values {
  code: string;
  name: string;
  categoryId: string;
  uomCode: string;
  description: string;
  specifications: string;
  colour: string;
  attributes: Record<string, string>;
  minStock: string;
  reorderLevel: string;
  reorderQty: string;
  trackBatches: boolean;
  requiresInspection: boolean;
  standardCost: string;
  sellingPrice: string;
  taxRate: string;
  hsnCode: string;
  remarks: string;
  isActive: boolean;
  conversions: { uomCode: string; factorToBase: string }[];
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toValues(item?: ItemDetail): Values {
  return {
    code: item?.code ?? '',
    name: item?.name ?? '',
    categoryId: item?.categoryId ?? '',
    uomCode: item?.uom.code ?? '',
    description: item?.description ?? '',
    specifications: item?.specifications ?? '',
    colour: item?.colour ?? '',
    attributes: Object.fromEntries(Object.entries(item?.attributes ?? {}).map(([k, v]) => [k, String(v)])),
    minStock: str(item?.minStock ?? ''),
    reorderLevel: str(item?.reorderLevel ?? ''),
    reorderQty: str(item?.reorderQty ?? ''),
    trackBatches: item?.trackBatches ?? false,
    requiresInspection: item?.requiresInspection ?? false,
    standardCost: str(item?.standardCost),
    sellingPrice: str(item?.sellingPrice),
    taxRate: str(item?.taxRate),
    hsnCode: item?.hsnCode ?? '',
    remarks: item?.remarks ?? '',
    isActive: item?.isActive ?? true,
    conversions: (item?.uomConversions ?? []).map((c) => ({ uomCode: c.uomCode, factorToBase: String(c.factorToBase) })),
  };
}

/** Create / edit form for materials and finished-goods variants. */
export function ItemForm({ type, item, onSaved }: { type: ItemType; item?: ItemDetail; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useCategories(type);
  const uoms = useUoms();
  const [error, setError] = React.useState<unknown>(null);
  const form = useForm<Values>({ defaultValues: toValues(item) });
  const conversions = useFieldArray({ control: form.control, name: 'conversions' });
  const categoryId = form.watch('categoryId');
  const category = categories.data?.find((c) => c.id === categoryId);
  const schema: AttributeDef[] = category?.attributeSchema ?? [];
  const isEdit = !!item;
  const hasMovements = false; // base unit can only change before stock moves; the API enforces this

  // When choosing a category on create, default the base unit to the category's unit.
  React.useEffect(() => {
    if (isEdit || !category?.defaultUomId || !uoms.data) return;
    const u = uoms.data.find((x) => x.id === category.defaultUomId);
    if (u && !form.getValues('uomCode')) form.setValue('uomCode', u.code);
  }, [category, uoms.data, isEdit, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    // validate dynamic attributes against the category schema
    for (const def of schema) {
      const val = v.attributes[def.key];
      if (def.required && !val?.trim()) {
        form.setError(`attributes.${def.key}` as `attributes.${string}`, { message: `${def.label} is required` });
        return;
      }
      if (def.type === 'number' && val && !Number.isFinite(Number(val))) {
        form.setError(`attributes.${def.key}` as `attributes.${string}`, { message: 'Must be a number' });
        return;
      }
    }
    const attributes = Object.fromEntries(schema.filter((d) => v.attributes[d.key]?.toString().trim()).map((d) => [d.key, d.type === 'number' ? Number(v.attributes[d.key]) : v.attributes[d.key].trim()]));
    const body = {
      ...(isEdit ? {} : { type, code: v.code.trim().toUpperCase() }),
      name: v.name.trim(),
      categoryId: v.categoryId || undefined,
      uomCode: v.uomCode || undefined,
      description: v.description.trim() || undefined,
      specifications: v.specifications.trim() || undefined,
      colour: v.colour.trim() || undefined,
      attributes,
      minStock: optionalNumber(v.minStock) ?? 0,
      reorderLevel: optionalNumber(v.reorderLevel) ?? 0,
      reorderQty: optionalNumber(v.reorderQty) ?? 0,
      trackBatches: v.trackBatches,
      requiresInspection: v.requiresInspection,
      standardCost: optionalNumber(v.standardCost),
      sellingPrice: optionalNumber(v.sellingPrice),
      taxRate: optionalNumber(v.taxRate),
      hsnCode: v.hsnCode.trim() || undefined,
      remarks: v.remarks.trim() || undefined,
      ...(isEdit ? { isActive: v.isActive } : {}),
      conversions: v.conversions.filter((c) => c.uomCode && Number(c.factorToBase) > 0).map((c) => ({ uomCode: c.uomCode, factorToBase: Number(c.factorToBase) })),
    };
    try {
      const saved = isEdit ? await api.patch<ItemDetail>(`/items/${item!.id}`, body) : await api.post<ItemDetail>('/items', body);
      await Promise.all([qc.invalidateQueries({ queryKey: catalogKeys.all }), qc.invalidateQueries({ queryKey: inventoryKeys.all })]);
      toast.success(isEdit ? 'Changes saved' : `${saved.code} created`);
      if (onSaved) onSaved(saved.id);
      else router.push(type === 'MATERIAL' ? `/inventory/materials/${saved.id}` : `/inventory/products/variant/${saved.id}`);
    } catch (e) {
      setError(e);
    }
  });

  const errs = form.formState.errors;
  const attrErr = (k: string) => (errs.attributes as Record<string, { message?: string }> | undefined)?.[k]?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Section>
        <div className="space-y-6 p-4 sm:p-5">
          <FormSection title="Identity">
            <FormGrid cols={3}>
              <Field label={type === 'MATERIAL' ? 'Material code' : 'SKU'} htmlFor="code" required error={errs.code} hint={isEdit ? 'Codes cannot be changed' : 'Unique, e.g. PU-07-BLK'}>
                <Input id="code" disabled={isEdit} className="font-mono uppercase" {...form.register('code', { validate: (v) => isEdit || !!v.trim() || 'Required' })} />
              </Field>
              <Field label="Name" htmlFor="name" required error={errs.name} className="sm:col-span-2">
                <Input id="name" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
              </Field>
              <Field label="Category" htmlFor="category">
                <NativeSelect id="category" {...form.register('categoryId')}>
                  <option value="">Uncategorised</option>
                  {(categories.data ?? []).filter((c) => c.isActive || c.id === item?.categoryId).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Base unit" htmlFor="uom" required error={errs.uomCode} hint={isEdit ? 'Locked once stock has moved' : 'Stock is always held in this unit'}>
                <NativeSelect id="uom" disabled={hasMovements} {...form.register('uomCode', { validate: (v) => !!v || 'Required' })}>
                  <option value="">Select…</option>
                  {(uoms.data ?? []).map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Colour" htmlFor="colour">
                <Input id="colour" {...form.register('colour')} />
              </Field>
            </FormGrid>
          </FormSection>

          {schema.length > 0 && (
            <FormSection title={`${category?.name} specifications`} description="Defined by the category's attribute schema (Inventory → Setup → Categories).">
              <FormGrid cols={3}>
                {schema.map((def) => (
                  <Field key={def.key} label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`} htmlFor={`attr-${def.key}`} required={def.required} error={attrErr(def.key)}>
                    {def.type === 'select' ? (
                      <NativeSelect id={`attr-${def.key}`} {...form.register(`attributes.${def.key}` as `attributes.${string}`)}>
                        <option value="">—</option>
                        {def.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input id={`attr-${def.key}`} type={def.type === 'number' ? 'number' : 'text'} step="any" {...form.register(`attributes.${def.key}` as `attributes.${string}`)} />
                    )}
                  </Field>
                ))}
              </FormGrid>
            </FormSection>
          )}

          <FormSection title="Description">
            <FormGrid>
              <Field label="Description" htmlFor="desc">
                <Textarea id="desc" rows={3} {...form.register('description')} />
              </Field>
              <Field label="Specifications" htmlFor="specs">
                <Textarea id="specs" rows={3} {...form.register('specifications')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Stock policy" description="Used for low-stock alerts and reorder recommendations.">
            <FormGrid cols={3}>
              <Field label="Minimum stock" htmlFor="min">
                <Input id="min" type="number" step="any" min={0} {...form.register('minStock')} />
              </Field>
              <Field label="Reorder level" htmlFor="rl">
                <Input id="rl" type="number" step="any" min={0} {...form.register('reorderLevel')} />
              </Field>
              <Field label="Reorder quantity" htmlFor="rq">
                <Input id="rq" type="number" step="any" min={0} {...form.register('reorderQty')} />
              </Field>
            </FormGrid>
            <div className="flex flex-wrap gap-6 pt-1">
              <Controller
                control={form.control}
                name="trackBatches"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={field.value} onCheckedChange={field.onChange} /> Track batches
                  </label>
                )}
              />
              <Controller
                control={form.control}
                name="requiresInspection"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={field.value} onCheckedChange={field.onChange} /> Inspect on receipt
                  </label>
                )}
              />
              {isEdit && (
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={field.value} onCheckedChange={field.onChange} /> Active
                    </label>
                  )}
                />
              )}
            </div>
          </FormSection>

          <FormSection title="Unit conversions" description="Alternate units for purchasing and receiving, e.g. 1 ROLL = 25 M.">
            <div className="space-y-2">
              {conversions.fields.map((f, i) => (
                <div key={f.id} className="flex flex-wrap items-end gap-2">
                  <Field label="1 ×" htmlFor={`conv-${i}-uom`} className="w-36">
                    <NativeSelect id={`conv-${i}-uom`} {...form.register(`conversions.${i}.uomCode`)}>
                      <option value="">Unit…</option>
                      {(uoms.data ?? []).filter((u) => u.code !== form.watch('uomCode')).map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={`= base units (${form.watch('uomCode') || '—'})`} htmlFor={`conv-${i}-f`} className="w-44">
                    <Input id={`conv-${i}-f`} type="number" step="any" min={0} {...form.register(`conversions.${i}.factorToBase`)} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" onClick={() => conversions.remove(i)} aria-label="Remove conversion">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => conversions.append({ uomCode: '', factorToBase: '' })}>
                <Plus /> Add conversion
              </Button>
            </div>
          </FormSection>

          <FormSection title="Commercial">
            <FormGrid cols={3}>
              <Field label="Standard cost (₹)" htmlFor="cost">
                <Input id="cost" type="number" step="any" min={0} {...form.register('standardCost')} />
              </Field>
              {type === 'PRODUCT' && (
                <Field label="Selling price (₹)" htmlFor="price">
                  <Input id="price" type="number" step="any" min={0} {...form.register('sellingPrice')} />
                </Field>
              )}
              <Field label="GST rate (%)" htmlFor="tax">
                <Input id="tax" type="number" step="any" min={0} max={100} {...form.register('taxRate')} />
              </Field>
              <Field label="HSN code" htmlFor="hsn">
                <Input id="hsn" {...form.register('hsnCode')} />
              </Field>
            </FormGrid>
            <Field label="Remarks" htmlFor="remarks">
              <Textarea id="remarks" rows={2} {...form.register('remarks')} />
            </Field>
          </FormSection>
        </div>
      </Section>
      {error ? <FormError error={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {isEdit ? 'Save changes' : type === 'MATERIAL' ? 'Create material' : 'Create variant'}
        </Button>
      </div>
    </form>
  );
}
