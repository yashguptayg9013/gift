'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';

// ─── Types ───────────────────────────────────────────────────────────

export interface Ref {
  id: string;
  code: string;
  name: string;
}
export interface ItemRef extends Ref {
  uom?: { code: string };
  variantName?: string | null;
}

export interface StageDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultSequence: number;
  isQcStage: boolean;
  isActive: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  _count?: { workers: number };
}

export interface Workstation {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  stageDefinitionId: string | null;
  isActive: boolean;
  department: { id: string; name: string } | null;
  stageDefinition: { id: string; name: string } | null;
}

export interface RouteStep {
  id: string;
  sequence: number;
  stageDefinitionId: string;
  workstationId: string | null;
  instructions: string | null;
  stageDefinition: { id: string; code: string; name: string; isQcStage: boolean };
}

export interface Route {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: RouteStep[];
  _count?: { items: number; products: number };
}

export interface BomAlternative {
  id: string;
  materialId: string;
  conversionFactor: number;
  priority: number;
  notes: string | null;
  material: ItemRef;
}

export interface BomLine {
  id: string;
  lineNo: number;
  materialId: string;
  quantity: number;
  quantityFormula: string | null;
  uomCode: string;
  wastagePercent: number;
  stageDefinitionId: string | null;
  consumptionMode: 'BACKFLUSH' | 'MANUAL';
  specifications: string | null;
  notes: string | null;
  isOptional: boolean;
  material: ItemRef & { colour?: string | null };
  stageDefinition: { id: string; code: string; name: string } | null;
  alternatives: BomAlternative[];
}

export interface BomVersion {
  id: string;
  bomId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  outputQuantity: number;
  notes: string | null;
  activatedAt: string | null;
  createdAt: string;
  lines: BomLine[];
}

export interface Bom {
  id: string;
  code: string;
  name: string;
  itemId: string;
  item: ItemRef & { attributes: Record<string, unknown> };
  versions: BomVersion[];
}

export interface BomSummary {
  id: string;
  code: string;
  name: string;
  updatedAt: string;
  item: Ref & { variantName: string | null };
  versions: { id: string; version: number; status: string; _count: { lines: number } }[];
}

export interface BomLineInput {
  materialId: string;
  quantity?: number;
  quantityFormula?: string;
  uomCode?: string;
  wastagePercent?: number;
  stageDefinitionId?: string;
  consumptionMode?: 'BACKFLUSH' | 'MANUAL';
  specifications?: string;
  notes?: string;
  isOptional?: boolean;
  alternatives?: { materialId: string; conversionFactor?: number; priority?: number }[];
}

export interface BomCompare {
  a: { id: string; version: number; status: string; bom: string; item: string; outputQuantity: number };
  b: { id: string; version: number; status: string; bom: string; item: string; outputQuantity: number };
  rows: { materialId: string; material: ItemRef; change: 'added' | 'removed' | 'changed' | 'same'; differences: { field: string; from: unknown; to: unknown }[] }[];
}

export interface Requirements {
  version: { id: string; version: number; status: string; outputQuantity: number };
  item: Ref;
  quantity: number;
  variables: Record<string, number>;
  lines: {
    bomLineId: string;
    lineNo: number;
    materialId: string;
    material: ItemRef;
    uom: string;
    stage: { name: string } | null;
    consumptionMode: string;
    qtyPerUnit: number;
    wastagePercent: number;
    standardQty: number;
    requiredQty: number;
    available: number | null;
    shortage: number | null;
    isOptional: boolean;
  }[];
}

export type ProductionStatus = 'DRAFT' | 'RELEASED' | 'MATERIALS_RESERVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CANCELLED';
export type StageStatus = 'PENDING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface OrderSummary {
  id: string;
  number: string;
  status: ProductionStatus;
  priority: Priority;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityRejected: number;
  dueDate: string | null;
  createdAt: string;
  item: Ref & { variantName: string | null };
  stageCount: number;
  stagesCompleted: number;
  currentStage: { id: string; name: string; status: StageStatus } | null;
  isDelayed: boolean;
  progress: number;
}

export interface OrderMaterial {
  id: string;
  bomLineId: string | null;
  itemId: string;
  originalItemId: string | null;
  stageDefinitionId: string | null;
  consumptionMode: 'BACKFLUSH' | 'MANUAL';
  qtyPerUnit: number;
  wastagePercent: number;
  requiredQty: number;
  reservedQty: number;
  consumedQty: number;
  wastageQty: number;
  returnedQty: number;
  uomCode: string;
  item: ItemRef;
}

