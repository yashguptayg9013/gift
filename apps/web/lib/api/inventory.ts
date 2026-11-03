'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';
import type { Approval, Balance, ItemType, Movement, Reservation, StockCountDetail, StockCountSummary, StockRow, TxDetail, TxHeader } from './types';

export const inventoryKeys = {
  all: ['inventory'] as const,
  stock: (p: object) => ['inventory', 'stock', p] as const,
  balances: (itemId: string) => ['inventory', 'balances', itemId] as const,
  movements: (p: object) => ['inventory', 'movements', p] as const,
  transactions: (p: object) => ['inventory', 'transactions', p] as const,
  transaction: (id: string) => ['inventory', 'transaction', id] as const,
  reservations: (p: object) => ['inventory', 'reservations', p] as const,
  counts: (p: object) => ['inventory', 'counts', p] as const,
  count: (id: string) => ['inventory', 'count', id] as const,
};

export interface StockQuery {
  type?: ItemType;
  categoryId?: string;
  search?: string;
  warehouseId?: string;
  lowStockOnly?: boolean;
}

export function useStock(p: StockQuery) {
  return useQuery({ queryKey: inventoryKeys.stock(p), queryFn: ({ signal }) => api.get<StockRow[]>(`/inventory/stock${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}

export function useBalances(itemId: string | undefined) {
  return useQuery({ queryKey: inventoryKeys.balances(itemId ?? ''), queryFn: ({ signal }) => api.get<Balance[]>(`/inventory/stock/${itemId}/balances`, signal), enabled: !!itemId });
}

export interface MovementQuery {
  itemId?: string;
  locationId?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useMovements(p: MovementQuery, enabled = true) {
  return useQuery({ queryKey: inventoryKeys.movements(p), queryFn: ({ signal }) => api.get<Paged<Movement>>(`/inventory/movements${qs({ ...p })}`, signal), enabled, placeholderData: (prev) => prev });
}

export function useTransactions(p: MovementQuery) {
  return useQuery({ queryKey: inventoryKeys.transactions(p), queryFn: ({ signal }) => api.get<Paged<TxHeader>>(`/inventory/transactions${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}

export function useTransaction(id: string | undefined) {
  return useQuery({ queryKey: inventoryKeys.transaction(id ?? ''), queryFn: ({ signal }) => api.get<TxDetail>(`/inventory/transactions/${id}`, signal), enabled: !!id });
}

export function useReservations(p: { itemId?: string; sourceType?: string; openOnly?: boolean }) {
  return useQuery({ queryKey: inventoryKeys.reservations(p), queryFn: ({ signal }) => api.get<Reservation[]>(`/inventory/reservations${qs({ ...p })}`, signal) });
}

export function useStockCounts(p: { status?: string; page?: number }) {
  return useQuery({ queryKey: inventoryKeys.counts(p), queryFn: ({ signal }) => api.get<Paged<StockCountSummary>>(`/inventory/stock-counts${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}

export function useStockCount(id: string | undefined) {
  return useQuery({ queryKey: inventoryKeys.count(id ?? ''), queryFn: ({ signal }) => api.get<StockCountDetail>(`/inventory/stock-counts/${id}`, signal), enabled: !!id });
}

export interface QtyLineInput {
  itemId: string;
  quantity: number;
  uomCode?: string;
  locationId?: string;
  batchId?: string;
  batchNumber?: string;
  unitCost?: number;
}

export type MovementKind = 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'damage' | 'return';

export const MOVEMENT_ENDPOINT: Record<MovementKind, string> = {
  receipt: '/inventory/receipts',
  issue: '/inventory/issues',
  transfer: '/inventory/transfers',
  adjustment: '/inventory/adjustments',
  damage: '/inventory/damage',
  return: '/inventory/returns',
};

export type AdjustmentResult = { status: 'POSTED'; transaction: TxDetail } | { status: 'PENDING_APPROVAL'; approval: Approval };

export function postMovement(kind: MovementKind, body: object, idempotencyKey: string) {
  return api.post<TxDetail | AdjustmentResult>(MOVEMENT_ENDPOINT[kind], body, { idempotencyKey });
}
