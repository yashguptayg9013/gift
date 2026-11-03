'use client';

import { useParams } from 'next/navigation';
import { ItemDetailView } from '@/components/inventory/item-detail';

export default function VariantDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ItemDetailView id={id} breadcrumbs={[{ label: 'Finished goods', href: '/inventory/products' }, { label: 'Variant' }]} editHref={`/inventory/products/variant/${id}/edit`} />;
}
