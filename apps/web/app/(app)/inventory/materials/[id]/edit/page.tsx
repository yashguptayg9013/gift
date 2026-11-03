'use client';

import { useParams } from 'next/navigation';
import { useItem } from '@/lib/api/catalog';
import { ItemForm } from '@/components/inventory/item-form';
import { ErrorState, LoadingRows, PageHeader } from '@/components/ui/feedback';

export default function EditMaterialPage() {
  const { id } = useParams<{ id: string }>();
  const item = useItem(id);
  if (item.error) return <ErrorState error={item.error} onRetry={() => item.refetch()} />;
  if (!item.data) return <LoadingRows />;
  return (
    <>
      <PageHeader title={`Edit ${item.data.code}`} breadcrumbs={[{ label: 'Materials', href: '/inventory/materials' }, { label: item.data.code, href: `/inventory/materials/${id}` }, { label: 'Edit' }]} />
      <ItemForm type={item.data.type} item={item.data} />
    </>
  );
}
