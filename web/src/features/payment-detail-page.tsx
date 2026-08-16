'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActivityLogTimeline } from '@/components/activity-log';
import { api } from '@/lib/api';
import type { Payment } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

const paymentTypeLabels: Record<string, string> = {
  sale_payment: 'Sale payment',
  customer_advance: 'Customer advance',
  purchase_payment: 'Purchase payment',
  supplier_advance: 'Supplier advance',
  sale_return_refund: 'Sale return refund',
  purchase_return_refund: 'Purchase return refund',
};

export function PaymentDetailPage({ paymentId }: { paymentId: number }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.payment(paymentId)
      .then((response) => {
        if (!cancelled) setPayment(response.data);
      })
      .catch((error) => {
        if (!cancelled) toast.error('Unable to load payment', { description: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment Details</h1>
          <p className="mt-1 text-sm text-neutral-500">{payment?.payment_reference ?? 'Loading payment record'}</p>
        </div>
        <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/payments">Back</Link>
      </div>

      {loading ? <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading payment...</div> : null}

      {payment ? (
        <>
          <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap gap-6">
              <Summary label="Reference" value={payment.payment_reference} />
              <Summary label="Type" value={paymentTypeLabels[payment.payment_type] ?? payment.payment_type} />
              <Summary label="Party" value={payment.customer?.name ?? payment.supplier?.name ?? '-'} />
              <Summary label="Account" value={payment.account?.name ?? '-'} />
              <Summary label="Document" value={documentLabel(payment)} />
              <Summary label="Method" value={payment.paying_method} />
              <Summary label="Approval" value={String(payment.approval_status ?? 'approved')} />
              <Summary label="Amount" value={`${payment.direction === 'in' ? '+' : '-'}${money(payment.amount)}`} strong />
              <Summary label="Discount" value={money(payment.discount_amount ?? 0)} />
              <Summary label="Total Settled" value={money(payment.settled_amount ?? (payment.payment_type === 'customer_advance' ? Number(payment.amount) - Number(payment.discount_amount ?? 0) : Number(payment.amount) + Number(payment.discount_amount ?? 0)))} strong />
            </div>
            {payment.payment_note ? <div className="border-t border-neutral-100 pt-3 text-sm text-neutral-600">{payment.payment_note}</div> : null}
          </section>
          <ActivityLogTimeline logs={payment.activity_logs ?? []} />
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className={strong ? 'text-base font-semibold text-neutral-950' : 'text-sm font-medium text-neutral-900'}>{value}</div>
    </div>
  );
}

function documentLabel(payment: Payment): string {
  return payment.reference_document?.reference_no || payment.sale?.reference_no || payment.purchase?.reference_no || payment.sale_return?.reference_no || payment.purchase_return?.reference_no || paymentTypeLabels[payment.payment_type] || '-';
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
