'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { PASSWORD_HINT, passwordSchema } from '@/lib/password';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [error, setError] = useState<unknown>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  if (!token) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Invalid reset link</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link is missing its token. Request a new one.</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password: values.password }, { noAuthRetry: true });
      toast.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (e) {
      setError(e);
    }
  });

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">All existing sessions will be signed out.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="New password" htmlFor="password" error={form.formState.errors.password} hint={PASSWORD_HINT}>
          <Input id="password" type="password" autoComplete="new-password" autoFocus {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={form.formState.errors.confirm}>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        {error ? <FormError error={error} /> : null}
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
