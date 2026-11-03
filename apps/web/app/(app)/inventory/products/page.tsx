'use client';

import { PRODUCT_STATUS } from '@puja/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCategories, useProducts } from '@/lib/api/catalog';
import type { Product } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounce';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';

export default function ProductsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounced(search);
  const categories = useCategories('PRODUCT');
  const q = useProducts({ search: debounced || undefined, categoryId: categoryId || undefined, status: status || undefined, page, pageSize: 50 });

  const columns = useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Product', enableSorting: false },
      { id: 'category', header: 'Category', enableSorting: false, accessorFn: (r) => r.category?.name ?? '', cell: ({ row }) => row.original.category?.name ?? <span className="text-muted-foreground">—</span> },
      { id: 'variants', header: 'Variants', enableSorting: false, meta: { numeric: true }, accessorFn: (r) => r._count?.variants ?? 0 },
      { id: 'route', header: 'Default route', enableSorting: false, accessorFn: (r) => r.defaultRoute?.name ?? '', cell: ({ row }) => row.original.defaultRoute?.name ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => <StatusBadge vocabulary="ProductStatus" value={row.original.status} /> },
      { accessorKey: 'createdAt', header: 'Created', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Finished goods"
        description="Products and their sellable variants (SKUs)."
        actions={
          can('product.manage') && (
            <Button variant="primary" asChild>
              <Link href="/inventory/products/new">
                <Plus /> New product
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        pagination={q.data ? { meta: q.data.meta, onPageChange: setPage } : undefined}
        search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        exportName="products"
        onRowClick={(r) => router.push(`/inventory/products/${r.id}`)}
        empty={<EmptyState compact title={debounced ? 'No matching products' : 'No products yet'} description={!debounced && can('product.manage') ? 'Create a product, then add its colour or size variants.' : undefined} />}
        toolbar={
          <>
            <NativeSelect aria-label="Category" className="h-7 w-44 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Status" className="h-7 w-36 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {Object.entries(PRODUCT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
    </>
  );
}
