'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input } from '@/components/ui';
import { EmptyState } from '@/components/resource-shell';
import { api } from '@/lib/api';
import type { Customer, CustomerLedgerReport } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { StatementDocument } from './customer-statement-page';

type CustomerOption = Pick<Customer, 'id' | 'name' | 'phone_number' | 'email'>;

function currentYearRange() {
  const now = new Date();

  return {
    from: `${now.getFullYear()}-01-01`,
    to: now.toISOString().slice(0, 10),
  };
}

const initialRange = currentYearRange();

export function CustomerStatementReportPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<CustomerLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedCustomer) {
      setError('Customer is required.');
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.customerLedger(selectedCustomer.id, { from, to });
      setReport(response.data);
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error('Statement failed', { description: message });
    } finally {
      setLoading(false);
    }
  }, [from, selectedCustomer, to]);

  useEffect(() => {
    if (!hasPermission('reports-profit')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setCustomersLoading(true);
      try {
        const response = await api.customers({ perPage: 20, search: customerQuery.trim() });
        setCustomerOptions(response.data as CustomerOption[]);
      } catch (caught) {
        toast.error('Customer search failed', { description: errorMessage(caught) });
      } finally {
        setCustomersLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [customerQuery]);

  function printReport() {
    window.print();
  }

  return (
    <div className="statement-screen space-y-6">
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer Statement</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {report ? `${report.customer.name} · ${report.filters.from} to ${report.filters.to}` : 'Select a customer to generate the statement'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" disabled={!report} onClick={printReport}>
            <FileText className="h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <form
        className="grid gap-3 print:hidden md:grid-cols-[1.4fr_1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <CustomerLookup
          value={selectedCustomer}
          query={customerQuery}
          options={customerOptions}
          open={customerOpen}
          loading={customersLoading}
          onQueryChange={(value) => {
            setCustomerQuery(value);
            setSelectedCustomer(null);
            setReport(null);
            setCustomerOpen(true);
          }}
          onOpenChange={setCustomerOpen}
          onSelect={(customer) => {
            setSelectedCustomer(customer);
            setCustomerQuery(customerLabel(customer));
            setCustomerOpen(false);
            setReport(null);
            setError(null);
          }}
        />
        <Field label="From">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={loading}>
            Submit
          </Button>
        </div>
      </form>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 print:hidden">{error}</div> : null}

      {report ? (
        <StatementDocument report={report} />
      ) : (
        <div className="print:hidden">
          <EmptyState label={loading ? 'Loading statement...' : 'Select a customer and submit to view this statement.'} />
        </div>
      )}
    </div>
  );
}

function CustomerLookup({
  value,
  query,
  options,
  open,
  loading,
  onQueryChange,
  onOpenChange,
  onSelect,
}: {
  value: CustomerOption | null;
  query: string;
  options: CustomerOption[];
  open: boolean;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: CustomerOption) => void;
}) {
  return (
    <Field label="Customer">
      <div className="relative">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onOpenChange(true)}
          placeholder="Search and select customer"
          required
          aria-invalid={!value && query.length > 0}
        />
        {open ? (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
            {loading ? <div className="px-3 py-2 text-sm text-neutral-500">Searching customers...</div> : null}
            {!loading && options.length === 0 ? <div className="px-3 py-2 text-sm text-neutral-500">No customers found.</div> : null}
            {options.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(customer)}
              >
                <span className="block font-medium">{customer.name}</span>
                <span className="block text-xs text-neutral-500">{customer.phone_number || customer.email || '-'}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function customerLabel(customer: CustomerOption) {
  return customer.phone_number ? `${customer.name} (${customer.phone_number})` : customer.name;
}
