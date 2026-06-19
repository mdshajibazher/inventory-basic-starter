'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select } from '@/components/ui';
import { EmptyState, TableWrap } from '@/components/resource-shell';
import { api } from '@/lib/api';
import type { ProfitReport, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const initialRange = monthRange();

export function ProfitReportPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [warehouseId, setWarehouseId] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.profitReport({
        startDate,
        endDate,
        warehouseId: warehouseId === 'all' ? undefined : Number(warehouseId),
        search: debouncedSearch,
      });
      setReport(response);
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error('Report failed', { description: message });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, endDate, startDate, warehouseId]);

  useEffect(() => {
    if (!hasPermission('reports-profit')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    async function loadWarehouses() {
      try {
        const response = await api.warehouses({ perPage: 100, activeOnly: true });
        setWarehouses(response.data as Warehouse[]);
      } catch (caught) {
        toast.error('Warehouse options failed', { description: errorMessage(caught) });
      }
    }

    void loadWarehouses();
  }, []);

  const warehouseOptions = useMemo(() => [
    { value: 'all', label: 'All warehouses' },
    ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })),
  ], [warehouses]);

  const summary = report?.summary;
  const products = report?.products ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profit Report</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {report ? `${report.filters.start_date} to ${report.filters.end_date}` : 'Current month'}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </Field>
        <Field label="Warehouse">
          <Select value={warehouseId} onValueChange={setWarehouseId} options={warehouseOptions} />
        </Field>
        <Field label="Search">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product code or name" />
        </Field>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard label="Net revenue" value={money(summary?.net_revenue)} />
        <SummaryCard label="COGS" value={money(summary?.cost_of_goods_sold)} />
        <SummaryCard label="Net profit" value={money(summary?.net_profit)} />
        <SummaryCard label="Margin" value={percent(summary?.margin_percent)} />
        <SummaryCard label="Tax" value={money(summary?.tax_collected)} subValue={`Returned ${money(summary?.tax_returned)}`} />
        <SummaryCard label="Returns" value={money(summary?.returns)} subValue={`Cost ${money(summary?.return_cost)}`} />
      </div>

      <TableWrap>
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Sold</th>
              <th className="px-4 py-3 text-right">Returned</th>
              <th className="px-4 py-3 text-right">Net sales</th>
              <th className="px-4 py-3 text-right">Net returns</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Profit</th>
              <th className="px-4 py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {products.map((product) => (
              <tr key={product.product_id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-950">{product.name}</div>
                  <div className="text-xs text-neutral-500">{product.code}</div>
                </td>
                <td className="px-4 py-3 text-right">{number(product.qty_sold)}</td>
                <td className="px-4 py-3 text-right">{number(product.qty_returned)}</td>
                <td className="px-4 py-3 text-right">{money(product.net_sales)}</td>
                <td className="px-4 py-3 text-right">{money(product.net_returns)}</td>
                <td className="px-4 py-3 text-right">{money(product.cost)}</td>
                <td className="px-4 py-3 text-right font-medium">{money(product.profit)}</td>
                <td className="px-4 py-3 text-right">{percent(product.margin_percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && products.length === 0 ? <EmptyState label="No product sales or returns matched these filters." /> : null}
        {loading ? <div className="p-4 text-sm text-neutral-500">Loading report...</div> : null}
      </TableWrap>
    </div>
  );
}

function SummaryCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase text-neutral-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-neutral-950">{value}</div>
      {subValue ? <div className="mt-1 text-xs text-neutral-500">{subValue}</div> : null}
    </div>
  );
}

function money(value?: number) {
  return `$${number(value ?? 0)}`;
}

function percent(value?: number) {
  return `${number(value ?? 0)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
