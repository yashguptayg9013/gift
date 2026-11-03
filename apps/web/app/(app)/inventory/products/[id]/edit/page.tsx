'use client';

import { useParams } from 'next/navigation';
import { useProduct } from '@/lib/api/catalog';
import { ProductForm } from '@/components/inventory/product-form';
import { ErrorState, LoadingRows, PageHeader } from '@/components/ui/feedback';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const p = useProduct(id);
  if (p.error) return <ErrorState error={p.error} onRetry={() => p.refetch()} />;
  if (!p.data) return <LoadingRows />;
  return (
    <>
      <PageHeader title={`Edit ${p.data.name}`} breadcrumbs={[{ label: 'Finished goods', href: '/inventory/products' }, { label: p.data.code, href: `/inventory/products/${id}` }, { label: 'Edit' }]} />
      <ProductForm product={p.data} />
    </>
  );
}
