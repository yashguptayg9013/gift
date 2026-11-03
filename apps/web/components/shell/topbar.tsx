'use client';

import { CheckSquare, KeyRound, LogOut, Menu, Monitor, Moon, Plus, Search, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useAuth } from '@/lib/auth';
import { QUICK_CREATE } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Avatar, Kbd } from '@/components/ui/primitives';
import { ChangePasswordDialog } from './account-dialogs';
import { CommandPalette } from './command-palette';
import { NotificationsPopover } from './notifications-popover';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { me, can, logout } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [pwOpen, setPwOpen] = React.useState(false);
  const creates = QUICK_CREATE.filter((q) => can(q.anyOf, 'any'));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">Search…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        {creates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="primary" size="sm" aria-label="Quick create">
                <Plus /> <span className="hidden sm:inline">New</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              {creates.map((c) => (
                <DropdownMenuItem key={c.href} onSelect={() => router.push(c.href)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Theme">
              {theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-ring" aria-label="Account menu">
              <Avatar name={me.name} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{me.name}</p>
              <p className="truncate text-xs text-muted-foreground">{me.email}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{me.roles.map((r) => r.name).join(', ')}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account">
                <UserRound /> Profile &amp; sessions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
              <KeyRound /> Change password
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/approvals">
                <CheckSquare /> Approvals
              </Link>
            </DropdownMenuItem>
            {can('admin.users.manage') && (
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <ShieldCheck /> Administration
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </header>
  );
}
