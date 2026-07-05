'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input } from '@/components/ui';
import { EmptyState, TableWrap } from '@/components/resource-shell';
import { api } from '@/lib/api';
import type { DatewiseProductReport } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

type ProductOption = {
  id: number;
  name: string;
  code?: string | null;
};

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

const initialRange = currentMonthRange();

export function DatewiseProductReportPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<DatewiseProductReport | null>(null);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedProduct) {
      setError('Product is required.');
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.datewiseProductReport({
        productId: selectedProduct.id,
        startDate,
        endDate,
      });
      setReport(response);
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error('Report failed', { description: message });
    } finally {
      setLoading(false);
    }
  }, [endDate, selectedProduct, startDate]);

  useEffect(() => {
    if (!hasPermission('reports-profit')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setProductsLoading(true);
      try {
        const response = await api.products({ perPage: 20, search: productQuery.trim() });
        setProductOptions(response.data as ProductOption[]);
      } catch (caught) {
        toast.error('Product search failed', { description: errorMessage(caught) });
      } finally {
        setProductsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [productQuery]);

  const exportPdf = async () => {
    if (!selectedProduct) {
      setError('Product is required.');
      return;
    }

    setExporting(true);
    try {
      await api.exportDatewiseProductReportPdf({
        productId: selectedProduct.id,
        startDate,
        endDate,
      });
    } catch (caught) {
      toast.error('PDF export failed', { description: errorMessage(caught) });
    } finally {
      setExporting(false);
    }
  };

  const rows = report?.rows ?? [];
  const summary = report?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Datewise Product Report</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {report ? `${report.filters.product.name} · ${report.filters.start_date} to ${report.filters.end_date}` : 'Select a product to generate the report'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" onClick={() => void exportPdf()} disabled={exporting || !report}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <form
        className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <ProductLookup
          value={selectedProduct}
          query={productQuery}
          options={productOptions}
          open={productOpen}
          loading={productsLoading}
          onQueryChange={(value) => {
            setProductQuery(value);
            setSelectedProduct(null);
            setReport(null);
            setProductOpen(true);
          }}
          onOpenChange={setProductOpen}
          onSelect={(product) => {
            setSelectedProduct(product);
            setProductQuery(productLabel(product));
            setProductOpen(false);
            setReport(null);
            setError(null);
          }}
        />
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={loading}>
            Submit
          </Button>
        </div>
      </form>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label="Total Sales Amount" value={number(summary?.total_sales_amount)} />
            <SummaryCard label="Total Return Amount" value={number(summary?.total_return_amount)} />
            <SummaryCard label="Total Sales Qty" value={number(summary?.total_sales_qty)} />
            <SummaryCard label="Total Return Qty" value={number(summary?.total_return_qty)} />
            <SummaryCard label="Profitable Qty" value={number(summary?.profitable_qty)} />
            <SummaryCard label="Profitable Amount" value={number(summary?.profitable_amount)} />
          </div>

          <TableWrap>
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-600">
                <tr>
                  <th className="px-3 py-3">Sl.</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Customer Name</th>
                  <th className="px-3 py-3">Product Name</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3 text-right">Unit Price</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {rows.map((row) => (
                  <tr key={`${row.type}-${row.sl}`}>
                    <td className="px-3 py-3">{row.sl}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-3">{row.customer_name}</td>
                    <td className="px-3 py-3">{row.product_name}</td>
                    <td className="px-3 py-3">{row.unit || '-'}</td>
                    <td className="px-3 py-3 text-right">{number(row.unit_price)}</td>
                    <td className="px-3 py-3 text-right">{number(row.qty)}</td>
                    <td className="px-3 py-3">{row.type}</td>
                    <td className="px-3 py-3 text-right font-medium">{number(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 ? <EmptyState label="No product rows found in this date range." /> : null}
            {loading ? <div className="p-4 text-sm text-neutral-500">Loading report...</div> : null}
          </TableWrap>

          <div className="space-y-3 text-right text-sm">
            <p><span className="font-medium">Sales In Words:</span> {summary?.sales_in_words ?? ''}</p>
            <p><span className="font-medium">Returns In Words:</span> {summary?.returns_in_words ?? ''}</p>
          </div>
        </>
      ) : (
        <EmptyState label="Select a product and submit to view this report." />
      )}
    </div>
  );
}

function ProductLookup({
  value,
  query,
  options,
  open,
  loading,
  onQueryChange,
  onOpenChange,
  onSelect,
}: {
  value: ProductOption | null;
  query: string;
  options: ProductOption[];
  open: boolean;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: ProductOption) => void;
}) {
  return (
    <Field label="Product">
      <div className="relative">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onOpenChange(true)}
          placeholder="Search and select product"
          required
          aria-invalid={!value && query.length > 0}
        />
        {open ? (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
            {loading ? <div className="px-3 py-2 text-sm text-neutral-500">Searching products...</div> : null}
            {!loading && options.length === 0 ? <div className="px-3 py-2 text-sm text-neutral-500">No products found.</div> : null}
            {options.map((product) => (
              <button
                key={product.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(product)}
              >
                <span className="font-medium">{product.name}</span>
                {product.code ? <span className="ml-2 text-xs text-neutral-500">{product.code}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function number(value?: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value ?? 0);
}

function productLabel(product: ProductOption) {
  return product.name;
}
