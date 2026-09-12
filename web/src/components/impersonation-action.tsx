'use client';

import { useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import type { Branch, User } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { ActionButton, Button, Field, Modal, Select } from '@/components/ui';

export function ImpersonationAction({ target }: { target: User }) {
  const { user, impersonation, startImpersonation, sessionBusy } = useAuth();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  if (!user?.permissions?.includes('super-user') || impersonation) return null;

  const disabled = busy || sessionBusy || user.id === target.id || !target.is_active;

  function close() {
    if (inFlight.current || sessionBusy) return;
    setOpen(false);
    setBranches(null);
    setBranchId('');
  }

  async function start() {
    if (inFlight.current || disabled || (branches !== null && !branchId)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const availableBranches = await startImpersonation(target.id, branchId ? Number(branchId) : undefined);
      if (availableBranches !== null) {
        setBranches(availableBranches);
        setBranchId('');
      } else {
        setOpen(false);
      }
    } catch (error) {
      toast.error('Impersonation failed', { description: errorMessage(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ActionButton
        icon={LogIn}
        text="Impersonate login"
        color="text-emerald-700 hover:text-emerald-800"
        bgColor="bg-emerald-50 hover:border-emerald-100 hover:bg-emerald-100"
        disabled={disabled}
        onClick={() => setOpen(true)}
      />
      <Modal title="Impersonate login" open={open} onOpenChange={(value) => { if (!value) close(); }} contentClassName="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Continue as <strong>{target.name}</strong> ({target.email}) with this user’s permissions and branch access.
            You can return to your account using Stop impersonating.
          </p>
          {branches !== null ? (
            <Field label="Target branch">
              <Select
                value={branchId}
                onValueChange={setBranchId}
                placeholder="Choose a branch"
                options={branches.map((branch) => ({ value: String(branch.id), label: branch.company_name ? `${branch.name} — ${branch.company_name}` : branch.name }))}
                disabled={busy || sessionBusy}
              />
              {!branches.length ? <span className="text-red-700">No available branches for this user.</span> : null}
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={busy || sessionBusy}>Cancel</Button>
            <Button onClick={() => void start()} disabled={disabled || (branches !== null && !branchId)}>
              {busy ? 'Starting…' : 'Impersonate login'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
