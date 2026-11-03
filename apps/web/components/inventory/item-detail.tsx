'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useItem } from '@/lib/api/catalog';
import { useBalances } from '@/lib/api/inventory';
import type { Balance } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatQty, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge, type Crumb, DescriptionList, ErrorState, LoadingRows, PageHeader, Section, Stat, StatusBadge } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { LedgerTable } from './ledger-table';
import { MovementMenu } from './movement-menu';
import { ReservationsTable } from './reservations-table';

const balanceColumns: ColumnDef<Balance, unknown>[] = [
  { id: 'location', header: 'Location', accessorFn: (r) => r.location.code, cell: ({ row }) => <span><span className="font-mono text-xs">{row.original.location.code}</span> <span className="text-muted-foreground">{row.original.location.name}</span></span> },
  { id: 'ltype', header: 'Type', accessorFn: (r) => r.location.type, cell: ({ row }) => <StatusBadge vocabulary="LocationType" value={row.original.location.type} /> },
  { id: 'batch', header: 'Batch', accessorFn: (r) => r.batch?.batchNumber ?? '', cell: ({ row }) => (row.original.batch ? <span>{row.original.batch.batchNumber} <span className="text-xs text-muted-foreground">· {formatDate(row.original.batch.receivedAt)}</span></span> : <span className="text-muted-foreground">—</span>) },
  { accessorKey: 'onHand', header: 'On hand', meta: { numeric: true }, cell: ({ row }) => formatQty(row.original.onHand) },
  { accessorKey: 'reserved', header: 'Reserved', meta: { numeric: true }, cell: ({ row }) => formatQty(row.original.reserved) },
  { accessorKey: 'available', header: 'Available', meta: { numeric: true }, cell: ({ row }) => <span className="font-medium">{formatQty(row.original.available)}</span> },
  { accessorKey: 'lastMovementAt', header: 'Last movement', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatRelative(row.original.lastMovementAt)}</span> },
];

export function ItemDetailView({ id, breadcrumbs, editHref }: { id: string; breadcrumbs: Crumb[]; editHref: string }) {
  const { can } = useAuth();
  const item = useItem(id);
  const balances = useBalances(id);

  const summary = useMemo(() => {
    const rows = balances.data ?? [];
    const usable = rows.filter((b) => b.location.type === 'STORAGE');
    return {
      onHand: rows.reduce((s, b) => s + b.onHand, 0),
      reserved: rows.reduce((s, b) => s + b.reserved, 0),
      available: usable.reduce((s, b) => s + b.available, 0),
      nonUsable: rows.filter((b) => b.location.type !== 'STORAGE').reduce((s, b) => s + b.onHand, 0),
    };
  }, [balances.data]);

  if (item.error) return <ErrorState error={item.error} onRetry={() => item.refetch()} />;
  if (!item.data) return <LoadingRows rows={8} />;
  const it = item.data;
  const uom = it.uom.code;
  const canEdit = it.type === 'MATERIAL' ? can('inventory.item.manage') : can('product.manage');
  const below = it.reorderLevel > 0 && summary.available <= it.reorderLevel;

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {it.name}
            {!it.isActive && <Badge>Inactive</Badge>}
            {it.type === 'PRODUCT' && <StatusBadge vocabulary="ProductStatus" value={it.status} />}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {it.code}
            {it.category ? <span className="font-sans"> · {it.category.name}</span> : null}
          </span>
        }
        actions={
          <>
            {canEdit && (
              <Button asChild>
                <Link href={editHref}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <MovementMenu defaultItemId={it.id} />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 divide-x divide-y rounded-lg border bg-card shadow-xs sm:grid-cols-4 sm:divide-y-0 [&>*]:border-border">
        <Stat loading={balances.isLoading} label="Available" value={formatQty(summary.available, uom)} tone={below ? 'warning' : undefined} hint={it.reorderLevel ? `Reorder at ${formatQty(it.reorderLevel, uom)}` : 'No reorder level set'} />
        <Stat loading={balances.isLoading} label="On hand (all locations)" value={formatQty(summary.onHand, uom)} />
        <Stat loading={balances.isLoading} label="Reserved" value={formatQty(summary.reserved, uom)} />
        <Stat loading={balances.isLoading} label="QC / rejected / other" value={formatQty(summary.nonUsable, uom)} hint="Not available for use" />
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="balances">
          <DataTable columns={balanceColumns} data={balances.data} loading={balances.isFetching} error={balances.error} onRetry={() => balances.refetch()} pageSize={0} />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTable itemId={it.id} />
        </TabsContent>
        <TabsContent value="reservations">
          <ReservationsTable itemId={it.id} openOnly={false} />
        </TabsContent>
        <TabsContent value="details" className="space-y-5">
          <Section title="Specifications">
            <div className="p-4">
              <DescriptionList
                items={[
                  { label: 'Base unit', value: `${it.uom.code}${it.uom.name ? ` — ${it.uom.name}` : ''}` },
                  ...(it.variantName ? [{ label: 'Variant', value: it.variantName }] : []),
                  ...(it.product ? [{ label: 'Product', value: <Link className="text-primary hover:underline" href={`/inventory/products/${it.product.id}`}>{it.product.name}</Link> }] : []),
                  { label: 'Colour', value: it.colour },
                  ...Object.entries(it.attributes ?? {}).map(([k, v]) => {
                    const def = it.category?.attributeSchema?.find((d) => d.key === k);
                    return { label: def?.label ?? k, value: `${v}${def?.unit ? ` ${def.unit}` : ''}` };
                  }),
                  { label: 'Description', value: it.description },
                  { label: 'Specifications', value: it.specifications },
                ]}
              />
            </div>
          </Section>
          <Section title="Policy & commercial">
            <div className="p-4">
              <DescriptionList
                items={[
                  { label: 'Minimum stock', value: formatQty(it.minStock, uom) },
                  { label: 'Reorder level', value: formatQty(it.reorderLevel, uom) },
                  { label: 'Reorder quantity', value: formatQty(it.reorderQty, uom) },
                  { label: 'Batch tracking', value: it.trackBatches ? 'Yes' : 'No' },
                  { label: 'Inspect on receipt', value: it.requiresInspection ? 'Yes' : 'No' },
                  { label: 'Unit conversions', value: it.uomConversions.length ? it.uomConversions.map((c) => `1 ${c.uomCode} = ${c.factorToBase} ${uom}`).join(', ') : 'None' },
                  { label: 'Standard cost', value: formatCurrency(it.standardCost) },
                  { label: 'Last purchase price', value: formatCurrency(it.lastPurchasePrice) },
                  ...(it.type === 'PRODUCT' ? [{ label: 'Selling price', value: formatCurrency(it.sellingPrice) }] : []),
                  { label: 'GST rate', value: it.taxRate != null ? `${it.taxRate}%` : '—' },
                  { label: 'HSN code', value: it.hsnCode },
                  { label: 'Bill of materials', value: it.bom ? `${it.bom.code}${it.bom.versions[0] ? ` · v${it.bom.versions[0].version} active` : ' · no active version'}` : '—' },
                  { label: 'Remarks', value: it.remarks },
                ]}
              />
            </div>
          </Section>
          {it.supplierItems.length > 0 && (
            <Section title="Suppliers">
              <ul className="divide-y">
                {it.supplierItems.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>
                      {s.supplier.name} {s.isPreferred && <Badge tone="success">Preferred</Badge>}
                    </span>
                    <span className="tabular text-muted-foreground">{formatCurrency(s.lastPrice)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
