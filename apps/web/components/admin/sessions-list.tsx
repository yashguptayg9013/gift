'use client';

import { Laptop, LogOut } from 'lucide-react';
import type { SessionInfo } from '@/lib/api/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';

function describeAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /okhttp|Expo|Dart/i.test(ua) ? 'Mobile app' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

export function SessionsList({ sessions, loading, error, onRetry, onRevoke, revoking, currentLabel }: { sessions?: SessionInfo[]; loading?: boolean; error?: unknown; onRetry?: () => void; onRevoke: (id: string) => void; revoking?: string | null; currentLabel?: (s: SessionInfo, i: number) => boolean }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !sessions) return <LoadingRows rows={3} />;
  if (!sessions.length) return <EmptyState compact icon={Laptop} title="No active sessions" />;
  return (
    <ul className="divide-y">
      {sessions.map((s, i) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm">
                {describeAgent(s.userAgent)} {currentLabel?.(s, i) && <Badge tone="success">Most recent</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.ip ?? 'Unknown IP'} · active {formatRelative(s.lastUsedAt)} · signed in {formatDateTime(s.createdAt)}
              </p>
            </div>
          </div>
          <Button size="sm" variant="danger-ghost" onClick={() => onRevoke(s.id)} loading={revoking === s.id}>
            <LogOut /> Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}
