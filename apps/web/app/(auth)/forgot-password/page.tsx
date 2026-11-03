'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';

const schema = z.object({ email: z.string().email('Enter a valid email') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', values, { noAuthRetry: true });
      setSent(true);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      {sent ? (
        <div className="space-y-3 text-center">
          <MailCheck className="mx-auto size-6 text-success" aria-hidden />
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">If an account exists for that address, a reset link valid for 30 minutes has been sent.</p>
          <Link href="/login" className="inline-block text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your account email and we&apos;ll send a reset link.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" htmlFor="email" error={form.formState.errors.email}>
              <Input id="email" type="email" autoComplete="email" autoFocus {...form.register('email')} />
            </Field>
            {error ? <FormError error={error} /> : null}
            <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
              Send reset link
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
