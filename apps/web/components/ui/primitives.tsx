'use client';

import { Check, ChevronDown, Minus } from 'lucide-react';
import { Avatar as AvatarP, Checkbox as CheckboxP, Label as LabelP, Select as SelectP, Separator as SeparatorP, Switch as SwitchP, Tabs as TabsP, Tooltip as TooltipP } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Label ─────────────────────────────────────────────
export const Label = React.forwardRef<React.ElementRef<typeof LabelP.Root>, React.ComponentPropsWithoutRef<typeof LabelP.Root>>(({ className, ...props }, ref) => (
  <LabelP.Root ref={ref} className={cn('text-xs font-medium text-foreground/90 select-none', className)} {...props} />
));
Label.displayName = 'Label';

// ─── Checkbox ──────────────────────────────────────────
export const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxP.Root>, React.ComponentPropsWithoutRef<typeof CheckboxP.Root>>(({ className, ...props }, ref) => (
  <CheckboxP.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-sm border border-input bg-card shadow-xs focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxP.Indicator className="flex items-center justify-center">{props.checked === 'indeterminate' ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</CheckboxP.Indicator>
  </CheckboxP.Root>
));
Checkbox.displayName = 'Checkbox';

// ─── Switch ────────────────────────────────────────────
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchP.Root>, React.ComponentPropsWithoutRef<typeof SwitchP.Root>>(({ className, ...props }, ref) => (
  <SwitchP.Root
    ref={ref}
    className={cn('inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-primary disabled:opacity-50', className)}
    {...props}
  >
    <SwitchP.Thumb className="pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-[1px]" />
  </SwitchP.Root>
));
Switch.displayName = 'Switch';

// ─── Separator ─────────────────────────────────────────
export function Separator({ className, orientation = 'horizontal', ...props }: React.ComponentPropsWithoutRef<typeof SeparatorP.Root>) {
  return <SeparatorP.Root orientation={orientation} className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)} {...props} />;
}

// ─── Tooltip ───────────────────────────────────────────
export const TooltipProvider = TooltipP.Provider;
export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipP.Root>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal>
        <TooltipP.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md">
          {content}
        </TooltipP.Content>
      </TooltipP.Portal>
    </TooltipP.Root>
  );
}

// ─── Tabs ──────────────────────────────────────────────
export const Tabs = TabsP.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsP.List>) {
  return <TabsP.List className={cn('flex items-center gap-1 overflow-x-auto border-b', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsP.Trigger>) {
  return (
    <TabsP.Trigger
      className={cn(
        '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsP.Content>) {
  return <TabsP.Content className={cn('pt-4 focus-visible:outline-none', className)} {...props} />;
}

// ─── Select (Radix) ────────────────────────────────────
export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  className,
  disabled,
  id,
  'aria-label': ariaLabel,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  return (
    <SelectP.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectP.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60 data-[placeholder]:text-muted-foreground/80',
          className,
        )}
      >
        <SelectP.Value placeholder={placeholder} />
        <SelectP.Icon>
          <ChevronDown className="size-4 opacity-60" />
        </SelectP.Icon>
      </SelectP.Trigger>
      <SelectP.Portal>
        <SelectP.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <SelectP.Viewport className="p-1">
            {options.map((o) => (
              <SelectP.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-7 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
              >
                <SelectP.ItemIndicator className="absolute left-2 inline-flex">
                  <Check className="size-3.5" />
                </SelectP.ItemIndicator>
                <SelectP.ItemText>{o.label}</SelectP.ItemText>
              </SelectP.Item>
            ))}
          </SelectP.Viewport>
        </SelectP.Content>
      </SelectP.Portal>
    </SelectP.Root>
  );
}

// ─── Avatar ────────────────────────────────────────────
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <AvatarP.Root className={cn('inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground', className)}>
      <AvatarP.Fallback>{initials || '?'}</AvatarP.Fallback>
    </AvatarP.Root>
  );
}

// ─── Kbd ───────────────────────────────────────────────
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[11px] text-muted-foreground', className)}>{children}</kbd>;
}

// ─── Skeleton ──────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}
