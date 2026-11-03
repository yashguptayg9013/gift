'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

/** Dialog asking for a required (or optional) free-text reason. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Reason',
  confirmLabel = 'Confirm',
  destructive,
  required = true,
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  label?: string;
  confirmLabel?: string;
  destructive?: boolean;
  required?: boolean;
  loading?: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const invalid = required && !reason.trim();
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
            <Button variant={destructive ? 'danger' : 'primary'} disabled={invalid} loading={loading} onClick={() => onConfirm(reason.trim())}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={label} htmlFor="reason-text" required={required}>
            <Textarea id="reason-text" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <FormError error={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog for a quantity plus reason (material issue / wastage / return). */
export function QtyReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  uom,
  max,
  reasonRequired,
  confirmLabel = 'Save',
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  uom?: string;
  max?: number;
  reasonRequired?: boolean;
  confirmLabel?: string;
  loading?: boolean;
  error?: unknown;
  onConfirm: (quantity: number, reason: string) => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const n = Number(qty);
  const qtyInvalid = !(n > 0) || (max !== undefined && n > max);
  const invalid = qtyInvalid || (reasonRequired && !reason.trim());
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
            <Button variant="primary" disabled={invalid} loading={loading} onClick={() => onConfirm(n, reason.trim())}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={`Quantity${uom ? ` (${uom})` : ''}`} htmlFor="qty-val" required hint={max !== undefined ? `Maximum ${max}` : undefined} error={qty && qtyInvalid ? 'Enter a valid quantity' : null}>
            <Input id="qty-val" type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label="Reason" htmlFor="qty-reason" required={reasonRequired}>
            <Textarea id="qty-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <FormError error={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
