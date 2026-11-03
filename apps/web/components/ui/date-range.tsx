'use client';

import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './primitives';
import { Popover, PopoverContent, PopoverTrigger } from './overlays';

export type RangePreset = 'today' | 'week' | 'month' | 'custom';
export interface DateRange {
  preset: RangePreset;
  from: Date;
  to: Date;
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return { preset, from: startOfDay(now), to: endOfDay(now) };
    case 'week':
      return { preset, from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { preset, from: startOfMonth(now), to: endOfMonth(now) };
  }
}

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

/** Segmented Today / This week / This month + custom range popover. */
export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(format(value.from, 'yyyy-MM-dd'));
  const [to, setTo] = React.useState(format(value.to, 'yyyy-MM-dd'));
  const valid = from && to && from <= to;

  return (
    <div className={cn('inline-flex items-center rounded-md border bg-card p-0.5 shadow-xs', className)} role="group" aria-label="Date range">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(presetRange(p.key))}
          aria-pressed={value.preset === p.key}
          className={cn('h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground', value.preset === p.key && 'bg-muted text-foreground')}
        >
          {p.label}
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={value.preset === 'custom'}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground', value.preset === 'custom' && 'bg-muted text-foreground')}
          >
            <CalendarDays className="size-3.5" />
            {value.preset === 'custom' ? `${format(value.from, 'dd MMM')} – ${format(value.to, 'dd MMM yyyy')}` : 'Custom'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="range-to">To</Label>
            <Input id="range-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!valid}
            onClick={() => {
              onChange({ preset: 'custom', from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) });
              setOpen(false);
            }}
          >
            Apply range
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
