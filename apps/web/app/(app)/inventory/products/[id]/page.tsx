'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useProduct } from '@/lib/api/catalog';
import { useStock } from '@/lib/api/inventory';
import type { ProductDetail } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatQty } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, DescriptionList, EmptyState, ErrorState, LoadingRows, PageHeader, Section, StatusBadge, StockStatusBadge } from '@/components/ui/feedback';
import { VariantBulkDialog } from '@/components/inventory/variant-bulk-dialog';

type Variant = ProductDetail['variants'][number] & { stock?: { available: number; onHand: number; reserved: number; stockStatus: 'OK' | 'LOW' | 'OUT' } };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const p = useProduct(id);
  // /inventory/stock has no productId filter; fetch finished goods and join by variant id.
  const stock = useStock({ type: 'PRODUCT' });
  const [bulk, setBulk] = useState(false);

  const variants = useMemo<Variant[]>(() => {
    const byId = new Map((stock.data ?? []).map((s) => [s.id, s]));
    return (p.data?.variants ?? []).map((v) => ({ ...v, stock: byId.get(v.id) }));
  }, [p.data, stock.data]);

  const columns = useMemo<ColumnDef<Variant, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'SKU', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'variantName', header: 'Variant' },
      { accessorKey: 'colour', header: 'Colour', cell: ({ row }) => row.original.colour ?? '—' },
      { id: 'available', header: 'Available', meta: { numeric: true }, accessorFn: (r) => r.stock?.available ?? 0, cell: ({ row }) => (row.original.stock ? formatQty(row.original.stock.available, row.original.uom.code) : '—') },
      { id: 'reserved', header: 'Reserved', meta: { numeric: true }, accessorFn: (r) => r.stock?.reserved ?? 0, cell: ({ row }) => formatQty(row.original.stock?.reserved ?? 0) },
      { id: 'stockStatus', header: 'Stock', accessorFn: (r) => r.stock?.stockStatus ?? '', cell: ({ row }) => (row.original.stock ? <StockStatusBadge status={row.original.stock.stockStatus} /> : '—') },
      { accessorKey: 'sellingPrice', header: 'Price', meta: { numeric: true }, cell: ({ row }) => formatCurrency(row.original.sellingPrice) },
      { id: 'bom', header: 'BOM', accessorFn: (r) => (r.bom?.versions[0] ? `v${r.bom.versions[0].version}` : ''), cell: ({ row }) => (row.original.bom?.versions[0] ? <Badge tone="success">v{row.original.bom.versions[0].version} active</Badge> : <span className="text-xs text-muted-foreground">None</span>) },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge vocabulary="ProductStatus" value={row.original.status} /> },
    ],
    [],
  );

  if (p.error) return <ErrorState error={p.error} onRetry={() => p.refetch()} />;
  if (!p.data) return <LoadingRows rows={8} />;
  const prod = p.data;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Finished goods', href: '/inventory/products' }, { label: prod.code }]}
        title={
          <span className="flex items-center gap-2">
            {prod.name} <StatusBadge vocabulary="ProductStatus" value={prod.status} />
          </span>
        }
        description={<span className="font-mono text-xs">{prod.code}</span>}
        actions={
          can('product.manage') && (
            <>
              <Button asChild>
                <Link href={`/inventory/products/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <Button variant="primary" onClick={() => setBulk(true)}>
                <Plus /> Add variants
              </Button>
            </>
          )
        }
      />
      <Section className="mb-5">
        <div className="p-4">
          <DescriptionList
            items={[
              { label: 'Category', value: prod.category?.name },
              { label: 'Default route', value: prod.defaultRoute?.name },
              { label: 'Variants', value: prod.variants.length },
              { label: 'Description', value: prod.description },
              { label: 'Manufacturing specifications', value: prod.manufacturingSpecs },
            ]}
          />
        </div>
      </Section>
      <Section title="Variants" description="Each variant is a SKU with its own stock and bill of materials." bodyClassName="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
        <DataTable
          columns={columns}
          data={variants}
          loading={stock.isFetching && !stock.data}
          pageSize={0}
          exportName={`variants-${prod.code}`}
          onRowClick={(r) => router.push(`/inventory/products/variant/${r.id}`)}
          empty={<EmptyState compact title="No variants yet" description={can('product.manage') ? 'Add colour or size variants to start stocking this product.' : undefined} />}
        />
      </Section>
      {can('product.manage') && <VariantBulkDialog product={prod} open={bulk} onOpenChange={setBulk} />}
    </>
  );
}
