'use client';

import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Dialog as DialogP } from 'radix-ui';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { searchAll } from '@/lib/api/catalog';
import { useAuth } from '@/lib/auth';
import { NAV, QUICK_CREATE } from '@/lib/nav';
import { Kbd } from '@/components/ui/primitives';

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);
  React.useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const results = useQuery({ queryKey: ['search', debounced], queryFn: ({ signal }) => searchAll(debounced, signal), enabled: open && debounced.length >= 2 });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const pages = NAV.filter((n) => can(n.anyOf, 'any'));
  const creates = QUICK_CREATE.filter((q) => can(q.anyOf, 'any'));

  const itemCls = 'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted';
  const groupCls = '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

  return (
    <DialogP.Root open={open} onOpenChange={onOpenChange}>
      <DialogP.Portal>
        <DialogP.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogP.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <DialogP.Title className="sr-only">Search</DialogP.Title>
          <DialogP.Description className="sr-only">Search records and navigate</DialogP.Description>
          <Command shouldFilter={debounced.length < 2} loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input value={term} onValueChange={setTerm} placeholder="Search materials, products, orders, customers…" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              {results.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">{debounced.length >= 2 && !results.isFetching ? 'No results' : 'Type to search'}</Command.Empty>
              {debounced.length >= 2 && results.data && results.data.length > 0 && (
                <Command.Group heading="Results" className={groupCls}>
                  {results.data.map((r) => (
                    <Command.Item key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)} className={itemCls}>
                      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{r.type}</span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.subtitle && <span className="truncate font-mono text-xs text-muted-foreground">{r.subtitle}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {debounced.length < 2 && (
                <>
                  <Command.Group heading="Go to" className={groupCls}>
                    {pages.map((p) => (
                      <Command.Item key={p.href} value={`go ${p.label}`} onSelect={() => go(p.href)} className={itemCls}>
                        <p.icon className="size-4 text-muted-foreground" />
                        {p.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {creates.length > 0 && (
                    <Command.Group heading="Create" className={groupCls}>
                      {creates.map((c) => (
                        <Command.Item key={c.href} value={`new ${c.label}`} onSelect={() => go(c.href)} className={itemCls}>
                          <ArrowRight className="size-4 text-muted-foreground" />
                          New {c.label.toLowerCase()}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
          </Command>
        </DialogP.Content>
      </DialogP.Portal>
    </DialogP.Root>
  );
}
