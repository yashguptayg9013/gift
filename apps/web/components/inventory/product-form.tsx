'use client';

import { PRODUCT_STATUS } from '@puja/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { catalogKeys, useCategories } from '@/lib/api/catalog';
import type { ProductDetail, ProductStatus } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { FormError, Section } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';

interface Values {
  code: string;
  name: string;
  categoryId: string;
  description: string;
  manufacturingSpecs: string;
  status: ProductStatus;
}

export function ProductForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useCategories('PRODUCT');
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    defaultValues: {
      code: product?.code ?? '',
      name: product?.name ?? '',
      categoryId: product?.categoryId ?? '',
      description: product?.description ?? '',
      manufacturingSpecs: product?.manufacturingSpecs ?? '',
      status: product?.status ?? 'ACTIVE',
    },
  });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = {
      name: v.name.trim(),
      categoryId: v.categoryId || undefined,
      description: v.description.trim() || undefined,
      manufacturingSpecs: v.manufacturingSpecs.trim() || undefined,
      status: v.status,
    };
    try {
      const saved = product ? await api.put<ProductDetail>(`/products/${product.id}`, body) : await api.post<ProductDetail>('/products', { ...body, code: v.code.trim().toUpperCase() });
      await qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast.success(product ? 'Product saved' : `${saved.name} created — now add its variants`);
      router.push(`/inventory/products/${saved.id}`);
    } catch (e) {
      setError(e);
    }
  });
  const errs = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Section>
        <div className="space-y-4 p-4 sm:p-5">
          <FormGrid cols={3}>
            <Field label="Product code" htmlFor="p-code" required error={errs.code} hint={product ? 'Codes cannot be changed' : 'e.g. A5-NB-COVER'}>
              <Input id="p-code" className="font-mono uppercase" disabled={!!product} {...form.register('code', { validate: (v) => !!product || !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Name" htmlFor="p-name" required error={errs.name} className="sm:col-span-2">
              <Input id="p-name" placeholder="A5 Notebook Cover" {...form.register('name', { validate: (v) => !!v.trim() || 'Required' })} />
            </Field>
            <Field label="Category" htmlFor="p-cat">
              <NativeSelect id="p-cat" {...form.register('categoryId')}>
                <option value="">Uncategorised</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" htmlFor="p-status">
              <NativeSelect id="p-status" {...form.register('status')}>
                {Object.entries(PRODUCT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Description" htmlFor="p-desc">
              <Textarea id="p-desc" rows={4} {...form.register('description')} />
            </Field>
            <Field label="Manufacturing specifications" htmlFor="p-specs" hint="Construction notes shared by all variants">
              <Textarea id="p-specs" rows={4} {...form.register('manufacturingSpecs')} />
            </Field>
          </FormGrid>
        </div>
      </Section>
      {error ? <FormError error={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {product ? 'Save product' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
