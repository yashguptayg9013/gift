import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

const LOCALE = 'en-IN';

const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 });
const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const currencyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

type Num = number | string | null | undefined;

function toNum(v: Num): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 12,34,567.25 (Indian digit grouping) */
export function formatNumber(v: Num, digits?: number): string {
  const n = toNum(v);
  if (n === null) return '—';
  if (digits !== undefined) return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  return numberFmt.format(n);
}

export function formatInteger(v: Num): string {
  const n = toNum(v);
  return n === null ? '—' : integerFmt.format(n);
}

export function formatCompact(v: Num): string {
  const n = toNum(v);
  return n === null ? '—' : compactFmt.format(n);
}

/** ₹1,23,456.00 */
export function formatCurrency(v: Num): string {
  const n = toNum(v);
  return n === null ? '—' : currencyFmt.format(n);
}

/** 25.5 M */
export function formatQty(v: Num, uom?: string | null): string {
  const n = toNum(v);
  if (n === null) return '—';
  return uom ? `${numberFmt.format(n)} ${uom}` : numberFmt.format(n);
}

export function formatPercent(v: Num, digits = 1): string {
  const n = toNum(v);
  return n === null ? '—' : `${n.toFixed(digits)}%`;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === 'string' ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

/** 03 Nov 2026 */
export function formatDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

/** 03 Nov 2026, 14:05 */
export function formatDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd MMM yyyy, HH:mm') : '—';
}

/** 5 minutes ago */
export function formatRelative(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${formatDistanceToNowStrict(d)} ago` : '—';
}

/** Title-case an UPPER_SNAKE enum value when no vocabulary label exists. */
export function humanize(v: string | null | undefined): string {
  if (!v) return '—';
  return v
    .toLowerCase()
    .split(/[_\s.]+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
