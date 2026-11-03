'use client';

import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './overlays';

export interface ComboOption {
  value: string;
  label: string;
  description?: string;
}

interface BaseProps {
  value: string | null | undefined;
  onChange: (value: string | null, option?: ComboOption) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  clearable?: boolean;
  'aria-invalid'?: boolean;
  /** label to display for the current value when options are not loaded yet */
  selectedLabel?: string;
}

/** Searchable select over a static list. */
export function Combobox({ options, ...p }: BaseProps & { options: ComboOption[] }) {
  return <ComboboxImpl {...p} staticOptions={options} />;
}

/** Searchable select that loads options from the API as the user types. */
export function AsyncCombobox({ load, queryKey, ...p }: BaseProps & { queryKey: readonly unknown[]; load: (search: string) => Promise<ComboOption[]> }) {
  return <ComboboxImpl {...p} load={load} queryKey={queryKey} />;
}

function ComboboxImpl({
  value,
  onChange,
  placeholder = 'Select…',
  className,
  disabled,
  id,
  clearable,
  staticOptions,
  load,
  queryKey,
  selectedLabel,
  ...rest
}: BaseProps & { staticOptions?: ComboOption[]; load?: (s: string) => Promise<ComboOption[]>; queryKey?: readonly unknown[] }) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [picked, setPicked] = React.useState<ComboOption | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: [...(queryKey ?? ['combo']), debounced],
    queryFn: () => load!(debounced),
    enabled: !!load && open,
    staleTime: 30_000,
  });
  const options = staticOptions ?? q.data ?? [];
  const current = options.find((o) => o.value === value) ?? (picked?.value === value ? picked : null);
  const label = current?.label ?? (value ? selectedLabel : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={rest['aria-invalid']}
          disabled={disabled}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-2.5 text-left text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60 aria-[invalid=true]:border-danger',
            className,
          )}
        >
          <span className={cn('truncate', !label && 'text-muted-foreground/80')}>{label ?? placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={!load} className="flex flex-col">
          <div className="flex items-center border-b px-2">
            <Command.Input value={search} onValueChange={setSearch} placeholder="Search…" className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            {q.isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">{q.isFetching ? 'Searching…' : 'No results'}</Command.Empty>
            {clearable && value && (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground data-[selected=true]:bg-muted"
              >
                Clear selection
              </Command.Item>
            )}
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.description ?? ''} ${o.value}`}
                onSelect={() => {
                  setPicked(o);
                  onChange(o.value, o);
                  setOpen(false);
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
              >
                <Check className={cn('size-3.5 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
