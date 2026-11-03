'use client';

import { Check, ChevronRight, X } from 'lucide-react';
import { Dialog as DialogP, DropdownMenu as MenuP, Popover as PopoverP } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// ─── Dialog ────────────────────────────────────────────
export const Dialog = DialogP.Root;
export const DialogTrigger = DialogP.Trigger;
export const DialogClose = DialogP.Close;

const overlay = 'fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0';

export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
  size = 'md',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <DialogP.Portal>
      <DialogP.Overlay className={overlay} />
      <DialogP.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-popover text-popover-foreground shadow-lg focus:outline-none',
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div className="min-w-0">
            <DialogP.Title className="text-base font-semibold">{title}</DialogP.Title>
            {description ? <DialogP.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogP.Description> : <DialogP.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogP.Description>}
          </div>
          <DialogP.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogP.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </DialogP.Content>
    </DialogP.Portal>
  );
}

// ─── Sheet (side drawer) ───────────────────────────────
export const Sheet = DialogP.Root;
export const SheetTrigger = DialogP.Trigger;
export const SheetClose = DialogP.Close;

export function SheetContent({
  title,
  description,
  children,
  footer,
  side = 'right',
  size = 'md',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return (
    <DialogP.Portal>
      <DialogP.Overlay className={overlay} />
      <DialogP.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col border-l bg-popover text-popover-foreground shadow-lg focus:outline-none',
          side === 'right' ? 'right-0' : 'left-0 border-r border-l-0',
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div className="min-w-0">
            <DialogP.Title className="text-base font-semibold">{title}</DialogP.Title>
            {description ? <DialogP.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogP.Description> : <DialogP.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</DialogP.Description>}
          </div>
          <DialogP.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogP.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </DialogP.Content>
    </DialogP.Portal>
  );
}

// ─── Confirm dialog ────────────────────────────────────
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ─── Dropdown menu ─────────────────────────────────────
export const DropdownMenu = MenuP.Root;
export const DropdownMenuTrigger = MenuP.Trigger;
export const DropdownMenuSub = MenuP.Sub;

export function DropdownMenuContent({ className, align = 'end', ...props }: React.ComponentPropsWithoutRef<typeof MenuP.Content>) {
  return (
    <MenuP.Portal>
      <MenuP.Content align={align} sideOffset={6} className={cn('z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props} />
    </MenuP.Portal>
  );
}

const itemCls = 'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground';

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.Item> & { destructive?: boolean }) {
  return <MenuP.Item className={cn(itemCls, destructive && 'text-danger [&_svg]:text-danger', className)} {...props} />;
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.CheckboxItem>) {
  return (
    <MenuP.CheckboxItem className={cn(itemCls, 'pl-7', className)} {...props}>
      <MenuP.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="size-3.5" />
      </MenuP.ItemIndicator>
      {children}
    </MenuP.CheckboxItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.Label>) {
  return <MenuP.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <MenuP.Separator className="-mx-1 my-1 h-px bg-border" />;
}
export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.SubTrigger>) {
  return (
    <MenuP.SubTrigger className={cn(itemCls, 'data-[state=open]:bg-muted', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </MenuP.SubTrigger>
  );
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.SubContent>) {
  return (
    <MenuP.Portal>
      <MenuP.SubContent className={cn('z-50 min-w-40 rounded-md border bg-popover p-1 shadow-md', className)} {...props} />
    </MenuP.Portal>
  );
}
export const DropdownMenuRadioGroup = MenuP.RadioGroup;
export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof MenuP.RadioItem>) {
  return (
    <MenuP.RadioItem className={cn(itemCls, 'pl-7', className)} {...props}>
      <MenuP.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="size-3.5" />
      </MenuP.ItemIndicator>
      {children}
    </MenuP.RadioItem>
  );
}

// ─── Popover ───────────────────────────────────────────
export const Popover = PopoverP.Root;
export const PopoverTrigger = PopoverP.Trigger;
export const PopoverAnchor = PopoverP.Anchor;
export function PopoverContent({ className, align = 'start', ...props }: React.ComponentPropsWithoutRef<typeof PopoverP.Content>) {
  return (
    <PopoverP.Portal>
      <PopoverP.Content align={align} sideOffset={6} className={cn('z-50 rounded-md border bg-popover p-3 text-popover-foreground shadow-md focus:outline-none', className)} {...props} />
    </PopoverP.Portal>
  );
}
