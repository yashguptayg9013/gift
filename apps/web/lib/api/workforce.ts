'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';

export interface Worker {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  departmentId: string | null;
  jobRole: string | null;
  skills: string[];
  userId: string | null;
  joinedOn: string | null;
  isActive: boolean;
  notes: string | null;
  department: { id: string; name: string } | null;
  user: { id: string; email: string; name?: string } | null;
  _count?: { assignments: number };
}

export interface AttendanceRow {
  id: string;
  workerId: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  remarks: string | null;
}

export interface WorkerDetail extends Worker {
  openTasks: {
    id: string;
    status: string;
    stageDefinition: { name: string };
    productionOrder: { id: string; number: string; dueDate: string | null; item: { code: string; name: string } };
  }[];
  recentOutputs: {
    id: string;
    qtyGood: number;
    qtyRejected: number;
    qtyRework: number;
    recordedAt: string;
    stage: { stageDefinition: { name: string } };
    productionOrder: { id: string; number: string };
  }[];
  attendance: AttendanceRow[];
}

export interface DaySheetRow {
  worker: { id: string; code: string; name: string; department: string | null };
  attendance: AttendanceRow | null;
}

export interface ProductivityRow {
  worker: { id: string; code: string; name: string; department: string | null; jobRole: string | null };
  entries: number;
  orders: number;
  good: number;
  rejected: number;
  rework: number;
  rejectionRate: number | null;
  daysPresent: number;
  hoursRecorded: number;
  goodPerDayPresent: number | null;
  byStage: { stage: string; good: number; rejected: number; rework: number; entries: number }[];
}

export interface Productivity {
  from: string;
  to: string;
  basis: string;
  rows: ProductivityRow[];
}

export const workforceKeys = {
  all: ['workforce'] as const,
  workers: (p: object) => ['workforce', 'workers', p] as const,
  worker: (id: string) => ['workforce', 'worker', id] as const,
  daily: (id: string, from: string, to: string) => ['workforce', 'daily', id, from, to] as const,
  day: (date: string) => ['workforce', 'day', date] as const,
  productivity: (p: object) => ['workforce', 'productivity', p] as const,
};

export function useWorkers(p: { search?: string; departmentId?: string; includeInactive?: boolean; page?: number; pageSize?: number }, enabled = true) {
  return useQuery({ queryKey: workforceKeys.workers(p), queryFn: ({ signal }) => api.get<Paged<Worker>>(`/workforce/workers${qs({ ...p })}`, signal), placeholderData: (prev) => prev, enabled });
}
export function useWorker(id: string | undefined) {
  return useQuery({ queryKey: workforceKeys.worker(id ?? ''), queryFn: ({ signal }) => api.get<WorkerDetail>(`/workforce/workers/${id}`, signal), enabled: !!id });
}
export function useWorkerDaily(id: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: workforceKeys.daily(id ?? '', from, to),
    queryFn: ({ signal }) => api.get<{ date: string; good: number; rejected: number; rework: number; entries: number }[]>(`/workforce/workers/${id}/daily${qs({ from, to })}`, signal),
    enabled: !!id,
  });
}
export function useDaySheet(date: string) {
  return useQuery({ queryKey: workforceKeys.day(date), queryFn: ({ signal }) => api.get<DaySheetRow[]>(`/workforce/attendance/day/${date}`, signal), enabled: /^\d{4}-\d{2}-\d{2}$/.test(date) });
}
export function useProductivity(p: { from: string; to: string; departmentId?: string; workerId?: string }) {
  return useQuery({ queryKey: workforceKeys.productivity(p), queryFn: ({ signal }) => api.get<Productivity>(`/workforce/productivity${qs(p)}`, signal), placeholderData: (prev) => prev });
}

export const workforceApi = {
  create: (body: object) => api.post<WorkerDetail>('/workforce/workers', body),
  update: (id: string, body: object) => api.patch<WorkerDetail>(`/workforce/workers/${id}`, body),
  attendance: (date: string, entries: object[]) => api.put<DaySheetRow[]>('/workforce/attendance', { date, entries }),
};

/** Load active workers as combobox options. */
export async function loadWorkerOptions(search: string) {
  const res = await api.get<Paged<Worker>>(`/workforce/workers${qs({ search: search || undefined, pageSize: 50 })}`);
  return res.data.map((w) => ({ value: w.id, label: `${w.name}`, description: [w.code, w.jobRole].filter(Boolean).join(' · ') }));
}
