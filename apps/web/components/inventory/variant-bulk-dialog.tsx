'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { api } from '@/lib/api/client';
import { catalogKeys } from '@/lib/api/catalog';
import { inventoryKeys } from '@/lib/api/inventory';
import { useApiMutation } from '@/lib/api/hooks';
import type { ProductDetail } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field, FormGrid, optionalNumber } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

interface Row {
  variantName: string;
  code: string;
  sellingPrice: string;
}
interface Values {
  names: string;
  taxRate: string;
  hsnCode: string;
  minStock: string;
  rows: Row[];
}

const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);

/** Bulk-create colour/size variants. Names are entered by the user — nothing is pre-filled. */
export function VariantBulkDialog({ product, open, onOpenChange }: { product: ProductDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<Values>({ defaultValues: { names: '', taxRate: '', hsnCode: '', minStock: '', rows: [] } });
  const rows = useFieldArray({ control: form.control, name: 'rows' });
  const create = useApiMutation(
    (v: Values) =>
      api.post(`/products/${product.id}/variants`, {
        variants: v.rows.map((r) => ({
          variantName: r.variantName.trim(),
          code: r.code.trim().toUpperCase(),
          colour: r.variantName.trim(),
          sellingPrice: optionalNumber(r.sellingPrice),
          taxRate: optionalNumber(v.taxRate),
          hsnCode: v.hsnCode.trim() || undefined,
          minStock: optionalNumber(v.minStock),
        })),
      }),
    {
      invalidate: [catalogKeys.all, inventoryKeys.all],
      success: (r) => `${(r as unknown[]).length} variant(s) created`,
      silentError: true,
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );

  const generate = () => {
    const names = form
      .getValues('names')
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean);
    const existing = new Set(form.getValues('rows').map((r) => r.variantName.toLowerCase()));
    for (const n of names) {
      if (existing.has(n.toLowerCase())) continue;
      rows.append({ variantName: n, code: `${product.code}-${slug(n)}`, sellingPrice: '' });
    }
    form.setValue('names', '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={`Add variants to ${product.name}`}
        description="Each variant becomes its own SKU with independent stock and bill of materials."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="variants-form" disabled={!rows.fields.length} loading={create.isPending}>
              Create {rows.fields.length || ''} variant{rows.fields.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <form id="variants-form" className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
          <div className="flex items-end gap-2">
            <Field label="Variant names" htmlFor="v-names" hint="Comma or line separated, e.g. colours" className="flex-1">
              <Input
                id="v-names"
                {...form.register('names')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    generate();
                  }
                }}
              />
            </Field>
            <Button type="button" onClick={generate}>
              <Plus /> Add
            </Button>
          </div>
          {rows.fields.length > 0 && (
            <div className="space-y-2">
              {rows.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 items-end gap-2">
                  <Field label={i === 0 ? 'Variant' : ''} htmlFor={`v-${i}-n`} className="col-span-4">
                    <Input id={`v-${i}-n`} aria-label="Variant name" {...form.register(`rows.${i}.variantName`, { validate: (v) => !!v.trim() || 'Required' })} />
                  </Field>
                  <Field label={i === 0 ? 'SKU' : ''} htmlFor={`v-${i}-c`} className="col-span-4" error={form.formState.errors.rows?.[i]?.code}>
                    <Input id={`v-${i}-c`} aria-label="SKU" className="font-mono text-xs uppercase" {...form.register(`rows.${i}.code`, { validate: (v) => !!v.trim() || 'Required' })} />
                  </Field>
                  <Field label={i === 0 ? 'Price (₹)' : ''} htmlFor={`v-${i}-p`} className="col-span-3">
                    <Input id={`v-${i}-p`} aria-label="Selling price" type="number" step="any" min={0} {...form.register(`rows.${i}.sellingPrice`)} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => rows.remove(i)} aria-label="Remove variant">
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <FormGrid cols={3}>
            <Field label="GST rate (%) for all" htmlFor="v-tax">
              <Input id="v-tax" type="number" step="any" min={0} max={100} {...form.register('taxRate')} />
            </Field>
            <Field label="HSN code for all" htmlFor="v-hsn">
              <Input id="v-hsn" {...form.register('hsnCode')} />
            </Field>
            <Field label="Minimum stock for all" htmlFor="v-min">
              <Input id="v-min" type="number" step="any" min={0} {...form.register('minStock')} />
            </Field>
          </FormGrid>
          {create.error ? <FormError error={create.error} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
