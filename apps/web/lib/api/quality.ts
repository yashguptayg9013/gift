'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';

export type QcScope = 'MATERIAL' | 'PRODUCT' | 'BOTH';
export type QcCheckType = 'PASS_FAIL' | 'NUMERIC' | 'TEXT';
export type InspectionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InspectionType = 'MATERIAL_RECEIPT' | 'IN_PROCESS' | 'FINAL' | 'RANDOM';

export interface DefectCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  appliesTo: QcScope;
  isActive: boolean;
}

export interface ChecklistItem {
  id: string;
  sequence: number;
  label: string;
  type: QcCheckType;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  isRequired: boolean;
}

export interface Checklist {
  id: string;
  name: string;
  description: string | null;
  appliesTo: QcScope;
  itemId: string | null;
  productId: string | null;
  categoryId: string | null;
  isActive: boolean;
  items: ChecklistItem[];
}

export interface InspectionSummary {
  id: string;
  number: string;
  type: InspectionType;
  status: InspectionStatus;
  quantityInspected: number;
  quantityAccepted: number;
  quantityRejected: number;
  quantityRework: number;
  createdAt: string;
  completedAt: string | null;
  item: { id: string; code: string; name: string };
  inspector: { id: string; name: string } | null;
  productionOrder: { id: string; number: string } | null;
}

export interface InspectionDetail extends InspectionSummary {
  remarks: string | null;
  startedAt: string | null;
  goodsReceiptLineId: string | null;
  item: { id: string; code: string; name: string; uom: { code: string } };
  checklist: Checklist | null;
  results: { id: string; checklistItemId: string; passed: boolean | null; numericValue: number | null; textValue: string | null; note: string | null }[];
  defects: { id: string; quantity: number; note: string | null; defectCategory: { id: string; code: string; name: string } }[];
  goodsReceiptLine: { id: string; goodsReceipt: { id: string; number: string; supplier: { name: string } } } | null;
}

export interface QualitySummary {
  byItem: {
    item: { id: string; code: string; name: string } | undefined;
    type: InspectionType;
    inspections: number;
    inspected: number;
    accepted: number;
    rejected: number;
    rework: number;
    rejectionRate: number | null;
  }[];
  byDefect: { defectCategory: { id: string; code: string; name: string } | undefined; quantity: number }[];
}

export const qualityKeys = {
  all: ['quality'] as const,
  defects: (inactive?: boolean) => ['quality', 'defects', !!inactive] as const,
  checklists: () => ['quality', 'checklists'] as const,
  checklistFor: (itemId: string) => ['quality', 'checklist-for', itemId] as const,
  inspections: (p: object) => ['quality', 'inspections', p] as const,
  inspection: (id: string) => ['quality', 'inspection', id] as const,
  summary: (p: object) => ['quality', 'summary', p] as const,
};

export function useDefectCategories(includeInactive = false) {
  return useQuery({ queryKey: qualityKeys.defects(includeInactive), queryFn: ({ signal }) => api.get<DefectCategory[]>(`/quality/defect-categories${qs({ includeInactive: includeInactive || undefined })}`, signal), staleTime: 60_000 });
}
export function useChecklists() {
  return useQuery({ queryKey: qualityKeys.checklists(), queryFn: ({ signal }) => api.get<Checklist[]>('/quality/checklists', signal) });
}
export function useChecklistFor(itemId: string | undefined, enabled = true) {
  return useQuery({ queryKey: qualityKeys.checklistFor(itemId ?? ''), queryFn: ({ signal }) => api.get<Checklist | null>(`/quality/checklists/for-item/${itemId}`, signal), enabled: !!itemId && enabled });
}
export function useInspections(p: { status?: string; type?: string; productionOrderId?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  return useQuery({ queryKey: qualityKeys.inspections(p), queryFn: ({ signal }) => api.get<Paged<InspectionSummary>>(`/quality/inspections${qs(p)}`, signal), placeholderData: (prev) => prev });
}
export function useInspection(id: string | undefined) {
  return useQuery({ queryKey: qualityKeys.inspection(id ?? ''), queryFn: ({ signal }) => api.get<InspectionDetail>(`/quality/inspections/${id}`, signal), enabled: !!id });
}
export function useQualitySummary(p: { from: string; to: string }) {
  return useQuery({ queryKey: qualityKeys.summary(p), queryFn: ({ signal }) => api.get<QualitySummary>(`/quality/summary${qs(p)}`, signal), placeholderData: (prev) => prev });
}

export const qualityApi = {
  createInspection: (body: object) => api.post<InspectionDetail>('/quality/inspections', body),
  assign: (id: string, inspectorId: string | null) => api.put<InspectionDetail>(`/quality/inspections/${id}/inspector`, { inspectorId: inspectorId ?? undefined }),
  start: (id: string) => api.post<InspectionDetail>(`/quality/inspections/${id}/start`),
  complete: (id: string, body: object) => api.post<InspectionDetail>(`/quality/inspections/${id}/complete`, body),
  cancel: (id: string, reason: string) => api.post<InspectionDetail>(`/quality/inspections/${id}/cancel`, { reason }),
  saveDefect: (id: string | null, body: object) => (id ? api.put<DefectCategory>(`/quality/defect-categories/${id}`, body) : api.post<DefectCategory>('/quality/defect-categories', body)),
  saveChecklist: (id: string | null, body: object) => (id ? api.put<Checklist>(`/quality/checklists/${id}`, body) : api.post<Checklist>('/quality/checklists', body)),
};
