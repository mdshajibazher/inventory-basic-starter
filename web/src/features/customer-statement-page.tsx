'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import type { CustomerLedgerReport } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export function CustomerStatementPage({ customerId }: { customerId: number }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yearStart = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<CustomerLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.customerLedger(customerId, { from, to });
      setReport(response.data);
    } catch (error) {
      toast.error('Statement failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [customerId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function printReport() {
    window.print();
  }

  return (
    <div className="statement-screen">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link className="text-sm font-medium text-neutral-600 hover:text-black" href="/customers">
            Back to customers
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Customer Statement</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? 'Loading...' : 'Load'}
          </Button>
          <Button type="button" disabled={!report} onClick={printReport}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      {report ? <StatementDocument report={report} /> : <div className="rounded-md border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">{loading ? 'Loading statement...' : 'No statement loaded.'}</div>}
    </div>
  );
}

function StatementDocument({ report }: { report: CustomerLedgerReport }) {
  return (
    <article className="statement-page bg-white text-black">
      <header className="text-center">
        <h2 className="font-serif text-3xl font-bold">Customer Statement</h2>
        <p className="mt-5 text-xl font-bold">{report.company.name}</p>
        <div className="mx-auto mt-8 max-w-xl text-lg leading-7">
          {report.company.address ? <p>{report.company.address}</p> : null}
          {report.company.email ? <p><strong>Email :</strong> {report.company.email}</p> : null}
          {report.company.phone ? <p><strong>Phone:</strong> {report.company.phone}</p> : null}
        </div>
      </header>

      <section className="mt-9 text-lg">
        <p>Print Date: {formatDateTime(report.filters.printed_at)}</p>
        <dl className="mt-9 grid max-w-3xl grid-cols-[210px_1fr] gap-y-5">
          <dt>Customer Name :</dt>
          <dd>{report.customer.name}</dd>
          <dt>Email :</dt>
          <dd>{report.customer.email || ''}</dd>
          <dt>Phone :</dt>
          <dd>{report.customer.phone_number || ''}</dd>
          <dt>Address :</dt>
          <dd>{report.customer.address || ''}</dd>
        </dl>
      </section>

      <p className="mt-9 text-center text-lg font-bold">From {formatDate(report.filters.from)} To {formatDate(report.filters.to)}</p>

      <table className="mt-4 w-full border-collapse text-left text-lg">
        <thead>
          <tr className="bg-neutral-200">
            {['Date', 'Bill', 'Particular', 'Debit', 'Credit', 'Product', 'Balance'].map((header) => (
              <th key={header} className="border border-black px-2 py-3 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-2 py-3">{formatDate(report.filters.from)}</td>
            <td className="border border-black px-2 py-3">N/A</td>
            <td className="border border-black px-2 py-3">Balance</td>
            <td className="border border-black px-2 py-3" />
            <td className="border border-black px-2 py-3" />
            <td className="border border-black px-2 py-3" />
            <td className="border border-black px-2 py-3">{money(report.opening_balance)}</td>
          </tr>
          {report.rows.map((row) => (
            <tr key={`${row.type}-${row.id}-${row.date}`}>
              <td className="border border-black px-2 py-3 align-middle">{formatDate(row.date)}</td>
              <td className="border border-black px-2 py-3 align-middle">{row.bill || 'N/A'}</td>
              <td className="whitespace-pre-line border border-black px-2 py-3 align-middle">{row.particular}</td>
              <td className="border border-black px-2 py-3 align-middle">{money(row.debit)}</td>
              <td className="border border-black px-2 py-3 align-middle">{money(row.credit)}</td>
              <td className="border border-black px-2 py-3 align-top text-base leading-7">
                {row.product_lines.length ? (
                  <>
                    {row.product_lines.map((line) => <p key={line}>{line}</p>)}
                    <div className="my-2 border-t border-neutral-500" />
                    <p>Grand Total : {money(row.debit || row.credit)}</p>
                  </>
                ) : (
                  'not applicable'
                )}
              </td>
              <td className="border border-black px-2 py-3 align-middle">{money(row.balance)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="border border-black px-2 py-3" colSpan={3}>Total</td>
            <td className="border border-black px-2 py-3">{money(report.totals.debit)}</td>
            <td className="border border-black px-2 py-3">{money(report.totals.credit)}</td>
            <td className="border border-black px-2 py-3">Closing Balance</td>
            <td className="border border-black px-2 py-3">{money(report.totals.closing_balance)}</td>
          </tr>
        </tbody>
      </table>

      <style jsx global>{`
        .statement-page {
          margin: 0 auto;
          max-width: 1100px;
          min-height: 1120px;
          padding: 48px 56px;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          body {
            background: white !important;
          }

          .statement-screen {
            margin: 0 !important;
            padding: 0 !important;
          }

          .statement-page {
            max-width: none;
            min-height: auto;
            padding: 0;
          }
        }
      `}</style>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`)).replace(/ /g, '-');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${formatDate(date.toISOString().slice(0, 10))} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
}

function money(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || Math.abs(number) < 0.005) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
}
