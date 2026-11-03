'use client';

import { useQuery } from '@tanstack/react-query';
import { qs } from '../utils';
import { api, ApiError, type Paged } from './client';
import type { DashboardData, Notification, NotificationPreference } from './types';

export const dashboardKeys = {
  dashboard: (from: string, to: string) => ['dashboard', from, to] as const,
};

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (p: object) => ['notifications', 'list', p] as const,
  unread: () => ['notifications', 'unread'] as const,
  prefs: () => ['notifications', 'prefs'] as const,
};

const noRetry404 = (count: number, err: unknown) => !(err instanceof ApiError && err.status < 500) && count < 2;

export function useDashboard(from: Date, to: Date) {
  const f = from.toISOString();
  const t = to.toISOString();
  return useQuery({
    queryKey: dashboardKeys.dashboard(f, t),
    queryFn: ({ signal }) => api.get<DashboardData>(`/dashboard${qs({ from: f, to: t })}`, signal),
    placeholderData: (prev) => prev,
    retry: noRetry404,
  });
}

export function useNotifications(p: { unreadOnly?: boolean; page?: number; pageSize?: number }, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(p),
    queryFn: ({ signal }) => api.get<Paged<Notification>>(`/notifications${qs({ ...p })}`, signal),
    enabled,
    retry: noRetry404,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: ({ signal }) => api.get<{ count: number }>('/notifications/unread-count', signal),
    refetchInterval: (q) => (q.state.error ? false : 60_000),
    retry: noRetry404,
  });
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: notificationKeys.prefs(), queryFn: ({ signal }) => api.get<NotificationPreference[]>('/notifications/preferences', signal), retry: noRetry404 });
}
