'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';
import type { Category, Item, ItemDetail, ItemType, Product, ProductDetail, SearchResult, Uom, Warehouse } from './types';

export const catalogKeys = {
  all: ['catalog'] as const,
  uoms: () => ['catalog', 'uoms'] as const,
  categories: (type?: ItemType) => ['catalog', 'categories', type ?? 'all'] as const,
  warehouses: () => ['catalog', 'warehouses'] as const,
  items: (params: object) => ['catalog', 'items', params] as const,
  item: (id: string) => ['catalog', 'item', id] as const,
  products: (params: object) => ['catalog', 'products', params] as const,
  product: (id: string) => ['catalog', 'product', id] as const,
};

export function useUoms() {
  return useQuery({ queryKey: catalogKeys.uoms(), queryFn: ({ signal }) => api.get<Uom[]>('/uoms', signal), staleTime: 5 * 60_000 });
}

export function useCategories(type?: ItemType) {
  return useQuery({ queryKey: catalogKeys.categories(type), queryFn: ({ signal }) => api.get<Category[]>(`/categories${qs({ type })}`, signal), staleTime: 60_000 });
}

export function useWarehouses() {
  return useQuery({ queryKey: catalogKeys.warehouses(), queryFn: ({ signal }) => api.get<Warehouse[]>('/warehouses', signal), staleTime: 60_000 });
}

export interface ItemQuery {
  type?: ItemType;
  categoryId?: string;
  productId?: string;
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const fetchItems = (p: ItemQuery, signal?: AbortSignal) => api.get<Paged<Item>>(`/items${qs({ ...p })}`, signal);

export function useItems(p: ItemQuery) {
  return useQuery({ queryKey: catalogKeys.items(p), queryFn: ({ signal }) => fetchItems(p, signal), placeholderData: (prev) => prev });
}

export function useItem(id: string | undefined) {
  return useQuery({ queryKey: catalogKeys.item(id ?? ''), queryFn: ({ signal }) => api.get<ItemDetail>(`/items/${id}`, signal), enabled: !!id });
}

export function useProducts(p: { search?: string; categoryId?: string; status?: string; page?: number; pageSize?: number }) {
  return useQuery({ queryKey: catalogKeys.products(p), queryFn: ({ signal }) => api.get<Paged<Product>>(`/products${qs(p)}`, signal), placeholderData: (prev) => prev });
}

export function useProduct(id: string | undefined) {
  return useQuery({ queryKey: catalogKeys.product(id ?? ''), queryFn: ({ signal }) => api.get<ProductDetail>(`/products/${id}`, signal), enabled: !!id });
}

export const searchAll = (q: string, signal?: AbortSignal) => api.get<SearchResult[]>(`/search${qs({ q })}`, signal);

/** Loader for item pickers (AsyncCombobox). */
export async function loadItemOptions(search: string, type?: ItemType) {
  const res = await fetchItems({ search: search || undefined, type, pageSize: 25 });
  return res.data.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}`, description: `${i.uom.code}${i.category ? ` · ${i.category.name}` : ''}` }));
}
