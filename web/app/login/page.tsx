'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, router, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (error) {
      toast.error('Login failed', { description: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-black text-white">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in with your Laravel API account.</p>
        <div className="mt-6 grid gap-4">
          <Field label="Email">
            <Input autoCapitalize="none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  );
}
