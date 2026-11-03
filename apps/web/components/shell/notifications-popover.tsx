'use client';

import type { Tone } from '@puja/shared';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, isNotFound } from '@/lib/api/client';
import { notificationKeys, useNotifications, useUnreadCount } from '@/lib/api/dashboard';
import { useApiMutation } from '@/lib/api/hooks';
import type { Notification } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingRows } from '@/components/ui/feedback';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';

export const SEVERITY_TONE: Record<Notification['severity'], Tone> = { INFO: 'info', SUCCESS: 'success', WARNING: 'warning', CRITICAL: 'danger' };

export function NotificationItem({ n, onRead, compact }: { n: Notification; onRead?: (id: string) => void; compact?: boolean }) {
  const dot = { INFO: 'bg-info', SUCCESS: 'bg-success', WARNING: 'bg-warning', CRITICAL: 'bg-danger' }[n.severity];
  const body = (
    <div className={cn('flex gap-2.5 rounded-md px-2 py-2 hover:bg-muted', !n.readAt && 'bg-subtle')}>
      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.readAt ? 'bg-border' : dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
        {n.body && !compact && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
      </div>
    </div>
  );
  const handle = () => !n.readAt && onRead?.(n.id);
  return n.link ? (
    <Link href={n.link} onClick={handle} className="block">
      {body}
    </Link>
  ) : (
    <button type="button" className="block w-full text-left" onClick={handle}>
      {body}
    </button>
  );
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const list = useNotifications({ pageSize: 15 }, open);
  const markRead = useApiMutation((id: string) => api.post(`/notifications/${id}/read`), { invalidate: [notificationKeys.all] });
  const markAll = useApiMutation(() => api.post('/notifications/read-all'), { invalidate: [notificationKeys.all] });
  const count = unread.data?.count ?? 0;
  const unavailable = isNotFound(list.error) || isNotFound(unread.error);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={count ? `Notifications (${count} unread)` : 'Notifications'} className="relative">
          <Bell />
          {count > 0 && <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white">{count > 99 ? '99+' : count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate(undefined)} disabled={!count || markAll.isPending}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {unavailable ? (
            <EmptyState compact icon={Bell} title="Notifications not available yet" description="The notification service is being connected." />
          ) : list.isLoading ? (
            <LoadingRows rows={4} />
          ) : !list.data?.data.length ? (
            <EmptyState compact icon={Bell} title="You're all caught up" />
          ) : (
            list.data.data.map((n) => <NotificationItem key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
