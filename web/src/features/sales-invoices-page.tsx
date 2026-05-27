'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type SalesInvoicePayload } from '@/lib/api';
import type { Branch, Customer, Product, Tax, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

type ProductOptions = {
  taxes?: Tax[];
};

type InvoiceLine = {
  key: string;
  productId: string;
  qty: string;
  price: string;
  discount: string;
  taxRate: string;
};

type PaymentMode = 'unpaid' | 'partial' | 'paid';

type FormState = {
  referenceNo: string;
  customerId: string;
  warehouseId: string;
  billerId: string;
  orderTaxRate: string;
  orderDiscount: string;
  shippingCost: string;
  paymentMode: PaymentMode;
  paidAmount: string;
  paymentNote: string;
  saleNote: string;
  staffNote: string;
};

type SearchableSelectProps<T> = {
  label: string;
  valueLabel: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  keyFor: (option: T) => string | number;
  labelFor: (option: T) => string;
  detailFor?: (option: T) => string;
  onSelect: (option: T) => void;
};

const emptyLine = (): InvoiceLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: 'none',
  qty: '1',
  price: '0',
  discount: '0',
  taxRate: '0',
});

const emptyForm = (): FormState => ({
  referenceNo: generateReference(),
  customerId: 'none',
  warehouseId: 'none',
  billerId: 'none',
  orderTaxRate: '0',
  orderDiscount: '0',
  shippingCost: '0',
  paymentMode: 'unpaid',
  paidAmount: '0',
  paymentNote: '',
  saleNote: '',
  staffNote: '',
});

type InvoicePageMode = 'index' | 'create' | 'details' | 'edit';

