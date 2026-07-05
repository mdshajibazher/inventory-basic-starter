'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import type { Branch } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('none');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, router, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const selectedBranchId = branchId === 'none' ? undefined : Number(branchId);
      const branchOptions = await login(email.trim(), password, selectedBranchId);
      if (branchOptions) {
        setBranches(branchOptions);
        setBranchId(branchOptions[0] ? String(branchOptions[0].id) : 'none');
        return;
      }
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
          {branches.length ? (
            <Field label="Branch">
              <Select
                value={branchId}
                onValueChange={setBranchId}
                options={[
                  { value: 'none', label: 'Select branch' },
                  ...branches.map((branch) => ({ value: String(branch.id), label: branch.company_name ? `${branch.name} - ${branch.company_name}` : branch.name })),
                ]}
              />
            </Field>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : branches.length ? 'Continue' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  );
}
