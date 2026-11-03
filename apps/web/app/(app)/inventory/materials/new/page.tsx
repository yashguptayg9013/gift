'use client';

import { ItemForm } from '@/components/inventory/item-form';
import { PageHeader } from '@/components/ui/feedback';

export default function NewMaterialPage() {
  return (
    <>
      <PageHeader title="New material" breadcrumbs={[{ label: 'Materials', href: '/inventory/materials' }, { label: 'New' }]} />
      <ItemForm type="MATERIAL" />
    </>
  );
}
