'use client';

import * as React from 'react';
import type { FieldError } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from './primitives';

/** Label + control + hint/error, with ids wired for accessibility. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: FieldError | string | null;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {message ? (
        <p className="text-xs text-danger" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {message}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Responsive form grid: single column on mobile. */
export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="text-sm font-semibold">{title}</legend>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Convert empty strings to undefined; numeric strings to numbers. */
export function optionalNumber(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
