'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type ReturnInvoicePayload, type SalesInvoicePayload } from '@/lib/api';
import type { Branch, Customer, Product, ProductVariant, Tax, Unit, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

type ProductOptions = {
  taxes?: Tax[];
  units?: Unit[];
};

type InvoiceLine = {
  key: string;
  productId: string;
  variantId: string;
  unitId: string;
  batchNo: string;
  qty: string;
  price: string;
  discount: string;
  taxRate: string;
};

type PaymentMode = 'unpaid' | 'partial' | 'paid';

type FormState = {
  referenceNo: string;
  invoiceDate: string;
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
  variantId: 'none',
  unitId: 'none',
  batchNo: '',
  qty: '1',
  price: '0',
  discount: '0',
  taxRate: '0',
});

const emptyForm = (kind: InvoiceKind = 'sales'): FormState => ({
  referenceNo: generateReference(kind),
  invoiceDate: todayDate(),
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
type InvoiceKind = 'sales' | 'returns';

export function SalesInvoicesPage({ mode = 'index', invoiceId, kind = 'sales' }: { mode?: InvoicePageMode; invoiceId?: number; kind?: InvoiceKind }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const labels = invoiceLabels(kind);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [billers, setBillers] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(kind));
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCustomer = customers.find((customer) => String(customer.id) === form.customerId);
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.warehouseId);
  const hasBatchLine = lines.some((line) => isBatchProduct(products.find((product) => String(product.id) === line.productId)));
  const hasVariantLine = lines.some((line) => isVariantProduct(products.find((product) => String(product.id) === line.productId)));
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
      setUnits(productOptions.units ?? []);
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
    const addPermission = kind === 'returns' ? 'returns-add' : 'sales-add';
    const editPermission = kind === 'returns' ? 'returns-edit' : 'sales-edit';
    if (mode === 'create' && !hasPermission(addPermission)) router.replace('/dashboard');
    if (mode === 'edit' && !hasPermission(editPermission)) router.replace('/dashboard');
  }, [hasPermission, kind, mode, router]);

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
      const response = kind === 'returns'
        ? await api.returnInvoices({ perPage: 20 })
        : await api.salesInvoices({ perPage: 20 });
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

  function selectLineUnit(lineKey: string, unitId: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => String(item.id) === line.productId);
      if (kind === 'returns' || !product) return { ...line, unitId };

      return {
        ...line,
        unitId,
        price: String(unitPriceForProductUnit(product, nullableId(unitId), units)),
      };
    }));
  }

  function selectWarehouse(warehouse: Warehouse) {
    setWarehouses((current) => upsertById(current, warehouse));
    setForm((current) => ({ ...current, warehouseId: String(warehouse.id) }));
    if (kind === 'returns') return;

    setLines((current) => current.map((line) => {
      const product = products.find((item) => String(item.id) === line.productId);
      const unitId = nullableId(line.unitId) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');
      return product ? { ...line, price: String(unitPriceForProductUnit(product, unitId, units)) } : line;
    }));
  }

  function selectProduct(lineKey: string, product: Product) {
    const warehouseId = nullableId(form.warehouseId);
    if (!warehouseId) {
      toast.error('Select warehouse first', { description: 'Choose a warehouse before selecting products.' });
      return;
    }

    const availableQty = warehouseStockForProduct(product, warehouseId);
    if (kind === 'sales' && availableQty <= 0) {
      toast.error('No stock available', {
        description: `${product.name} has no stock in ${selectedWarehouse?.name ?? 'the selected warehouse'}.`,
      });
      return;
    }

    setProducts((current) => upsertById(current, product));
    setLines((current) =>
      current.map((line) => {
        if (line.key !== lineKey) return line;

        const unitId = product.sale_unit_id ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');

        return {
          ...line,
          productId: String(product.id),
          variantId: 'none',
          unitId: idValue(unitId),
          batchNo: isBatchProduct(product) ? firstBatchNoForProduct(product, warehouseId) ?? '' : '',
          price: kind === 'sales' ? String(unitPriceForProductUnit(product, unitId, units)) : line.price,
          taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
        };
      })
    );
  }

  function selectVariant(lineKey: string, variantId: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => String(item.id) === line.productId);
      const variant = productVariantById(product, nullableId(variantId));
      const unitId = nullableId(line.unitId) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');

      return {
        ...line,
        variantId,
        price: product && kind === 'sales' ? String(unitPriceForProductUnit(product, unitId, units, variant)) : line.price,
      };
    }));
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  }

  function resetForm() {
    setForm({
      ...emptyForm(kind),
      customerId: idValue(customers[0]?.id),
      warehouseId: idValue(warehouses[0]?.id),
      billerId: idValue(billers[0]?.id),
    });
    setLines([emptyLine()]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload(form, lines, products, totals, kind);
    if (!payload) return;

    setSaving(true);
    try {
      const batchError = kind === 'sales'
        ? await fillBatchIds(payload.lines, products, payload.warehouse_id)
        : null;
      if (batchError) {
        toast.error('Invalid batch no', { description: batchError });
        return;
      }

      const response = kind === 'returns'
        ? editingId
          ? await api.updateReturnInvoice(editingId, payload as ReturnInvoicePayload)
          : await api.createReturnInvoice(payload as ReturnInvoicePayload)
        : editingId
          ? await api.updateSalesInvoice(editingId, payload as SalesInvoicePayload)
          : await api.createSalesInvoice(payload as SalesInvoicePayload);
      toast.success(response.message || (editingId ? `${labels.singular} updated` : `${labels.singular} created`));
      setEditingId(null);
      resetForm();
      void loadInvoices();
      router.push(labels.basePath);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function openInvoice(id: number, mode: 'view' | 'edit') {
    try {
      const response = kind === 'returns' ? await api.returnInvoice(id) : await api.salesInvoice(id);
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
      invoiceDate: String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? todayDate()),
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
        unitId: idValue(line.sale_unit_id ?? line.unit?.id ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale')),
        batchNo: line.batch?.batch_no ?? '',
        variantId: idValue(line.variant_id ?? line.variant?.id),
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
            <h2 className="text-lg font-semibold">{labels.plural}</h2>
          <div className="flex gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href={`${labels.basePath}/create`}>Create invoice</Link>
            <Button type="button" variant="secondary" onClick={() => void loadInvoices()} disabled={listLoading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">{kind === 'returns' ? 'Return date' : 'Sale date'}</th>
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
                  <td className="px-4 py-3">{String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-')}</td>
                  <td className="px-4 py-3 font-medium">{invoice.reference_no}</td>
                  <td className="px-4 py-3">{invoice.customer?.name ?? '-'}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.grand_total))}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.paid_amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`${labels.basePath}/${invoice.id}`}>Details</Link>
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`${labels.basePath}/${invoice.id}/edit`}>Edit</Link>
                  </td>
                </tr>
              ))}
              {!invoices.length ? <tr><td className="px-4 py-6 text-center text-neutral-500" colSpan={6}>No invoices found</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section> : null}
      {mode === 'details' ? (
        <section className="grid gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">{labels.singularTitle} Details</h1>
            <div className="flex gap-2">
              <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href={labels.basePath}>Back</Link>
              {invoiceId ? <Link className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href={`${labels.basePath}/${invoiceId}/edit`}>Edit</Link> : null}
            </div>
          </div>
          {selectedInvoice ? <InvoiceDetails invoice={selectedInvoice} kind={kind} /> : <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading invoice...</div>}
        </section>
      ) : null}
      {mode !== 'details' && mode !== 'index' ? <>
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Link className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href={labels.basePath}>Back to list</Link>
        <Button type="button" variant="secondary" disabled={saving} onClick={resetForm}>Reset</Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{editingId ? `Edit ${labels.singularTitle}` : labels.singularTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">{editingId ? 'Update invoice fields and line items' : labels.description}</p>
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
          <Field label={kind === 'returns' ? 'Return date' : 'Sale date'}><Input type="date" value={form.invoiceDate} onChange={(event) => setValue('invoiceDate', event.target.value)} /></Field>
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
            onSelect={selectWarehouse}
          />
          <Field label="Branch"><Select value={form.billerId} onValueChange={(value) => setValue('billerId', value)} options={billerOptions(billers)} /></Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Products</h2>
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
                {['Product', ...(hasVariantLine ? ['Variant'] : []), 'Qty', 'Unit', ...(hasBatchLine ? ['Batch no'] : []), 'Unit price', 'Discount', 'Tax %', 'Line total', ''].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((item) => String(item.id) === line.productId);
                const lineRequiresBatch = isBatchProduct(product);

                return (
                <tr key={line.key} className="border-t border-neutral-100">
                  <td className="min-w-72 px-3 py-2">
                    <SearchableSelect
                      label="Product"
                      valueLabel={productLabel(line.productId, line.variantId, products)}
                      placeholder="Search products"
                      search={searchProducts}
                      keyFor={(product) => product.id}
                      labelFor={(product) => `${product.name} (${product.code})`}
                      detailFor={(product) => {
                        const warehouseId = nullableId(form.warehouseId);
                        return `Base price ${money(baseUnitPriceForProduct(product))} | Qty ${money(warehouseStockForProduct(product, warehouseId))}`;
                      }}
                      onSelect={(product) => selectProduct(line.key, product)}
                    />
                  </td>
                  {hasVariantLine ? <td className="px-3 py-2">
                    {isVariantProduct(product) ? (
                      <Select value={line.variantId} onValueChange={(value) => selectVariant(line.key, value)} options={variantSelectOptions(product)} />
                    ) : null}
                  </td> : null}
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} /></td>
                  <td className="px-3 py-2">
                    {product && product.type !== 'combo' ? (
                      <Select value={line.unitId} onValueChange={(value) => selectLineUnit(line.key, value)} options={unitSelectOptions(productOptionsForFamily(product, units))} />
                    ) : null}
                  </td>
                  {hasBatchLine ? <td className="px-3 py-2">{lineRequiresBatch ? <Input required value={line.batchNo} onChange={(event) => updateLine(line.key, 'batchNo', event.target.value)} /> : null}</td> : null}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">{kind === 'returns' ? 'Adjustments' : 'Adjustments and Payment'}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Order tax %"><Input type="number" step="0.01" min="0" value={form.orderTaxRate} onChange={(event) => setValue('orderTaxRate', event.target.value)} /></Field>
          {kind === 'sales' ? <Field label="Order discount"><Input type="number" step="0.01" min="0" value={form.orderDiscount} onChange={(event) => setValue('orderDiscount', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Shipping cost"><Input type="number" step="0.01" min="0" value={form.shippingCost} onChange={(event) => setValue('shippingCost', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Payment status"><Select value={form.paymentMode} onValueChange={(value) => setValue('paymentMode', value as PaymentMode)} options={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial cash' },
            { value: 'paid', label: 'Paid cash' },
          ]} /></Field> : null}
          {kind === 'sales' && form.paymentMode === 'partial' ? <Field label="Paid amount"><Input type="number" step="0.01" min="0" value={form.paidAmount} onChange={(event) => setValue('paidAmount', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Payment note"><Input value={form.paymentNote} onChange={(event) => setValue('paymentNote', event.target.value)} /></Field> : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Notes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={kind === 'returns' ? 'Return note' : 'Sale note'}><Textarea value={form.saleNote} onChange={(event) => setValue('saleNote', event.target.value)} /></Field>
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

function InvoiceDetails({ invoice, kind }: { invoice: Record<string, any>; kind: InvoiceKind }) {
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap gap-6">
        <Summary label="Reference" value={String(invoice.reference_no ?? '-')} />
        <Summary label={kind === 'returns' ? 'Return date' : 'Sale date'} value={String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-')} />
        <Summary label="Customer" value={String(invoice.customer?.name ?? '-')} />
        <Summary label="Grand total" value={money(numberValue(invoice.grand_total))} strong />
        {kind === 'sales' ? <Summary label="Paid" value={money(numberValue(invoice.paid_amount))} /> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {(invoice.products ?? []).map((line: Record<string, any>) => (
              <tr key={line.id} className="border-t border-neutral-100">
                <td className="py-2">{invoiceLineProductName(line)}</td>
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
        {open ? createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
            <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
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
          </div>,
          document.body
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
  totals: ReturnType<typeof calculateTotals>,
  kind: InvoiceKind
): SalesInvoicePayload | ReturnInvoicePayload | null {
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
    return { line, product, values };
  });

  if (invoiceLines.some((item) => !item.product)) {
    toast.error('Missing product', { description: 'Every invoice line must have a product.' });
    return null;
  }
  if (invoiceLines.some((item) => item.values.qty <= 0)) {
    toast.error('Invalid quantity', { description: 'Line quantities must be greater than zero.' });
    return null;
  }
  if (invoiceLines.some((item) => isBatchProduct(item.product) && !item.line.batchNo.trim())) {
    toast.error('Missing batch no', { description: 'Batch no is required for batch products.' });
    return null;
  }
  if (invoiceLines.some((item) => isVariantProduct(item.product) && !productVariantById(item.product, nullableId(item.line.variantId)))) {
    toast.error('Missing variant', { description: 'Variant is required for variant products.' });
    return null;
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);

  const basePayload = {
    reference_no: form.referenceNo.trim(),
    sale_date: kind === 'sales' ? form.invoiceDate : undefined,
    customer_id: Number(form.customerId),
    warehouse_id: Number(form.warehouseId),
    biller_id: Number(form.billerId),
    lines: invoiceLines.map(({ line, product, values }) => {
      const variant = productVariantById(product, nullableId(line.variantId));

      return {
        product_id: product?.id as number,
        product_code: variant?.item_code ?? product?.code ?? null,
        variant_id: variant?.variant_id ?? null,
        product_batch_id: null,
        batch_no: isBatchProduct(product) ? nullableText(line.batchNo) : null,
        qty: values.qty,
        sale_unit: product?.type === 'combo' ? 'n/a' : nullableId(line.unitId),
        net_unit_price: values.price,
        discount: values.discount,
        tax_rate: values.taxRate,
        tax: values.tax,
        subtotal: values.subtotal,
      };
    }),
    order_tax_rate: numberValue(form.orderTaxRate),
    sale_note: nullableText(form.saleNote),
    staff_note: nullableText(form.staffNote),
  };

  if (kind === 'returns') {
    return {
      ...basePayload,
      return_date: form.invoiceDate,
      return_note: nullableText(form.saleNote),
    };
  }

  return {
    ...basePayload,
    sale_status: 1,
    payment_status: paymentStatus(form.paymentMode),
    order_discount: numberValue(form.orderDiscount),
    coupon_discount: 0,
    coupon_active: false,
    shipping_cost: numberValue(form.shippingCost),
    paid_by_id: form.paymentMode === 'unpaid' ? null : 1,
    paying_amount: paidAmount,
    paid_amount: paidAmount,
    payment_note: nullableText(form.paymentNote),
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function taxForProduct(product: Product, taxes: Tax[]) {
  return taxes.find((tax) => tax.id === product.tax_id)?.rate ?? 0;
}

function billerOptions(billers: Branch[]) {
  return [{ value: 'none', label: 'Select branch' }, ...billers.map((biller) => ({ value: String(biller.id), label: biller.name }))];
}

function productLabel(productId: string, variantId: string, products: Product[]) {
  const product = products.find((item) => String(item.id) === productId);
  if (!product) return 'Select product';

  const variant = productVariantById(product, nullableId(variantId));
  return variant ? `${product.name} - ${variant.name} (${variant.item_code})` : `${product.name} (${product.code})`;
}

function isInvoiceProductSupported(product: Product) {
  return product.type !== 'digital';
}

function isVariantProduct(product?: Product | null) {
  return product?.is_variant === true || String(product?.is_variant) === '1';
}

function productVariantById(product: Product | undefined | null, variantId: number | null | undefined) {
  if (!product || !variantId) return null;
  return product.variants?.find((variant) => Number(variant.variant_id) === Number(variantId)) ?? null;
}

function variantSelectOptions(product: Product | undefined | null) {
  const variants = product?.variants ?? [];
  return variants.length
    ? [{ value: 'none', label: 'Select variant' }, ...variants.map((variant) => ({ value: String(variant.variant_id), label: `${variant.name} (${variant.item_code})` }))]
    : [{ value: 'none', label: 'No variants found' }];
}

function invoiceLineProductName(line: Record<string, any>) {
  const productName = line.product?.name ?? `#${line.product_id}`;
  return line.variant?.name ? `${productName} - ${line.variant.name}` : productName;
}

function isBatchProduct(product?: Product | null) {
  return product?.is_batch === true || String(product?.is_batch) === '1';
}

function upsertById<T extends { id: number }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function idValue(value?: number | null) {
  return value ? String(value) : 'none';
}

function nullableId(value?: string | null) {
  if (!value || value === 'none') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function defaultProductUnit(product: Product | undefined, familyUnits: Unit[], kind: 'sale' | 'purchase' | 'stock') {
  if (!product) return null;
  const preferredId = kind === 'sale'
    ? product.sale_unit_id
    : kind === 'purchase'
      ? product.purchase_unit_id
      : product.unit_id ?? product.unit?.id;
  const fallbackId = product.unit_id ?? product.unit?.id;
  const preferred = familyUnits.find((unit) => unit.id === preferredId);
  const fallback = familyUnits.find((unit) => unit.id === fallbackId);
  return preferred?.id ?? fallback?.id ?? familyUnits[0]?.id ?? null;
}

function productOptionsForFamily(product: Product | undefined, units: Unit[]) {
  if (!product) return [];
  const productUnitId = product.unit_id ?? product.unit?.id ?? product.sale_unit_id ?? product.purchase_unit_id ?? null;
  const rootId = rootUnitId(productUnitId, units);
  if (!rootId) return [];

  return units.filter((unit) => rootUnitId(unit.id, units) === rootId);
}

function rootUnitId(unitId: number | null | undefined, units: Unit[]) {
  let current = unitId ?? null;
  const visited = new Set<number>();

  while (current) {
    if (visited.has(current)) return current;
    visited.add(current);
    const unit = units.find((item) => item.id === current);
    if (!unit?.base_unit) return current;
    current = unit.base_unit;
  }

  return null;
}

function unitSelectOptions(units: Unit[]) {
  return units.length
    ? units.map((unit) => ({ value: String(unit.id), label: `${unit.unit_name} (${unit.unit_code})` }))
    : [{ value: 'none', label: 'Select unit' }];
}

function baseUnitPriceForProduct(product: Product) {
  return numberValue(product.price);
}

function unitPriceForProductUnit(product: Product, unitId: number | null | undefined, units: Unit[], variant?: ProductVariant | null) {
  const basePrice = baseUnitPriceForProduct(product) + numberValue(variant?.additional_price);
  const baseUnitId = product.unit_id ?? product.unit?.id ?? null;
  const factor = unitConversionFactorFromBase(unitId, baseUnitId, units);

  return round2(basePrice * factor);
}

function unitConversionFactorFromBase(unitId: number | null | undefined, baseUnitId: number | null | undefined, units: Unit[]) {
  if (!unitId || !baseUnitId || unitId === baseUnitId) return 1;

  const unitFactor = unitRootFactor(unitId, units);
  const baseFactor = unitRootFactor(baseUnitId, units);

  if (!unitFactor || !baseFactor || unitFactor.rootId !== baseFactor.rootId || baseFactor.factor <= 0) return 1;

  return unitFactor.factor / baseFactor.factor;
}

function unitRootFactor(unitId: number, units: Unit[]) {
  let current: number | null | undefined = unitId;
  let factor = 1;
  const visited = new Set<number>();

  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);

    const unit = units.find((item) => item.id === current);
    if (!unit) return null;
    if (!unit.base_unit) return { rootId: current, factor };

    const operationValue = numberValue(unit.operation_value || 1) || 1;
    factor = unit.operator === '/' ? factor / operationValue : factor * operationValue;
    current = unit.base_unit;
  }

  return null;
}

function warehouseStockForProduct(product: Product, warehouseId?: number | null) {
  const warehouseStocks = warehouseId
    ? product.warehouse_prices?.filter((item) => Number(item.warehouse_id) === warehouseId)
    : [];

  if (warehouseStocks?.length) {
    return warehouseStocks.reduce((sum, item) => sum + numberValue(item.qty), 0);
  }

  if (warehouseId) {
    return 0;
  }

  return numberValue(product.qty ?? product.quantity);
}

function firstBatchNoForProduct(product: Product, warehouseId?: number | null) {
  const batch = product.warehouse_prices?.find((item) =>
    Number(item.warehouse_id) === Number(warehouseId) && item.batch_no
  );

  return batch?.batch_no ?? null;
}

async function fillBatchIds(lines: SalesInvoicePayload['lines'], products: Product[], warehouseId: number) {
  for (const line of lines) {
    if (!line.batch_no) continue;

    const response = await api.checkBatchAvailability(line.product_id, line.batch_no, warehouseId);
    if (!response.data.valid) {
      const product = products.find((item) => item.id === line.product_id);
      return `${product?.name ?? 'Selected product'} batch "${line.batch_no}" is not available in the selected warehouse. ${response.data.message}`;
    }

    line.product_batch_id = response.data.product_batch_id;
  }

  return null;
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

function invoiceLabels(kind: InvoiceKind) {
  if (kind === 'returns') {
    return {
      basePath: '/return-invoices',
      singular: 'Return invoice',
      singularTitle: 'Return Invoice',
      plural: 'Return invoices',
      description: 'Record returned sold products and add quantities back to stock',
    };
  }

  return {
    basePath: '/sales-invoices',
    singular: 'Sales invoice',
    singularTitle: 'Sales Invoice',
    plural: 'Sales invoices',
    description: 'Create a completed sale with optional cash payment',
  };
}

function generateReference(kind: InvoiceKind = 'sales') {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const prefix = kind === 'returns' ? 'rr' : 'sr';
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