export function SalesInvoicesPage({ mode = 'index', invoiceId }: { mode?: InvoicePageMode; invoiceId?: number }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [billers, setBillers] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const supportedProducts = useMemo(
    () => products.filter((product) => !product.is_variant && !product.is_batch && product.type !== 'digital'),
    [products]
  );
  const selectedCustomer = customers.find((customer) => String(customer.id) === form.customerId);
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.warehouseId);
  const totals = useMemo(() => calculateTotals(lines, form), [lines, form]);

  const searchCustomers = useCallback(async (query: string) => {
    const response = await api.customers({ perPage: 30, search: query.trim() });
    return response.data as Customer[];
  }, []);

  const searchWarehouses = useCallback(async (query: string) => {
    const response = await api.warehouses({ perPage: 30, search: query.trim(), activeOnly: true });
    return response.data as Warehouse[];
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    const response = await api.products({ perPage: 30, search: query.trim() });
    return (response.data as Product[]).filter(isInvoiceProductSupported);
  }, []);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [customerResponse, warehouseResponse, billerResponse, productResponse, productOptionsResponse] = await Promise.all([
        api.customers({ perPage: 30 }),
        api.warehouses({ perPage: 30, activeOnly: true }),
        api.branches({ perPage: 100, activeOnly: true }),
        api.products({ perPage: 30 }),
        api.productOptions(),
      ]);
      const nextCustomers = customerResponse.data as Customer[];
      const nextWarehouses = warehouseResponse.data as Warehouse[];
      const nextBillers = billerResponse.data as Branch[];
      const nextProducts = (productResponse.data as Product[]).filter(isInvoiceProductSupported);
      const productOptions = productOptionsResponse.data as ProductOptions;
      setCustomers(nextCustomers);
      setWarehouses(nextWarehouses);
      setBillers(nextBillers);
      setProducts(nextProducts);
      setTaxes(productOptions.taxes ?? []);
      setForm((current) => ({
        ...current,
        customerId: current.customerId === 'none' ? idValue(nextCustomers[0]?.id) : current.customerId,
        warehouseId: current.warehouseId === 'none' ? idValue(nextWarehouses[0]?.id) : current.warehouseId,
        billerId: current.billerId === 'none' ? idValue(nextBillers[0]?.id) : current.billerId,
      }));
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'create' && !hasPermission('sales-add')) router.replace('/dashboard');
    if (mode === 'edit' && !hasPermission('sales-edit')) router.replace('/dashboard');
  }, [hasPermission, mode, router]);

  useEffect(() => {
    void loadOptions();
    if (mode === 'index') void loadInvoices();
  }, [loadOptions]);

  useEffect(() => {
    if (!invoiceId || mode === 'index' || mode === 'create') return;
    void openInvoice(invoiceId, mode === 'edit' ? 'edit' : 'view');
  }, [invoiceId, mode]);

  async function loadInvoices() {
    setListLoading(true);
    try {
      const response = await api.salesInvoices({ perPage: 20 });
      setInvoices(response.data as Record<string, any>[]);
    } catch (error) {
      toast.error('Invoice list failed', { description: errorMessage(error) });
    } finally {
      setListLoading(false);
    }
  }

  function setValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine<K extends keyof InvoiceLine>(key: string, field: K, value: InvoiceLine[K]) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function selectProduct(lineKey: string, product: Product) {
    setProducts((current) => upsertById(current, product));
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              productId: String(product.id),
              price: String(product.selling_price ?? product.price ?? 0),
              taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
            }
          : line
      )
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  }

  function resetForm() {
    setForm({
      ...emptyForm(),
      customerId: idValue(customers[0]?.id),
      warehouseId: idValue(warehouses[0]?.id),
      billerId: idValue(billers[0]?.id),
    });
    setLines([emptyLine()]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload(form, lines, products, totals);
    if (!payload) return;

    setSaving(true);
    try {
      const response = editingId
        ? await api.updateSalesInvoice(editingId, payload)
        : await api.createSalesInvoice(payload);
      toast.success(response.message || (editingId ? 'Sales invoice updated' : 'Sales invoice created'));
      setEditingId(null);
      resetForm();
      void loadInvoices();
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function openInvoice(id: number, mode: 'view' | 'edit') {
    try {
      const response = await api.salesInvoice(id);
      const invoice = response.data as Record<string, any>;
      setSelectedInvoice(invoice);
      if (mode === 'edit') fillFormFromInvoice(invoice);
    } catch (error) {
      toast.error('Invoice load failed', { description: errorMessage(error) });
    }
  }

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      customerId: idValue(invoice.customer_id),
      warehouseId: idValue(invoice.warehouse_id),
      billerId: idValue(invoice.biller_id),
      orderTaxRate: String(invoice.order_tax_rate ?? '0'),
      orderDiscount: String(invoice.order_discount ?? '0'),
      shippingCost: String(invoice.shipping_cost ?? '0'),
      paymentMode: paymentModeFromStatus(Number(invoice.payment_status), Number(invoice.paid_amount)),
      paidAmount: String(invoice.paid_amount ?? '0'),
      paymentNote: invoice.payments?.[0]?.payment_note ?? '',
      saleNote: invoice.sale_note ?? '',
      staffNote: invoice.staff_note ?? '',
    });
    const nextLines = (invoice.products ?? []).map((line: Record<string, any>) => {
      const product = line.product as Product | undefined;
      if (product) setProducts((current) => upsertById(current, product));
      return {
        key: String(line.id ?? `${Date.now()}-${Math.random()}`),
        productId: String(line.product_id ?? product?.id ?? 'none'),
        qty: String(line.qty ?? '1'),
        price: String(line.net_unit_price ?? '0'),
        discount: String(line.discount ?? '0'),
        taxRate: String(line.tax_rate ?? '0'),
      };
    });
    setLines(nextLines.length ? nextLines : [emptyLine()]);
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      {mode === 'index' ? <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sales invoices</h2>
          <div className="flex gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href="/sales-invoices/create">Create invoice</Link>
            <Button type="button" variant="secondary" onClick={() => void loadInvoices()} disabled={listLoading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 font-medium">{invoice.reference_no}</td>
                  <td className="px-4 py-3">{invoice.customer?.name ?? '-'}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.grand_total))}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.paid_amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`/sales-invoices/${invoice.id}`}>Details</Link>
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`/sales-invoices/${invoice.id}/edit`}>Edit</Link>
                  </td>
                </tr>
              ))}
              {!invoices.length ? <tr><td className="px-4 py-6 text-center text-neutral-500" colSpan={5}>No invoices found</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section> : null}
      {mode === 'details' ? (
        <section className="grid gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Sales Invoice Details</h1>
            <div className="flex gap-2">
              <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/sales-invoices">Back</Link>
              {invoiceId ? <Link className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href={`/sales-invoices/${invoiceId}/edit`}>Edit</Link> : null}
            </div>
          </div>
          {selectedInvoice ? <InvoiceDetails invoice={selectedInvoice} /> : <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading invoice...</div>}
        </section>
      ) : null}
      {mode !== 'details' && mode !== 'index' ? <>
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Link className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/sales-invoices">Back to list</Link>
        <Button type="button" variant="secondary" disabled={saving} onClick={resetForm}>Reset</Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{editingId ? 'Edit Sales Invoice' : 'Sales Invoice'}</h1>
          <p className="mt-1 text-sm text-neutral-500">{editingId ? 'Update invoice fields and line items' : 'Create a completed sale with optional cash payment'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadOptions()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="submit" disabled={saving || loading}>{saving ? 'Saving...' : editingId ? 'Update invoice' : 'Create invoice'}</Button>
        </div>
      </div>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Invoice</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Reference no"><Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} /></Field>
          <SearchableSelect
            label="Customer"
            valueLabel={selectedCustomer?.name ?? 'Select customer'}
            placeholder="Search customers"
            search={searchCustomers}
            keyFor={(customer) => customer.id}
            labelFor={(customer) => customer.name}
            detailFor={(customer) => customer.phone_number || customer.email || customer.city}
            onSelect={(customer) => {
              setCustomers((current) => upsertById(current, customer));
              setValue('customerId', String(customer.id));
            }}
          />
          <SearchableSelect
            label="Warehouse"
            valueLabel={selectedWarehouse?.name ?? 'Select warehouse'}
            placeholder="Search warehouses"
            search={searchWarehouses}
            keyFor={(warehouse) => warehouse.id}
            labelFor={(warehouse) => warehouse.name}
            detailFor={(warehouse) => warehouse.address || warehouse.email || warehouse.phone || ''}
            onSelect={(warehouse) => {
              setWarehouses((current) => upsertById(current, warehouse));
              setValue('warehouseId', String(warehouse.id));
            }}
          />
          <Field label="Branch"><Select value={form.billerId} onValueChange={(value) => setValue('billerId', value)} options={billerOptions(billers)} /></Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Products</h2>
            {products.length !== supportedProducts.length ? <p className="mt-1 text-xs text-neutral-500">Variant, batch, and digital products are hidden in this first invoice form.</p> : null}
          </div>
          <Button type="button" variant="secondary" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                {['Product', 'Qty', 'Unit price', 'Discount', 'Tax %', 'Line total', ''].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-neutral-100">
                  <td className="min-w-72 px-3 py-2">
                    <SearchableSelect
                      label="Product"
                      valueLabel={productLabel(line.productId, products)}
                      placeholder="Search products"
                      search={searchProducts}
                      keyFor={(product) => product.id}
                      labelFor={(product) => `${product.name} (${product.code})`}
                      detailFor={(product) => `Price ${money(numberValue(product.selling_price ?? product.price))} | Qty ${money(numberValue(product.qty ?? product.quantity))}`}
                      onSelect={(product) => selectProduct(line.key, product)}
                    />
                  </td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.price} onChange={(event) => updateLine(line.key, 'price', event.target.value)} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.discount} onChange={(event) => updateLine(line.key, 'discount', event.target.value)} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.taxRate} onChange={(event) => updateLine(line.key, 'taxRate', event.target.value)} /></td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{money(calculateLine(line).subtotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" className="h-9 w-9 px-0" disabled={lines.length === 1} onClick={() => removeLine(line.key)} aria-label="Remove line">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Adjustments and Payment</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Order tax %"><Input type="number" step="0.01" min="0" value={form.orderTaxRate} onChange={(event) => setValue('orderTaxRate', event.target.value)} /></Field>
          <Field label="Order discount"><Input type="number" step="0.01" min="0" value={form.orderDiscount} onChange={(event) => setValue('orderDiscount', event.target.value)} /></Field>
          <Field label="Shipping cost"><Input type="number" step="0.01" min="0" value={form.shippingCost} onChange={(event) => setValue('shippingCost', event.target.value)} /></Field>
          <Field label="Payment status"><Select value={form.paymentMode} onValueChange={(value) => setValue('paymentMode', value as PaymentMode)} options={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial cash' },
            { value: 'paid', label: 'Paid cash' },
          ]} /></Field>
          {form.paymentMode === 'partial' ? <Field label="Paid amount"><Input type="number" step="0.01" min="0" value={form.paidAmount} onChange={(event) => setValue('paidAmount', event.target.value)} /></Field> : null}
          <Field label="Payment note"><Input value={form.paymentNote} onChange={(event) => setValue('paymentNote', event.target.value)} /></Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Notes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sale note"><Textarea value={form.saleNote} onChange={(event) => setValue('saleNote', event.target.value)} /></Field>
          <Field label="Staff note"><Textarea value={form.staffNote} onChange={(event) => setValue('staffNote', event.target.value)} /></Field>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          <Summary label="Total qty" value={money(totals.totalQty)} />
          <Summary label="Items subtotal" value={money(totals.totalPrice)} />
          <Summary label="Discount" value={money(totals.totalDiscount)} />
          <Summary label="Order tax" value={money(totals.orderTax)} />
          <Summary label="Grand total" value={money(totals.grandTotal)} strong />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={saving || loading}>{saving ? 'Saving...' : editingId ? 'Update invoice' : 'Create invoice'}</Button>
      </div>
      </> : null}
    </form>
  );
}