export interface OrderStage {
  id: string;
  sequence: number;
  stageDefinitionId: string;
  workstationId: string | null;
  isQcStage: boolean;
  instructions: string | null;
  status: StageStatus;
  qtyGood: number;
  qtyRejected: number;
  qtyRework: number;
  startedAt: string | null;
  completedAt: string | null;
  pausedSeconds: number;
  remarks: string | null;
  stageDefinition: { id: string; code: string; name: string; isQcStage: boolean };
  workstation: Ref | null;
  assignments: { id: string; workerId: string; worker: Ref }[];
}

export interface OrderOutput {
  id: string;
  stageId: string;
  workerId: string | null;
  worker: { id: string; name: string } | null;
  qtyGood: number;
  qtyRejected: number;
  qtyRework: number;
  remarks: string | null;
  recordedAt: string;
  recordedByName: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  inspectionId: string | null;
}

export interface OrderEvent {
  id: string;
  type: string;
  stageId: string | null;
  quantity: number | null;
  message: string | null;
  createdAt: string;
  createdByName: string | null;
  actorType: string;
}

export interface OrderDetail {
  id: string;
  number: string;
  status: ProductionStatus;
  priority: Priority;
  itemId: string;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityRejected: number;
  quantityRework: number;
  plannedStart: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  remarks: string | null;
  warehouseId: string;
  parameters: Record<string, number>;
  createdAt: string;
  createdByName: string | null;
  isDelayed: boolean;
  item: ItemRef & { attributes: Record<string, unknown> };
  bomVersion: { id: string; version: number; bom: { id: string; code: string } } | null;
  route: Ref | null;
  materials: OrderMaterial[];
  stages: OrderStage[];
  outputs: OrderOutput[];
  events: OrderEvent[];
}

export interface Availability {
  orderId: string;
  number: string;
  status: ProductionStatus;
  allCovered: boolean;
  canReserveAll: boolean;
  lines: {
    id: string;
    item: ItemRef;
    consumptionMode: string;
    requiredQty: number;
    reservedQty: number;
    consumedQty: number;
    wastageQty: number;
    remainingQty: number;
    toReserve: number;
    freeAvailable: number;
    shortage: number;
    status: 'COVERED' | 'AVAILABLE' | 'PARTIAL' | 'SHORT';
    alternatives: { materialId: string; material: Ref; conversionFactor: number; available: number }[];
  }[];
}

export interface StageTask {
  id: string;
  sequence: number;
  status: StageStatus;
  qtyGood: number;
  qtyRejected: number;
  qtyRework: number;
  isQcStage: boolean;
  stageDefinition: { name: string; isQcStage: boolean };
  workstation: { name: string } | null;
  assignments: { worker: { id: string; name: string } }[];
  productionOrder: { id: string; number: string; priority: Priority; dueDate: string | null; quantityPlanned: number; item: { code: string; name: string } };
}

export interface OutputInput {
  qtyGood: number;
  qtyRejected?: number;
  qtyRework?: number;
  workerId?: string;
  defectCategoryId?: string;
  remarks?: string;
  checklistId?: string;
  checklistResults?: { checklistItemId: string; passed?: boolean; numericValue?: number; textValue?: string }[];
  defects?: { defectCategoryId: string; quantity: number }[];
}

// ─── Keys ────────────────────────────────────────────────────────────

export const mfgKeys = {
  all: ['mfg'] as const,
  stages: (inactive?: boolean) => ['mfg', 'stages', !!inactive] as const,
  departments: () => ['mfg', 'departments'] as const,
  workstations: () => ['mfg', 'workstations'] as const,
  routes: () => ['mfg', 'routes'] as const,
  boms: (p: object) => ['mfg', 'boms', p] as const,
  bom: (id: string) => ['mfg', 'bom', id] as const,
  bomByItem: (itemId: string) => ['mfg', 'bom-item', itemId] as const,
  compare: (a: string, b: string) => ['mfg', 'compare', a, b] as const,
};

export const prodKeys = {
  all: ['production'] as const,
  orders: (p: object) => ['production', 'orders', p] as const,
  order: (id: string) => ['production', 'order', id] as const,
  availability: (id: string) => ['production', 'availability', id] as const,
  tasks: (p: object) => ['production', 'tasks', p] as const,
};

// ─── Config hooks ────────────────────────────────────────────────────

export function useStages(includeInactive = false) {
  return useQuery({ queryKey: mfgKeys.stages(includeInactive), queryFn: ({ signal }) => api.get<StageDefinition[]>(`/manufacturing/stages${qs({ includeInactive: includeInactive || undefined })}`, signal), staleTime: 60_000 });
}
export function useDepartments() {
  return useQuery({ queryKey: mfgKeys.departments(), queryFn: ({ signal }) => api.get<Department[]>('/manufacturing/departments', signal), staleTime: 60_000 });
}
export function useWorkstations(enabled = true) {
  return useQuery({ queryKey: mfgKeys.workstations(), queryFn: ({ signal }) => api.get<Workstation[]>('/manufacturing/workstations', signal), staleTime: 60_000, enabled });
}
export function useRoutes() {
  return useQuery({ queryKey: mfgKeys.routes(), queryFn: ({ signal }) => api.get<Route[]>('/manufacturing/routes', signal), staleTime: 60_000 });
}

