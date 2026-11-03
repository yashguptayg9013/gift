'use client';

import { STATUS_VOCABULARIES, type Tone } from '@puja/shared';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { ApiError, errorMessage } from '@/lib/api/client';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Skeleton } from './primitives';

// ─── Badge ─────────────────────────────────────────────
const toneClass: Record<Tone, string> = {
  neutral: 'tone-neutral',
  info: 'tone-info',
  success: 'tone-success',
  warning: 'tone-warning',
  danger: 'tone-danger',
  accent: 'tone-accent',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap', toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export type Vocabulary = keyof typeof STATUS_VOCABULARIES;

/** Status badge driven by the shared status vocabularies (label + tone). */
export function StatusBadge({ vocabulary, value, className }: { vocabulary: Vocabulary; value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const vocab = STATUS_VOCABULARIES[vocabulary] as Record<string, { label: string; tone: Tone }>;
  const def = vocab[value];
  return (
    <Badge tone={def?.tone ?? 'neutral'} className={className} dot>
      {def?.label ?? humanize(value)}
    </Badge>
  );
}

const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  OK: { label: 'In stock', tone: 'success' },
  LOW: { label: 'Low', tone: 'warning' },
  OUT: { label: 'Out', tone: 'danger' },
};
export function StockStatusBadge({ status }: { status: string }) {
  const d = STOCK_STATUS[status] ?? { label: status, tone: 'neutral' as Tone };
  return (
    <Badge tone={d.tone} dot>
      {d.label}
    </Badge>
  );
}

// ─── Empty / error / loading ───────────────────────────
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 py-8' : 'gap-2 py-16', className)}>
      <div className="mb-1 flex size-9 items-center justify-center rounded-md border bg-subtle text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, title = 'Could not load data' }: { error: unknown; onRetry?: () => void; className?: string; title?: string }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}>
      <div className="mb-1 flex size-9 items-center justify-center rounded-md border border-danger/30 bg-danger/5 text-danger">
        <AlertTriangle className="size-4" />
      </div>
      <p className="text-sm font-medium">{forbidden ? 'You do not have access to this' : title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{errorMessage(error)}</p>
      {requestId && <p className="font-mono text-xs text-muted-foreground">Request ID: {requestId}</p>}
      {onRetry && !forbidden && (
        <Button size="sm" className="mt-1" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-3', className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

/** Inline form error block (e.g. INSUFFICIENT_STOCK from the API). */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      <p className="font-medium">{e?.code === 'INSUFFICIENT_STOCK' ? 'Insufficient stock' : e?.code === 'FORBIDDEN' ? 'Not permitted' : 'Could not save'}</p>
      <p className="mt-0.5 text-danger/90">{errorMessage(error)}</p>
      {e?.requestId && <p className="mt-1 font-mono text-[11px] text-danger/70">Request ID: {e.requestId}</p>}
    </div>
  );
}

// ─── Page header / sections ────────────────────────────
export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumbs?: Crumb[]; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, actions, children, className, bodyClassName }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('rounded-lg border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI tile. */
export function Stat({ label, value, hint, tone, href, loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; href?: string; loading?: boolean }) {
  const body = (
    <div className="flex h-full flex-col gap-1 px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-7 w-20" /> : <span className={cn('tabular text-2xl font-semibold tracking-tight', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')}>{value}</span>}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Key/value description list for detail pages. */
export function DescriptionList({ items, columns = 3 }: { items: { label: string; value: React.ReactNode }[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', cols)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
