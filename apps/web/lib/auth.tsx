'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@puja/shared';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { api, ApiError } from './api/client';

export interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  lastLoginAt: string | null;
  roles: { key: string; name: string }[];
  permissions: string[];
  workerId: string | null;
}

export const meKey = ['auth', 'me'] as const;

export function useMeQuery() {
  return useQuery({
    queryKey: meKey,
    queryFn: ({ signal }) => api.get<Me>('/auth/me', signal),
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });
}

interface AuthContextValue {
  me: Me;
  can: (p: Permission | Permission[], mode?: 'all' | 'any') => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const set = useMemo(() => new Set(me.permissions), [me.permissions]);
  const can = useCallback(
    (p: Permission | Permission[], mode: 'all' | 'any' = 'all') => {
      const list = Array.isArray(p) ? p : [p];
      return mode === 'any' ? list.some((x) => set.has(x)) : list.every((x) => set.has(x));
    },
    [set],
  );
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { noAuthRetry: true });
    } finally {
      qc.clear();
      router.replace('/login');
    }
  }, [qc, router]);
  const value = useMemo(() => ({ me, can, logout }), [me, can, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Permission check for UX only — the API enforces every rule. */
export function useCan() {
  return useAuth().can;
}
