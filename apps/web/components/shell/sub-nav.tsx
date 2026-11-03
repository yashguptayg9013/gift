'use client';

import type { Permission } from '@puja/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export interface SubNavItem {
  label: string;
  href: string;
  anyOf?: Permission[];
  /** match only the exact path */
  exact?: boolean;
}

/** Secondary navigation rendered as underline tabs under a module header. */
export function SubNav({ items, className }: { items: SubNavItem[]; className?: string }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const visible = items.filter((i) => !i.anyOf || can(i.anyOf, 'any'));
  return (
    <nav aria-label="Section" className={cn('-mt-1 mb-5 flex items-center gap-1 overflow-x-auto border-b', className)}>
      {visible.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn('-mb-px inline-flex h-9 items-center border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground', active && 'border-primary text-foreground')}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
