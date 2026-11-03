'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { PASSWORD_HINT, passwordSchema } from '@/lib/password';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [error, setError] = useState<unknown>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed. Other sessions were signed out.');
      form.reset();
      onOpenChange(false);
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          form.reset();
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent
        size="sm"
        title="Change password"
        description="Other active sessions will be signed out."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="change-password" type="submit" loading={form.formState.isSubmitting}>
              Update password
            </Button>
          </>
        }
      >
        <form id="change-password" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Current password" htmlFor="cp-current" error={form.formState.errors.currentPassword}>
            <Input id="cp-current" type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          </Field>
          <Field label="New password" htmlFor="cp-new" error={form.formState.errors.newPassword} hint={PASSWORD_HINT}>
            <Input id="cp-new" type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Field label="Confirm new password" htmlFor="cp-confirm" error={form.formState.errors.confirm}>
            <Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          {error ? <FormError error={error} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
