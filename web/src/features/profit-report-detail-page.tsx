'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { EmptyState, TableWrap } from '@/components/resource-shell';
import { api } from '@/lib/api';
import type { ProfitReportDetail } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export function ProfitReportDetailPage({
  metric,
  startDate,
  endDate,
  warehouseId,
  search,
}: {
  metric: string;
  startDate?: string;
  endDate?: string;
  warehouseId?: string;
  search?: string;
}) {
  const [detail, setDetail] = useState<ProfitReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warehouseNumber = warehouseId ? Number(warehouseId) : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.profitReportDetail({
        metric,
        startDate,
        endDate,
        warehouseId: Number.isFinite(warehouseNumber) ? warehouseNumber : undefined,
        search,
      });
      setDetail(response);
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error('Detail report failed', { description: message });
    } finally {
      setLoading(false);
    }
  }, [endDate, metric, search, startDate, warehouseNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const backHref = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (warehouseId) params.set('warehouse_id', warehouseId);
    if (search) params.set('search', search);
    return `/reports/profit${params.toString() ? `?${params.toString()}` : ''}`;
  }, [endDate, search, startDate, warehouseId]);

  const isMargin = detail?.metric.value_type === 'percent';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href={backHref} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white hover:bg-neutral-50" aria-label="Back to profit report">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{detail?.metric.label ?? 'Profit Detail'}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {detail ? `${formatDate(detail.filters.start_date)} - ${formatDate(detail.filters.end_date)}${detail.filters.warehouse ? ` · ${detail.filters.warehouse.name}` : ''}` : 'Loading detail'}
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_2fr]">
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium uppercase text-neutral-500">Final Total</div>
          <div className="mt-2 text-3xl font-semibold text-neutral-950">{formatValue(detail?.summary.total ?? 0, detail?.summary.total_type)}</div>
          <div className="mt-2 text-sm text-neutral-500">{detail?.summary.row_count ?? 0} entries</div>
        </section>
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-neutral-950">Summation</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(detail?.summary.components ?? []).map((component) => (
              <div key={component.label} className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 text-sm">
                <span className="text-neutral-600">{component.label}</span>
                <span className="font-medium text-neutral-950">{money(component.amount)}</span>
              </div>
            ))}
            {detail && detail.summary.components.length === 0 ? (
              <div className="text-sm text-neutral-500">Rows below sum to the final total.</div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3 font-semibold text-neutral-950">Entries</div>
        <TableWrap loading={loading}>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                {(isMargin ? ['Product', 'Revenue', 'Profit', 'Margin'] : ['Date', 'Reference', 'Type', 'Description', 'Amount']).map((column, index) => (
                  <th key={column} className={`px-4 py-3 font-medium ${index === (isMargin ? 3 : 4) ? 'text-right' : ''}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(detail?.rows ?? []).map((row, index) => (
                <tr key={`${row.reference ?? row.label}-${index}`}>
                  {isMargin ? (
                    <>
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-950">{row.label}</div>
                        <div className="text-xs text-neutral-500">{row.reference}</div>
                      </td>
                      <td className="px-4 py-3">{money(row.revenue ?? 0)}</td>
                      <td className="px-4 py-3">{money(row.profit ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-medium">{percent(row.amount)}</td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{row.date ? formatDate(row.date) : '-'}</td>
                      <td className="px-4 py-3 font-medium text-neutral-950">{row.reference ?? '-'}</td>
                      <td className="px-4 py-3">{row.type}</td>
                      <td className="px-4 py-3 text-neutral-600">{row.description || row.label}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatValue(row.amount, row.amount_type)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {!loading && detail?.rows.length === 0 ? <EmptyState label="No entries matched these filters." /> : null}
      </section>
    </div>
  );
}

function formatValue(value: number, type?: string) {
  return type === 'percent' ? percent(value) : money(value);
}

function money(value: number) {
  return `৳${number(value)}`;
}

function percent(value: number) {
  return `${number(value)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
