'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/primitives';
import { Logo } from './logo';

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const items = NAV.filter((n) => can(n.anyOf, 'any'));
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground',
              active && 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border',
              collapsed && 'justify-center px-0',
            )}
          >
            <item.icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {collapsed && <span className="sr-only">{item.label}</span>}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href} content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 md:flex', collapsed ? 'w-14' : 'w-56')} aria-label="Sidebar">
      <div className={cn('flex h-12 items-center border-b px-3', collapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/overview" aria-label="PUJA OS home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn('border-t p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="mx-auto size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
