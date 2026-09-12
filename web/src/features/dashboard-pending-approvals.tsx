'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { Button, Modal } from '@/components/ui';
import { useDashboardApprovals } from '@/hooks/use-dashboard-approvals';
import { approvalDetailPath, approvalSections, canViewApprovalSection, type ApprovalRow, type ApprovalSection } from '@/lib/dashboard-approvals';
import { errorMessage } from '@/lib/utils';

function amount(value: string | number) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DashboardPendingApprovals({ refreshKey, onSettled }: { refreshKey: number; onSettled: () => void }) {
  const { user } = useAuth();
  const visible = approvalSections.filter(section => canViewApprovalSection(user?.permissions ?? [], section));
  if (!visible.length) return null;
  const identity = `${user?.id}:${user?.current_biller_id}:${[...(user?.permissions ?? [])].sort().join(',')}`;

  return (
    <section className="mt-6" aria-labelledby="pending-approvals-heading">
      <h2 id="pending-approvals-heading" className="text-lg font-semibold">Pending approvals</h2>
      <p className="mt-1 text-sm text-neutral-500">Review and approve records for your current branch.</p>
      <div className="mt-4 grid gap-5">
        {visible.map(section => <ApprovalQueue key={`${identity}:${section.type}`} section={section} refreshKey={refreshKey} onSettled={onSettled} />)}
      </div>
    </section>
  );
}

function ApprovalQueue({ section, refreshKey, onSettled }: { section: ApprovalSection; refreshKey: number; onSettled: () => void }) {
  const { rows, meta, page, setPage, loading, error, reload, approvingId, approve } = useDashboardApprovals(section.type, refreshKey);
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const confirming = useRef(false);
  const payment = section.type === 'payments';
  const supplier = section.type === 'purchases' || section.type === 'purchase_returns';
  const busy = approvingId !== null;

  useEffect(() => {
    if (!selected || loading || busy) return;
    const current = rows.find(row => row.id === selected.id);
    if (!current?.canApprove || Number(current.amount) !== Number(selected.amount) || current.reference !== selected.reference || current.party !== selected.party || current.date !== selected.date) {
      setSelected(null);
      toast.info('This record changed. Review it again before approving.');
    }
  }, [rows, selected, loading, busy]);

  async function confirm() {
    if (!selected || confirming.current || loading) return;
    confirming.current = true;
    try {
      await approve(selected);
      toast.success(`${selected.reference} approved`);
    } catch (cause) {
      toast.error('Approval failed', { description: errorMessage(cause) });
    } finally {
      confirming.current = false;
      setSelected(null);
      onSettled();
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4 sm:p-5" aria-label={`${section.title} pending approval`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold">{section.title}</h3>
        {meta && !error ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">{meta.total} pending</span> : null}
        {payment ? <span className="text-xs text-neutral-500">All payment types</span> : null}
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span><Button variant="secondary" onClick={() => void reload()}>Retry</Button>
        </div>
      ) : loading && !rows.length ? (
        <div role="status" className="py-8 text-center text-sm text-neutral-500">Loading pending approvals…</div>
      ) : !rows.length ? (
        <div className="rounded-md bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">No pending {section.title.toLowerCase()}.</div>
      ) : (
        <div className="relative overflow-x-auto" aria-busy={loading}>
          <table className={`w-full text-left text-sm ${payment ? 'min-w-[1100px]' : 'min-w-[760px]'}`}>
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="rounded-l-md px-3 py-3 font-medium">Reference</th>
                <th className="px-3 py-3 font-medium">Date</th>
                {payment ? <th className="px-3 py-3 font-medium">Type / Direction</th> : null}
                <th className="px-3 py-3 font-medium">{payment ? 'Party' : supplier ? 'Supplier' : 'Customer'}</th>
                {payment ? <th className="px-3 py-3 font-medium">Account</th> : null}
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="rounded-r-md px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-neutral-100">
                  <td className="px-3 py-3 font-medium">{row.reference}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-neutral-600">{row.date || '—'}</td>
                  {payment ? <td className="px-3 py-3"><div>{row.paymentType}</div><div className="text-xs text-neutral-500">{row.direction}</div></td> : null}
                  <td className="px-3 py-3">{row.party}</td>
                  {payment ? <td className="px-3 py-3">{row.account}</td> : null}
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{amount(row.amount)}</td>
                  <td className="px-3 py-3"><span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">Pending</span></td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={approvalDetailPath(section.type, row.id)} className="inline-flex h-8 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium hover:bg-neutral-50" aria-label={`View ${row.reference}`}>View</Link>
                      <Button className="h-8 px-3 text-xs" disabled={loading || busy || !row.canApprove} onClick={() => setSelected(row)} aria-label={`Approve ${row.reference}`}>
                        {approvingId === row.id ? 'Approving…' : 'Approve'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm" role="status">Refreshing…</div> : null}
        </div>
      )}
      {meta ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>10 per page · {meta.from ?? 0}–{meta.to ?? 0} of {meta.total}</span>
          <nav className="flex items-center gap-2" aria-label={`${section.title} pagination`}>
            <Button variant="secondary" className="h-8 px-3 text-xs" disabled={loading || busy || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="px-1 text-neutral-800">Page {page} of {Math.max(1, meta.last_page)}</span>
            <Button variant="secondary" className="h-8 px-3 text-xs" disabled={loading || busy || page >= meta.last_page} onClick={() => setPage(page + 1)}>Next</Button>
          </nav>
        </div>
      ) : null}
      <Modal title="Confirm approval" open={selected !== null} onOpenChange={open => { if (!open && !confirming.current) setSelected(null); }}>
        <p className="text-sm text-neutral-700">Approve <strong>{selected?.reference}</strong> for <strong>{amount(selected?.amount ?? 0)}</strong>? This posts the record’s stock or financial effects.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button>
          <Button disabled={busy || loading} onClick={() => void confirm()}>{busy ? 'Approving…' : 'Approve'}</Button>
        </div>
      </Modal>
    </section>
  );
}
