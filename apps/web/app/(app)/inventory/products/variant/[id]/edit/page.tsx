'use client';

import { useParams } from 'next/navigation';
import { useItem } from '@/lib/api/catalog';
import { ItemForm } from '@/components/inventory/item-form';
import { ErrorState, LoadingRows, PageHeader } from '@/components/ui/feedback';

export default function EditVariantPage() {
  const { id } = useParams<{ id: string }>();
  const item = useItem(id);
  if (item.error) return <ErrorState error={item.error} onRetry={() => item.refetch()} />;
  if (!item.data) return <LoadingRows />;
  return (
    <>
      <PageHeader title={`Edit ${item.data.code}`} breadcrumbs={[{ label: 'Finished goods', href: '/inventory/products' }, { label: item.data.code, href: `/inventory/products/variant/${id}` }, { label: 'Edit' }]} />
      <ItemForm type="PRODUCT" item={item.data} />
    </>
  );
}
