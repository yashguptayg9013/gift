'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

/** Only allow same-site relative redirects. */
function safeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/overview';
  return next;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(true);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  // Silent re-authentication: the refresh cookie is scoped to /api/v1/auth, so page
  // navigations can't see it. Try a refresh before asking for credentials.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => {
        if (!cancelled && r.ok) router.replace(next);
        else if (!cancelled) setChecking(false);
      })
      .catch(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/login', values, { noAuthRetry: true });
      qc.clear();
      router.replace(next);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use your PUJA OS account.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate aria-busy={checking}>
        <Field label="Email" htmlFor="email" error={form.formState.errors.email}>
          <Input id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.formState.errors.password}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
        </Field>
        {error ? <FormError error={error} /> : null}
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