function InvoiceDetails({ invoice }: { invoice: Record<string, any> }) {
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap gap-6">
        <Summary label="Reference" value={String(invoice.reference_no ?? '-')} />
        <Summary label="Customer" value={String(invoice.customer?.name ?? '-')} />
        <Summary label="Grand total" value={money(numberValue(invoice.grand_total))} strong />
        <Summary label="Paid" value={money(numberValue(invoice.paid_amount))} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {(invoice.products ?? []).map((line: Record<string, any>) => (
              <tr key={line.id} className="border-t border-neutral-100">
                <td className="py-2">{line.product?.name ?? `#${line.product_id}`}</td>
                <td className="py-2 text-right">Qty {money(numberValue(line.qty))}</td>
                <td className="py-2 text-right">{money(numberValue(line.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchableSelect<T>({
  label,
  valueLabel,
  placeholder,
  search,
  keyFor,
  labelFor,
  detailFor,
  onSelect,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void search(debouncedQuery)
      .then((nextOptions) => {
        if (!cancelled) setOptions(nextOptions);
      })
      .catch((error) => {
        if (!cancelled) toast.error('Search failed', { description: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, search]);

  function openSearch() {
    setQuery('');
    setDebouncedQuery('');
    setOpen(true);
  }

  return (
    <Field label={label}>
      <div className="relative">
        <Button type="button" variant="secondary" className="h-10 w-full justify-between overflow-hidden px-3 text-left font-normal" onClick={openSearch}>
          <span className="truncate">{valueLabel}</span>
        </Button>
        {open ? (
          <div className="fixed inset-0 z-50 grid place-items-start bg-black/30 p-4 pt-20">
            <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium">{label}</div>
                <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setOpen(false)}>Close</Button>
              </div>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                autoFocus
              />
              <div className="mt-2 max-h-80 overflow-y-auto">
                {loading ? <div className="px-3 py-4 text-sm text-neutral-500">Searching...</div> : null}
                {!loading && !options.length ? <div className="px-3 py-4 text-sm text-neutral-500">No matches found.</div> : null}
                {options.map((option) => {
                  const detail = detailFor?.(option);
                  return (
                    <button
                      key={keyFor(option)}
                      type="button"
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100"
                      onClick={() => {
                        onSelect(option);
                        setOpen(false);
                      }}
                    >
                      <span className="block font-medium">{labelFor(option)}</span>
                      {detail ? <span className="block text-xs text-neutral-500">{detail}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className={strong ? 'text-xl font-semibold' : 'text-base font-medium'}>{value}</div>
    </div>
  );
}

function buildPayload(
  form: FormState,
  lines: InvoiceLine[],
  products: Product[],
  totals: ReturnType<typeof calculateTotals>
): SalesInvoicePayload | null {
  if (!form.referenceNo.trim()) {
    toast.error('Missing reference', { description: 'Reference no is required.' });
    return null;
  }
  if (form.customerId === 'none' || form.warehouseId === 'none' || form.billerId === 'none') {
    toast.error('Missing invoice fields', { description: 'Customer, warehouse, and branch are required.' });
    return null;
  }

  const invoiceLines = lines.map((line) => {
    const product = products.find((item) => String(item.id) === line.productId);
    const values = calculateLine(line);
    return { product, values };
  });

  if (invoiceLines.some((item) => !item.product)) {
    toast.error('Missing product', { description: 'Every invoice line must have a product.' });
    return null;
  }
  if (invoiceLines.some((item) => item.values.qty <= 0)) {
    toast.error('Invalid quantity', { description: 'Line quantities must be greater than zero.' });
    return null;
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);

  return {
    reference_no: form.referenceNo.trim(),
    customer_id: Number(form.customerId),
    warehouse_id: Number(form.warehouseId),
    biller_id: Number(form.billerId),
    sale_status: 1,
    payment_status: paymentStatus(form.paymentMode),
    lines: invoiceLines.map(({ product, values }) => ({
      product_id: product?.id as number,
      product_code: product?.code ?? null,
      product_batch_id: null,
      qty: values.qty,
      sale_unit: product?.type === 'combo' ? 'n/a' : product?.sale_unit_id ?? null,
      net_unit_price: values.price,
      discount: values.discount,
      tax_rate: values.taxRate,
      tax: values.tax,
      subtotal: values.subtotal,
    })),
    order_tax_rate: numberValue(form.orderTaxRate),
    order_discount: numberValue(form.orderDiscount),
    coupon_discount: 0,
    coupon_active: false,
    shipping_cost: numberValue(form.shippingCost),
    paid_by_id: form.paymentMode === 'unpaid' ? null : 1,
    paying_amount: paidAmount,
    paid_amount: paidAmount,
    payment_note: nullableText(form.paymentNote),
    sale_note: nullableText(form.saleNote),
    staff_note: nullableText(form.staffNote),
  };
}

function calculateTotals(lines: InvoiceLine[], form: FormState) {
  const lineTotals = lines.map(calculateLine);
  const totalQty = round2(lineTotals.reduce((sum, line) => sum + line.qty, 0));
  const lineDiscount = round2(lineTotals.reduce((sum, line) => sum + line.discount, 0));
  const orderDiscount = numberValue(form.orderDiscount);
  const totalDiscount = round2(lineDiscount + orderDiscount);
  const totalPrice = round2(lineTotals.reduce((sum, line) => sum + line.subtotal, 0));
  const orderTax = round2(totalPrice * numberValue(form.orderTaxRate) / 100);
  const grandTotal = round2(totalPrice + orderTax + numberValue(form.shippingCost) - orderDiscount);
  return { totalQty, totalDiscount, totalPrice, orderTax, grandTotal };
}

function calculateLine(line: InvoiceLine) {
  const qty = numberValue(line.qty);
  const price = numberValue(line.price);
  const discount = numberValue(line.discount);
  const taxRate = numberValue(line.taxRate);
  const taxable = Math.max(0, price * qty - discount);
  const tax = round2(taxable * taxRate / 100);
  const subtotal = round2(taxable + tax);
  return { qty, price, discount, taxRate, tax, subtotal };
}

function paymentStatus(mode: PaymentMode) {
  if (mode === 'paid') return 4;
  if (mode === 'partial') return 3;
  return 2;
}

function paymentPaidAmount(mode: PaymentMode, paidAmount: string, grandTotal: number) {
  if (mode === 'paid') return grandTotal;
  if (mode === 'partial') return Math.min(numberValue(paidAmount), grandTotal);
  return 0;
}

function paymentModeFromStatus(status: number, paidAmount: number): PaymentMode {
  if (status === 4) return 'paid';
  if (status === 3 || paidAmount > 0) return 'partial';
  return 'unpaid';
}

function taxForProduct(product: Product, taxes: Tax[]) {
  return taxes.find((tax) => tax.id === product.tax_id)?.rate ?? 0;
}

function billerOptions(billers: Branch[]) {
  return [{ value: 'none', label: 'Select branch' }, ...billers.map((biller) => ({ value: String(biller.id), label: biller.name }))];
}

function productLabel(productId: string, products: Product[]) {
  const product = products.find((item) => String(item.id) === productId);
  return product ? `${product.name} (${product.code})` : 'Select product';
}

function isInvoiceProductSupported(product: Product) {
  return !product.is_variant && !product.is_batch && product.type !== 'digital';
}

function upsertById<T extends { id: number }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function idValue(value?: number | null) {
  return value ? String(value) : 'none';
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function money(value: number) {
  return value.toFixed(2);
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

function generateReference() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `sr-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
