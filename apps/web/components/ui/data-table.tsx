'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Search, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import type { Paged } from '@/lib/api/client';
import { formatInteger } from '@/lib/format';
import { cn, downloadText, toCsv } from '@/lib/utils';
import { Button } from './button';
import { EmptyState, ErrorState, LoadingRows } from './feedback';
import { Input } from './input';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './overlays';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** right-align numeric columns */
    numeric?: boolean;
    /** value used for CSV export when the cell renders JSX */
    csv?: (row: TData) => string | number | null | undefined;
    className?: string;
    headerLabel?: string;
  }
}

export interface ServerPagination {
  meta: Paged<unknown>['meta'];
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  /** client-side search box (filters all columns) */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** controlled search (e.g. server-side) — when set the box drives this instead of client filtering */
  search?: { value: string; onChange: (v: string) => void };
  toolbar?: React.ReactNode;
  pagination?: ServerPagination;
  /** client-side page size; 0 disables client pagination */
  pageSize?: number;
  exportName?: string;
  empty?: React.ReactNode;
  initialSorting?: SortingState;
  initialHidden?: VisibilityState;
  className?: string;
  dense?: boolean;
  getRowId?: (row: T) => string;
  maxHeight?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  onRowClick,
  searchable,
  searchPlaceholder = 'Search…',
  search,
  toolbar,
  pagination,
  pageSize = 50,
  exportName,
  empty,
  initialSorting = [],
  initialHidden = {},
  className,
  dense,
  getRowId,
  maxHeight,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialHidden);
  const clientPaging = !pagination && pageSize > 0;

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting, globalFilter, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(clientPaging ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize, pageIndex: 0 } } } : {}),
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    globalFilterFn: 'includesString',
  });

  const exportCsv = () => {
    const cols = table.getVisibleLeafColumns().filter((c) => c.id !== 'actions' && c.id !== 'select');
    const header = cols.map((c) => c.columnDef.meta?.headerLabel ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const rows = table.getFilteredRowModel().rows.map((r) =>
      cols.map((c) => {
        const csv = c.columnDef.meta?.csv;
        if (csv) return csv(r.original);
        const v = r.getValue(c.id);
        return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as string | number);
      }),
    );
    downloadText(`${exportName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([header, ...rows]));
  };

  const rows = table.getRowModel().rows;
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== 'actions');
  const showToolbar = searchable || search || toolbar || exportName || hideable.length > 3;

  return (
    <div className={cn('flex min-w-0 flex-col rounded-lg border bg-card shadow-xs', className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {(searchable || search) && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                aria-label="Search table"
                placeholder={searchPlaceholder}
                className="h-7 pl-7 text-sm"
                value={search ? search.value : globalFilter}
                onChange={(e) => (search ? search.onChange(e.target.value) : setGlobalFilter(e.target.value))}
              />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-1">
            {hideable.length > 3 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Columns">
                    <SlidersHorizontal /> <span className="hidden sm:inline">Columns</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideable.map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                      {c.columnDef.meta?.headerLabel ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {exportName && (
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!rows.length} aria-label="Export CSV">
                <Download /> <span className="hidden sm:inline">CSV</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading && !data ? (
        <LoadingRows />
      ) : (
        <div className="relative min-w-0 overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-subtle">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b">
                  {hg.headers.map((h) => {
                    const sortable = h.column.getCanSort();
                    const dir = h.column.getIsSorted();
                    const numeric = h.column.columnDef.meta?.numeric;
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                        className={cn('h-8 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', numeric && 'text-right', h.column.columnDef.meta?.className)}
                        style={h.column.columnDef.size && h.column.columnDef.size !== 150 ? { width: h.column.columnDef.size } : undefined}
                      >
                        {h.isPlaceholder ? null : sortable ? (
                          <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn('inline-flex items-center gap-1 hover:text-foreground', numeric && 'flex-row-reverse')}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {dir === 'asc' ? <ArrowUp className="size-3" /> : dir === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length}>{empty ?? <EmptyState compact title={globalFilter ? 'No matching rows' : 'No records yet'} />}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row.original) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn('border-b last:border-b-0 hover:bg-subtle/80', onRowClick && 'cursor-pointer focus-visible:bg-muted focus-visible:outline-none', loading && 'opacity-60')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn('px-3 align-middle', dense ? 'py-1.5' : 'py-2', cell.column.columnDef.meta?.numeric && 'tabular text-right whitespace-nowrap', cell.column.columnDef.meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.meta.total > 0 && (
        <Pager page={pagination.meta.page} pageCount={pagination.meta.pageCount} total={pagination.meta.total} onPage={pagination.onPageChange} />
      )}
      {clientPaging && table.getPageCount() > 1 && (
        <Pager page={table.getState().pagination.pageIndex + 1} pageCount={table.getPageCount()} total={table.getFilteredRowModel().rows.length} onPage={(p) => table.setPageIndex(p - 1)} />
      )}
    </div>
  );
}

function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular">{formatInteger(total)} records</span>
      <div className="flex items-center gap-1">
        <span className="tabular mr-2">
          Page {page} of {Math.max(pageCount, 1)}
        </span>
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
