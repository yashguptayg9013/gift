'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';
import { AuthProvider, useMeQuery } from '@/lib/auth';
import { Logo } from '@/components/shell/logo';
import { Sidebar, SidebarNav } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { ErrorState } from '@/components/ui/feedback';
import { Sheet, SheetContent } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/primitives';

const COLLAPSE_KEY = 'puja.sidebar.collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const me = useMeQuery();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  if (me.isLoading) return <ShellSkeleton />;
  if (me.error || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState error={me.error} onRetry={() => me.refetch()} title="Could not load your account" />
      </div>
    );
  }

  return (
    <AuthProvider me={me.data}>
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" size="sm" title={<Logo />} className="max-w-[16rem]">
            <div className="-mx-3">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy aria-label="Loading">
      <div className="hidden w-56 border-r bg-sidebar p-3 md:block">
        <Skeleton className="mb-6 h-6 w-24" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-7 w-full" />
        ))}
      </div>
      <div className="flex-1">
        <div className="flex h-12 items-center border-b px-5">
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

