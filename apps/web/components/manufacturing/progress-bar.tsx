import { cn } from '@/lib/utils';

/** Thin determinate progress bar (0–1). */
export function ProgressBar({ value, tone = 'primary', className, label }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div role="progressbar" aria-label={label ?? 'Progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-[width]', tone === 'primary' && 'bg-primary', tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'danger' && 'bg-danger')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
