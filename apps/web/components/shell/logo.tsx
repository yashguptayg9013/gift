import { cn } from '@/lib/utils';

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground" aria-hidden>
        P
      </span>
      {!collapsed && (
        <span className="text-sm">
          PUJA <span className="text-muted-foreground">OS</span>
        </span>
      )}
    </span>
  );
}
