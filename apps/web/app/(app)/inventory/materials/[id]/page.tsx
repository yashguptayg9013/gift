'use client';

import { useParams } from 'next/navigation';
import { ItemDetailView } from '@/components/inventory/item-detail';

export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ItemDetailView id={id} breadcrumbs={[{ label: 'Materials', href: '/inventory/materials' }, { label: 'Detail' }]} editHref={`/inventory/materials/${id}/edit`} />;
}
