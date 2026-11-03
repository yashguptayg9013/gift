'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, type Paged } from './client';
import type { AdminUser, Approval, AuditEntry, Role, Sequence, SessionInfo } from './types';

export const adminKeys = {
  users: (s?: string) => ['admin', 'users', s ?? ''] as const,
  userSessions: (id: string) => ['admin', 'user-sessions', id] as const,
  roles: () => ['admin', 'roles'] as const,
  permissions: () => ['admin', 'permissions'] as const,
  audit: (p: object) => ['admin', 'audit', p] as const,
  settings: () => ['admin', 'settings'] as const,
  sequences: () => ['admin', 'sequences'] as const,
  mySessions: () => ['auth', 'sessions'] as const,
};

export const approvalKeys = {
  all: ['approvals'] as const,
  list: (p: object) => ['approvals', 'list', p] as const,
  one: (id: string) => ['approvals', 'one', id] as const,
};

export function useUsers(search?: string) {
  return useQuery({ queryKey: adminKeys.users(search), queryFn: ({ signal }) => api.get<AdminUser[]>(`/admin/users${qs({ search })}`, signal) });
}

export function useUserSessions(id: string | undefined) {
  return useQuery({ queryKey: adminKeys.userSessions(id ?? ''), queryFn: ({ signal }) => api.get<SessionInfo[]>(`/admin/users/${id}/sessions`, signal), enabled: !!id });
}

export function useMySessions() {
  return useQuery({ queryKey: adminKeys.mySessions(), queryFn: ({ signal }) => api.get<SessionInfo[]>('/auth/sessions', signal) });
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: adminKeys.roles(), queryFn: ({ signal }) => api.get<Role[]>('/admin/roles', signal), enabled });
}

export type PermissionGroups = Record<string, { label: string; permissions: Record<string, string> }>;

export function usePermissionCatalog() {
  return useQuery({ queryKey: adminKeys.permissions(), queryFn: ({ signal }) => api.get<PermissionGroups>('/admin/permissions', signal), staleTime: Infinity });
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useAudit(p: AuditQuery) {
  return useQuery({ queryKey: adminKeys.audit(p), queryFn: ({ signal }) => api.get<Paged<AuditEntry>>(`/admin/audit${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}

export type SettingsGroups = Record<string, Record<string, unknown>>;

export function useSettings() {
  return useQuery({ queryKey: adminKeys.settings(), queryFn: ({ signal }) => api.get<SettingsGroups>('/admin/settings', signal) });
}

export function useSequences() {
  return useQuery({ queryKey: adminKeys.sequences(), queryFn: ({ signal }) => api.get<Sequence[]>('/admin/sequences', signal) });
}

export function useApprovals(p: { status?: string; type?: string; mine?: boolean; page?: number; pageSize?: number }) {
  return useQuery({ queryKey: approvalKeys.list(p), queryFn: ({ signal }) => api.get<Paged<Approval>>(`/approvals${qs({ ...p })}`, signal), placeholderData: (prev) => prev });
}

export function useApproval(id: string | undefined) {
  return useQuery({ queryKey: approvalKeys.one(id ?? ''), queryFn: ({ signal }) => api.get<Approval>(`/approvals/${id}`, signal), enabled: !!id });
}
