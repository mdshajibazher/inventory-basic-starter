'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  BadgePercent,
  Banknote,
  BarChart3,
  Download,
  Filter,
  Package,
  ReceiptText,
  RefreshCw,
  Repeat2,
  ShoppingCart,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select } from '@/components/ui';
import { EmptyState } from '@/components/resource-shell';
import { api } from '@/lib/api';
import type { ProfitReport, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { lossAmount } from './profit-loss-summary';

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

export function ProfitReportPage({
  initialStartDate = initialRange.start,
  initialEndDate = initialRange.end,
  initialWarehouseId = 'all',
  initialSearch = '',
}: {
  initialStartDate?: string;
  initialEndDate?: string;
  initialWarehouseId?: string;
  initialSearch?: string;
} = {}) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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
  const warehouseBreakdown = report?.warehouses ?? [];
  const categories = report?.categories ?? [];
  const expenses = report?.expenses ?? [];
  const cash = report?.cash ?? [];
  const totalDiscounts = (summary?.sales_discounts ?? 0) + (summary?.order_discounts ?? 0) + (summary?.coupon_discounts ?? 0) + (summary?.payment_discounts ?? 0);
  const totalItemsSold = products.reduce((total, product) => total + Number(product.qty_sold ?? 0), 0);
  const averageItemRevenue = totalItemsSold > 0 ? Number(summary?.net_revenue ?? 0) / totalItemsSold : 0;
  const profitPerProduct = products.length > 0 ? Number(summary?.net_profit ?? 0) / products.length : 0;
  const detailHref = (metric: string) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (warehouseId !== 'all') params.set('warehouse_id', warehouseId);
    if (debouncedSearch) params.set('search', debouncedSearch);
    return `/reports/profit/details/${metric}?${params.toString()}`;
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await api.exportProfitReportPdf({
        startDate,
        endDate,
        warehouseId: warehouseId === 'all' ? undefined : Number(warehouseId),
        search: debouncedSearch,
      });
    } catch (caught) {
      toast.error('PDF export failed', { description: errorMessage(caught) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profit Loss Report</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {report ? `${formatDate(report.filters.start_date)} - ${formatDate(report.filters.end_date)}` : 'Current month'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" className="bg-black shadow-sm hover:bg-neutral-800" onClick={() => void exportPdf()} disabled={exporting}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr_1fr_auto]">
          <div>
            <div className="mb-1.5 text-sm font-medium text-neutral-950">Date Range</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <Field label="Warehouse">
            <Select value={warehouseId} onValueChange={setWarehouseId} options={warehouseOptions} />
          </Field>
          <Field label="Category">
            <Select value="all" onValueChange={() => undefined} options={[{ value: 'all', label: 'All categories' }, ...categories.map((category) => ({ value: String(category.id), label: category.name }))]} />
          </Field>
          <Field label="Product">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product code or name" />
          </Field>
          <div className="flex items-end">
            <Button type="button" className="w-full bg-black px-5 hover:bg-neutral-800" onClick={() => void load()} disabled={loading}>
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard href={detailHref('net_revenue')} icon={Banknote} tone="emerald" label="Net revenue" value={money(summary?.net_revenue)} />
        <SummaryCard href={detailHref('gross_profit')} icon={BarChart3} tone="blue" label="Gross profit" value={money(summary?.gross_profit)} subValue={`COGS ${money(summary?.net_cost_of_goods_sold)}`} />
        <SummaryCard href={detailHref('expenses')} icon={ReceiptText} tone="violet" label="Expenses" value={money(summary?.expenses)} />
        <SummaryCard href={detailHref('net_profit')} icon={Wallet} tone="green" label="Net profit" value={money(summary?.net_profit)} />
        <SummaryCard href={detailHref('gross_profit')} icon={TrendingDown} tone="rose" label="Gross loss" value={money(lossAmount(summary?.gross_profit))} subValue="When gross profit is negative" />
        <SummaryCard href={detailHref('net_profit')} icon={TrendingDown} tone="rose" label="Net loss" value={money(lossAmount(summary?.net_profit))} subValue="When net profit is negative" />
        <SummaryCard href={detailHref('margin')} icon={BadgePercent} tone="amber" label="Margin" value={percent(summary?.margin_percent)} />
        <SummaryCard href={detailHref('cash_in')} icon={ArrowDownToLine} tone="green" label="Cash in" value={money(summary?.cash_in)} />
        <SummaryCard href={detailHref('cash_out')} icon={ArrowUpFromLine} tone="rose" label="Cash out" value={money(summary?.cash_out)} />
        <SummaryCard href={detailHref('net_cash_movement')} icon={Repeat2} tone="indigo" label="Cash movement" value={money(summary?.net_cash_movement)} />
        <SummaryCard href={detailHref('tax')} icon={ReceiptText} tone="rose" label="Tax" value={money(summary?.tax_collected)} subValue={`Returned ${money(summary?.tax_returned)}`} />
        <SummaryCard href={detailHref('returns')} icon={Repeat2} tone="orange" label="Returns" value={money(summary?.returns)} subValue={`Sales cost ${money(summary?.return_cost)}`} />
        <SummaryCard href={detailHref('purchase_returns')} icon={ShoppingCart} tone="blue" label="Purchase returns" value={money(summary?.purchase_return_cost)} subValue="COGS reduction" />
        <SummaryCard href={detailHref('discounts')} icon={BadgePercent} tone="amber" label="Discounts" value={money(totalDiscounts)} subValue={`Shipping ${money(summary?.shipping)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.8fr_0.6fr]">
        <ProfitOverview products={products} expenses={Number(summary?.expenses ?? 0)} />
        <ProfitDistribution
          grossProfit={Number(summary?.gross_profit ?? 0)}
          expenses={Number(summary?.expenses ?? 0)}
          netProfit={Number(summary?.net_profit ?? 0)}
        />
        <div className="grid gap-3">
          <SideMetric icon={ShoppingCart} tone="green" label="Product Lines" value={number(products.length)} />
          <SideMetric icon={Package} tone="blue" label="Total Items Sold" value={number(totalItemsSold)} />
          <SideMetric icon={ReceiptText} tone="violet" label="Avg. Item Revenue" value={money(averageItemRevenue)} />
          <SideMetric icon={BadgePercent} tone="orange" label="Profit per Product" value={money(profitPerProduct)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniTable
          title="Cash Movement"
          columns={['Type', 'Direction', 'Amount']}
          rows={cash.map((row) => [row.label, row.direction === 'in' ? 'In' : 'Out', money(row.amount)])}
          empty="No cash movement in this date range."
        />
        <MiniTable
          title="Top Expenses"
          columns={['Category', 'Amount']}
          rows={expenses.map((row) => [row.category_name, money(row.amount)])}
          empty="No expenses in this date range."
        />
        <BreakdownTable title="Warehouse Profit" rows={warehouseBreakdown} empty="No warehouse rows in this date range." />
        <BreakdownTable title="Category Profit" rows={categories} empty="No category rows in this date range." hideExpenses />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3 font-semibold text-neutral-950">Product Profit Breakdown</div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Sold</th>
              <th className="px-4 py-3 text-right">Returned</th>
              <th className="px-4 py-3 text-right">Net sales</th>
              <th className="px-4 py-3 text-right">Net returns</th>
              <th className="px-4 py-3 text-right">Purchase returns</th>
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
                <td className="px-4 py-3 text-right">{money(product.purchase_return_cost)}</td>
                <td className="px-4 py-3 text-right">{money(product.cost)}</td>
                <td className="px-4 py-3 text-right font-medium">{money(product.profit)}</td>
                <td className="px-4 py-3 text-right">{percent(product.margin_percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {!loading && products.length === 0 ? <EmptyState label="No product sales or returns matched these filters." /> : null}
        {loading ? <div className="p-4 text-sm text-neutral-500">Loading report...</div> : null}
      </div>
      <div className="text-center text-sm text-neutral-500">Report generated on {new Date().toLocaleString()}</div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  empty,
  hideExpenses = false,
}: {
  title: string;
  rows: ProfitReport['warehouses'];
  empty: string;
  hideExpenses?: boolean;
}) {
  return (
    <MiniTable
      title={title}
      columns={hideExpenses ? ['Name', 'Revenue', 'Cost', 'Purchase returns', 'Profit', 'Margin'] : ['Name', 'Revenue', 'Cost', 'Purchase returns', 'Expenses', 'Profit', 'Margin']}
      rows={rows.map((row) => (
        hideExpenses
          ? [row.name, money(row.net_revenue), money(row.cost), money(row.purchase_return_cost), money(row.net_profit), percent(row.margin_percent)]
          : [row.name, money(row.net_revenue), money(row.cost), money(row.purchase_return_cost), money(row.expenses), money(row.net_profit), percent(row.margin_percent)]
      ))}
      empty={empty}
    />
  );
}

function MiniTable({ title, columns, rows, empty }: { title: string; columns: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-4 py-3 font-semibold text-neutral-950">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={`px-4 py-3 ${index > 0 ? 'text-right' : ''}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                {row.map((cell, index) => (
                  <td key={`${title}-${rowIndex}-${index}`} className={`px-4 py-3 ${index > 0 ? 'text-right' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <EmptyState label={empty} /> : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  subValue,
  href,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  subValue?: string;
  href: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClass(tone, 'soft')} ${toneClass(tone, 'text')}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <ArrowUp className="h-3 w-3 text-emerald-600" />
          <span>{subValue ?? '100% vs previous range'}</span>
        </div>
      </div>
    </Link>
  );
}

function SideMetric({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass(tone, 'soft')} ${toneClass(tone, 'text')}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium text-slate-500">{label}</div>
      </div>
      <div className="text-lg font-bold text-slate-950">{value}</div>
    </div>
  );
}

function ProfitOverview({ products, expenses }: { products: ProfitReport['products']; expenses: number }) {
  const points = overviewPoints(products, expenses);
  const netPath = linePath(points.map((point) => point.net), 620, 180);
  const grossPath = linePath(points.map((point) => point.gross), 620, 180);
  const expensePath = linePath(points.map((point) => point.expenses), 620, 180);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-neutral-950">Profit Overview</h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <Legend color="bg-emerald-500" label="Net Profit" />
          <Legend color="bg-blue-500" label="Gross Profit" />
          <Legend color="bg-red-500" label="Expenses" />
        </div>
      </div>
      <svg viewBox="0 0 680 230" className="h-64 w-full overflow-visible">
        {[0, 1, 2, 3, 4].map((line) => (
          <g key={line}>
            <line x1="46" x2="666" y1={20 + line * 40} y2={20 + line * 40} stroke="#e5e7eb" strokeWidth="1" />
          </g>
        ))}
        <line x1="46" x2="46" y1="20" y2="200" stroke="#e5e7eb" />
        <line x1="46" x2="666" y1="200" y2="200" stroke="#e5e7eb" />
        <path d={netPath} fill="none" stroke="#22c55e" strokeWidth="3" />
        <path d={grossPath} fill="none" stroke="#3b82f6" strokeWidth="3" />
        <path d={expensePath} fill="none" stroke="#ef4444" strokeWidth="3" />
        {points.map((point, index) => (
          <text key={`${point.label}-${index}`} x={46 + (index * 620) / Math.max(points.length - 1, 1)} y="224" textAnchor="middle" className="fill-slate-500 text-[11px]">
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function ProfitDistribution({ grossProfit, expenses, netProfit }: { grossProfit: number; expenses: number; netProfit: number }) {
  const total = Math.max(Math.abs(grossProfit) + Math.abs(expenses) + Math.abs(netProfit), 1);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-5 font-semibold text-neutral-950">Profit Distribution</h2>
      <div className="grid grid-cols-3 gap-4">
        <Donut label="Gross Profit" value={money(grossProfit)} percent={(Math.abs(grossProfit) / total) * 100} color="#22c55e" />
        <Donut label="Expenses" value={money(expenses)} percent={(Math.abs(expenses) / total) * 100} color="#8b5cf6" />
        <Donut label="Net Profit" value={money(netProfit)} percent={(Math.abs(netProfit) / total) * 100} color="#22c55e" />
      </div>
    </div>
  );
}

function Donut({ label, value, percent: percentValue, color }: { label: string; value: string; percent: number; color: string }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.min(Math.max(percentValue, 0), 100) / 100;

  return (
    <div className="text-center">
      <svg viewBox="0 0 100 100" className="mx-auto h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
        <text x="50" y="54" textAnchor="middle" className="rotate-90 origin-center fill-slate-950 text-xs font-bold">{number(percentValue)}%</text>
      </svg>
      <div className="mt-2 text-sm text-slate-600">{label}</div>
      <div className="font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`h-2 w-5 rounded-full ${color}`} />{label}</span>;
}

type Tone = 'emerald' | 'blue' | 'violet' | 'green' | 'amber' | 'rose' | 'indigo' | 'orange';

function toneClass(tone: Tone, part: 'soft' | 'text') {
  const classes: Record<Tone, Record<'soft' | 'text', string>> = {
    emerald: { soft: 'bg-emerald-100', text: 'text-emerald-600' },
    blue: { soft: 'bg-blue-100', text: 'text-blue-600' },
    violet: { soft: 'bg-violet-100', text: 'text-violet-600' },
    green: { soft: 'bg-green-100', text: 'text-green-600' },
    amber: { soft: 'bg-amber-100', text: 'text-amber-600' },
    rose: { soft: 'bg-rose-100', text: 'text-rose-600' },
    indigo: { soft: 'bg-indigo-100', text: 'text-indigo-600' },
    orange: { soft: 'bg-orange-100', text: 'text-orange-600' },
  };

  return classes[tone][part];
}

function overviewPoints(products: ProfitReport['products'], expenses: number) {
  const rows = products.slice(0, 8);
  if (!rows.length) return [{ label: 'No data', net: 0, gross: 0, expenses }];

  let net = 0;
  let gross = 0;
  return rows.map((product, index) => {
    net += Number(product.profit ?? 0);
    gross += Number(product.gross_profit ?? product.profit ?? 0);
    return {
      label: product.name.length > 8 ? `${product.name.slice(0, 8)}...` : product.name,
      net,
      gross,
      expenses: expenses * ((index + 1) / rows.length),
    };
  });
}

function linePath(values: number[], width: number, height: number) {
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;

  return values.map((value, index) => {
    const x = 46 + (index * width) / Math.max(values.length - 1, 1);
    const y = 20 + height - ((value - min) / range) * height;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
}

function money(value?: number) {
  return `৳${number(value ?? 0)}`;
}

function percent(value?: number) {
  return `${number(value ?? 0)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