// ─── BOM hooks ───────────────────────────────────────────────────────

export function useBoms(p: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({ queryKey: mfgKeys.boms(p), queryFn: ({ signal }) => api.get<Paged<BomSummary>>(`/boms${qs(p)}`, signal), placeholderData: (prev) => prev });
}
export function useBom(id: string | undefined) {
  return useQuery({ queryKey: mfgKeys.bom(id ?? ''), queryFn: ({ signal }) => api.get<Bom>(`/boms/${id}`, signal), enabled: !!id });
}
export function useBomByItem(itemId: string | undefined) {
  return useQuery({ queryKey: mfgKeys.bomByItem(itemId ?? ''), queryFn: ({ signal }) => api.get<Bom | null>(`/boms/by-item/${itemId}`, signal), enabled: !!itemId });
}
export function useBomCompare(a: string | undefined, b: string | undefined) {
  return useQuery({ queryKey: mfgKeys.compare(a ?? '', b ?? ''), queryFn: ({ signal }) => api.get<BomCompare>(`/boms/compare${qs({ a, b })}`, signal), enabled: !!a && !!b && a !== b });
}

// ─── Production hooks ────────────────────────────────────────────────

export interface OrderQuery {
  status?: string;
  priority?: string;
  delayed?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useOrders(p: OrderQuery) {
  return useQuery({ queryKey: prodKeys.orders(p), queryFn: ({ signal }) => api.get<Paged<OrderSummary>>(`/production/orders${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}
export function useOrder(id: string | undefined) {
  return useQuery({ queryKey: prodKeys.order(id ?? ''), queryFn: ({ signal }) => api.get<OrderDetail>(`/production/orders/${id}`, signal), enabled: !!id });
}
export function useAvailability(id: string | undefined, enabled = true) {
  return useQuery({ queryKey: prodKeys.availability(id ?? ''), queryFn: ({ signal }) => api.get<Availability>(`/production/orders/${id}/availability`, signal), enabled: !!id && enabled });
}
export function useTasks(p: { all?: boolean; workerId?: string }) {
  return useQuery({ queryKey: prodKeys.tasks(p), queryFn: ({ signal }) => api.get<StageTask[]>(`/production/tasks${qs({ all: p.all || undefined, workerId: p.workerId })}`, signal), refetchInterval: 30_000 });
}

export const productionApi = {
  create: (body: object) => api.post<OrderDetail>('/production/orders', body),
  update: (id: string, body: object) => api.patch<OrderDetail>(`/production/orders/${id}`, body),
  action: (id: string, action: 'release' | 'reserve' | 'release-reservations' | 'close', body: object = {}) => api.post<OrderDetail | { order: OrderDetail }>(`/production/orders/${id}/${action}`, body),
  cancel: (id: string, reason: string) => api.post<OrderDetail>(`/production/orders/${id}/cancel`, { reason }),
  remark: (id: string, message: string, stageId?: string) => api.post<OrderDetail>(`/production/orders/${id}/remarks`, { message, stageId }),
  material: (id: string, kind: 'issue-material' | 'wastage' | 'return-material', body: object, idempotencyKey: string) => api.post<OrderDetail>(`/production/orders/${id}/${kind}`, body, { idempotencyKey }),
  substitute: (id: string, materialLineId: string, alternativeMaterialId: string) => api.post<OrderDetail>(`/production/orders/${id}/substitute`, { materialLineId, alternativeMaterialId }),
  stage: (stageId: string, action: 'start' | 'pause' | 'complete' | 'skip', body: object = {}) => api.post<OrderDetail>(`/production/stages/${stageId}/${action}`, body),
  output: (stageId: string, body: OutputInput, idempotencyKey: string) => api.post<{ replayed: boolean; output: OrderOutput; order: OrderDetail }>(`/production/stages/${stageId}/output`, body, { idempotencyKey }),
  workers: (stageId: string, workerIds: string[]) => api.put<OrderDetail>(`/production/stages/${stageId}/workers`, { workerIds }),
  workstation: (stageId: string, workstationId: string | null) => api.put<OrderDetail>(`/production/stages/${stageId}/workstation`, { workstationId: workstationId ?? undefined }),
  reverse: (outputId: string, reason: string) => api.post<OrderDetail>(`/production/outputs/${outputId}/reverse`, { reason }),
};
