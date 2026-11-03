'use client';

import { ProductForm } from '@/components/inventory/product-form';
import { PageHeader } from '@/components/ui/feedback';

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" description="A product groups its sellable variants. Add variants after saving." breadcrumbs={[{ label: 'Finished goods', href: '/inventory/products' }, { label: 'New' }]} />
      <ProductForm />
    </>
  );
}
