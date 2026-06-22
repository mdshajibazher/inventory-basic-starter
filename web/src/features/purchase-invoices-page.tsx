'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type PurchaseInvoicePayload } from '@/lib/api';
import type { Product, PurchaseStatus, Supplier, Tax, Unit, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

type ProductOptions = { taxes?: Tax[]; units?: Unit[] };
type PaymentMode = 'unpaid' | 'partial' | 'paid';

type InvoiceLine = {
  key: string;
  productId: string;
  variantId: string;
  unitId: string;
  qty: string;
  received: string;
  cost: string;
  discount: string;
  taxRate: string;
  batchNo: string;
  expiredDate: string;
};

type FormState = {
  referenceNo: string;
  purchaseDate: string;
  supplierId: string;
  warehouseId: string;
  purchaseStatusId: string;
  orderTaxRate: string;
  orderDiscount: string;
  shippingCost: string;
  paymentMode: PaymentMode;
  paidAmount: string;
  paymentNote: string;
  note: string;
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

const PURCHASE_STATUS_RECEIVED = 1;
const PURCHASE_STATUS_PARTIAL = 2;
const PURCHASE_STATUS_PENDING = 3;
const PURCHASE_STATUS_ORDERED = 4;

const fallbackPurchaseStatuses: PurchaseStatus[] = [
  { id: 1, value: '1', label: 'Received' },
  { id: 2, value: '2', label: 'Partial' },
  { id: 3, value: '3', label: 'Pending' },
  { id: 4, value: '4', label: 'Ordered' },
];

const emptyLine = (): InvoiceLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: 'none',
  variantId: 'none',
  unitId: 'none',
  qty: '1',
  received: '1',
  cost: '0',
  discount: '0',
  taxRate: '0',
  batchNo: '',
  expiredDate: '',
});

const emptyForm = (): FormState => ({
  referenceNo: generateReference(),
  purchaseDate: todayDate(),
  supplierId: 'none',
  warehouseId: 'none',
  purchaseStatusId: '1',
  orderTaxRate: '0',
  orderDiscount: '0',
  shippingCost: '0',
  paymentMode: 'unpaid',
  paidAmount: '0',
  paymentNote: '',
  note: '',
});

type InvoicePageMode = 'index' | 'create' | 'details' | 'edit';

export function PurchaseInvoicesPage({ mode = 'index', invoiceId }: { mode?: InvoicePageMode; invoiceId?: number }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatuses, setPurchaseStatuses] = useState<PurchaseStatus[]>(fallbackPurchaseStatuses);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedSupplier = suppliers.find((supplier) => String(supplier.id) === form.supplierId);
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.warehouseId);
  const showReceived = Number(form.purchaseStatusId) === PURCHASE_STATUS_PARTIAL;
  const hasBatchLine = lines.some((line) => isBatchProduct(products.find((product) => String(product.id) === line.productId)));
  const hasVariantLine = lines.some((line) => isVariantProduct(products.find((product) => String(product.id) === line.productId)));
  const totals = useMemo(() => calculateTotals(lines, form), [lines, form]);

  const searchSuppliers = useCallback(async (query: string) => {
    const response = await api.suppliers({ perPage: 30, search: query.trim(), activeOnly: true });
    return response.data as Supplier[];
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
      const [supplierResponse, warehouseResponse, productResponse, productOptionsResponse, purchaseStatusResponse] = await Promise.all([
        api.suppliers({ perPage: 30, activeOnly: true }),
        api.warehouses({ perPage: 30, activeOnly: true }),
        api.products({ perPage: 30 }),
        api.productOptions(),
        api.purchaseStatuses(),
      ]);
      const nextSuppliers = supplierResponse.data as Supplier[];
      const nextWarehouses = warehouseResponse.data as Warehouse[];
      const nextProducts = (productResponse.data as Product[]).filter(isInvoiceProductSupported);
      const productOptions = productOptionsResponse.data as ProductOptions;
      const nextPurchaseStatuses = (purchaseStatusResponse.data as PurchaseStatus[]).length
        ? purchaseStatusResponse.data as PurchaseStatus[]
        : fallbackPurchaseStatuses;

      setSuppliers(nextSuppliers);
      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setPurchaseStatuses(nextPurchaseStatuses);
      setTaxes(productOptions.taxes ?? []);
      setUnits(productOptions.units ?? []);
      setForm((current) => ({
        ...current,
        supplierId: current.supplierId === 'none' ? idValue(nextSuppliers[0]?.id) : current.supplierId,
        warehouseId: current.warehouseId === 'none' ? idValue(nextWarehouses[0]?.id) : current.warehouseId,
        purchaseStatusId: current.purchaseStatusId === 'none' ? idValue(nextPurchaseStatuses[0]?.id) : current.purchaseStatusId,
      }));
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'create' && !hasPermission('purchases-add')) router.replace('/dashboard');
    if (mode === 'edit' && !hasPermission('purchases-edit')) router.replace('/dashboard');
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
      const response = await api.purchaseInvoices({ perPage: 20 });
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
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;

        const statusId = Number(form.purchaseStatusId);
        const nextLine = { ...line, [field]: value };
        if (field === 'qty' && isReceivedQuantitySyncedStatus(statusId)) {
          nextLine.received = String(value);
        } else if (field === 'received' && statusId === PURCHASE_STATUS_PARTIAL) {
          nextLine.received = boundedReceivedValue(String(value), nextLine.qty);
        }
        if (isUnreceivedStatus(statusId)) {
          nextLine.received = '0';
        }
        return nextLine;
      })
    );
  }

  function selectLineUnit(lineKey: string, unitId: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => String(item.id) === line.productId);
      if (!product) return { ...line, unitId };

      return {
        ...line,
        unitId,
        cost: String(unitCostForProductUnit(product, nullableId(unitId), units)),
      };
    }));
  }

  function setPurchaseStatus(value: string) {
    setValue('purchaseStatusId', value);
    const statusId = Number(value);
    if (isReceivedQuantitySyncedStatus(statusId)) {
      setLines((current) => current.map((line) => ({ ...line, received: line.qty })));
    } else if (isUnreceivedStatus(statusId)) {
      setLines((current) => current.map((line) => ({ ...line, received: '0' })));
    }
  }

  function selectProduct(lineKey: string, product: Product) {
    const warehouseId = nullableId(form.warehouseId);
    setProducts((current) => upsertById(current, product));
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? (() => {
              const unitId = product.purchase_unit_id ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'purchase');
              return {
                ...line,
                productId: String(product.id),
                variantId: 'none',
                unitId: idValue(unitId),
                cost: String(unitCostForProductUnit(product, unitId, units)),
                taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
                batchNo: isBatchProduct(product) ? firstBatchNoForProduct(product, warehouseId) ?? '' : '',
                expiredDate: isBatchProduct(product) ? line.expiredDate : '',
              };
            })()
          : line
      )
    );
  }

  function selectVariant(lineKey: string, variantId: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      return { ...line, variantId };
    }));
  }

  function resetForm() {
    setForm({
      ...emptyForm(),
      supplierId: idValue(suppliers[0]?.id),
      warehouseId: idValue(warehouses[0]?.id),
    });
    setLines([emptyLine()]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload(form, lines, products, totals);
    if (!payload) return;

    setSaving(true);
    try {
      const batchError = await validateBatchLines(payload.lines, products, payload.warehouse_id);
      if (batchError) {
        toast.error('Invalid batch no', { description: batchError });
        return;
      }

      const response = editingId
        ? await api.updatePurchaseInvoice(editingId, payload)
        : await api.createPurchaseInvoice(payload);
      toast.success(response.message || (editingId ? 'Purchase invoice updated' : 'Purchase invoice created'));
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
      const response = await api.purchaseInvoice(id);
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
      purchaseDate: String(invoice.purchase_date ?? dateOnly(invoice.created_at) ?? todayDate()),
      supplierId: idValue(invoice.supplier_id),
      warehouseId: idValue(invoice.warehouse_id),
      purchaseStatusId: idValue(invoice.purchase_status_id ?? invoice.status),
      orderTaxRate: String(invoice.order_tax_rate ?? '0'),
      orderDiscount: String(invoice.order_discount ?? '0'),
      shippingCost: String(invoice.shipping_cost ?? '0'),
      paymentMode: purchasePaymentModeFromStatus(Number(invoice.payment_status), Number(invoice.paid_amount)),
      paidAmount: String(invoice.paid_amount ?? '0'),
      paymentNote: invoice.payments?.[0]?.payment_note ?? '',
      note: invoice.note ?? '',
    });
    const nextLines = (invoice.products ?? []).map((line: Record<string, any>) => {
      const product = line.product as Product | undefined;
      if (product) setProducts((current) => upsertById(current, product));
      return {
        key: String(line.id ?? `${Date.now()}-${Math.random()}`),
        productId: String(line.product_id ?? product?.id ?? 'none'),
        variantId: idValue(line.variant_id ?? line.variant?.id),
        unitId: idValue(line.purchase_unit_id ?? line.unit?.id ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'purchase')),
        qty: String(line.qty ?? '1'),
        received: String(line.received ?? line.qty ?? '1'),
        cost: String(line.net_unit_cost ?? '0'),
        discount: String(line.discount ?? '0'),
        taxRate: String(line.tax_rate ?? '0'),
        batchNo: line.batch?.batch_no ?? '',
        expiredDate: line.batch?.expired_date ?? '',
      };
    });
    setLines(nextLines.length ? nextLines : [emptyLine()]);
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      {mode === 'index' ? <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Purchase invoices</h2>
          <div className="flex gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href="/purchase-invoices/create">Create invoice</Link>
            <Button type="button" variant="secondary" onClick={() => void loadInvoices()} disabled={listLoading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Purchase date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3">{String(invoice.purchase_date ?? dateOnly(invoice.created_at) ?? '-')}</td>
                  <td className="px-4 py-3 font-medium">{invoice.reference_no}</td>
                  <td className="px-4 py-3">{invoice.supplier?.name ?? '-'}</td>
                  <td className="px-4 py-3">{invoice.purchase_status?.label ?? invoice.status}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.grand_total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`/purchase-invoices/${invoice.id}`}>Details</Link>
                    <Link className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-neutral-100" href={`/purchase-invoices/${invoice.id}/edit`}>Edit</Link>
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
            <h1 className="text-2xl font-semibold tracking-tight">Purchase Invoice Details</h1>
            <div className="flex gap-2">
              <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/purchase-invoices">Back</Link>
              {invoiceId ? <Link className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href={`/purchase-invoices/${invoiceId}/edit`}>Edit</Link> : null}
            </div>
          </div>
          {selectedInvoice ? <PurchaseInvoiceDetails invoice={selectedInvoice} /> : <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading invoice...</div>}
        </section>
      ) : null}
      {mode !== 'details' && mode !== 'index' ? <>
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Link className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/purchase-invoices">Back to list</Link>
        <Button type="button" variant="secondary" disabled={saving} onClick={resetForm}>Reset</Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{editingId ? 'Edit Purchase Invoice' : 'Purchase Invoice'}</h1>
          <p className="mt-1 text-sm text-neutral-500">{editingId ? 'Update invoice fields and line items' : 'Receive purchased stock with optional cash payment'}</p>
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
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Reference no"><Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} /></Field>
          <Field label="Purchase date"><Input type="date" value={form.purchaseDate} onChange={(event) => setValue('purchaseDate', event.target.value)} /></Field>
          <SearchableSelect
            label="Supplier"
            valueLabel={selectedSupplier?.name ?? 'Select supplier'}
            placeholder="Search suppliers"
            search={searchSuppliers}
            keyFor={(supplier) => supplier.id}
            labelFor={(supplier) => supplier.name}
            detailFor={(supplier) => supplier.phone_number || supplier.email || supplier.city}
            onSelect={(supplier) => {
              setSuppliers((current) => upsertById(current, supplier));
              setValue('supplierId', String(supplier.id));
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
          <Field label="Purchase Status"><Select value={form.purchaseStatusId} onValueChange={setPurchaseStatus} options={purchaseStatuses.map((status) => ({ value: String(status.id), label: status.label }))} /></Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Products</h2>
          <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                {['Product', ...(hasVariantLine ? ['Variant'] : []), 'Qty', ...(showReceived ? ['Received'] : []), 'Unit', 'Unit cost', 'Discount', 'Tax %', ...(hasBatchLine ? ['Batch no', 'Expiry'] : []), 'Line total', ''].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
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
                      detailFor={(product) => `Cost ${money(baseUnitCostForProduct(product))} | Qty ${money(numberValue(product.qty ?? product.quantity))}`}
                      onSelect={(product) => selectProduct(line.key, product)}
                    />
                  </td>
                  {hasVariantLine ? <td className="px-3 py-2">
                    {isVariantProduct(product) ? (
                      <Select value={line.variantId} onValueChange={(value) => selectVariant(line.key, value)} options={variantSelectOptions(product)} />
                    ) : null}
                  </td> : null}
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} /></td>
                  {showReceived ? <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.received} onChange={(event) => updateLine(line.key, 'received', event.target.value)} /></td> : null}
                  <td className="px-3 py-2">
                    {product ? (
                      <Select value={line.unitId} onValueChange={(value) => selectLineUnit(line.key, value)} options={unitSelectOptions(productOptionsForFamily(product, units))} />
                    ) : null}
                  </td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.cost} onChange={(event) => updateLine(line.key, 'cost', event.target.value)} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.discount} onChange={(event) => updateLine(line.key, 'discount', event.target.value)} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={line.taxRate} onChange={(event) => updateLine(line.key, 'taxRate', event.target.value)} /></td>
                  {hasBatchLine ? (
                    <>
                      <td className="px-3 py-2">{lineRequiresBatch ? <Input required value={line.batchNo} onChange={(event) => updateLine(line.key, 'batchNo', event.target.value)} /> : null}</td>
                      <td className="px-3 py-2">{lineRequiresBatch ? <Input required type="date" value={line.expiredDate} onChange={(event) => updateLine(line.key, 'expiredDate', event.target.value)} /> : null}</td>
                    </>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{money(calculateLine(line, form.purchaseStatusId).subtotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" className="h-9 w-9 px-0" disabled={lines.length === 1} onClick={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.key !== line.key))} aria-label="Remove line">
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
        <Field label="Purchase note"><Textarea value={form.note} onChange={(event) => setValue('note', event.target.value)} /></Field>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          <Summary label="Total qty" value={money(totals.totalQty)} />
          <Summary label="Items subtotal" value={money(totals.totalCost)} />
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

function PurchaseInvoiceDetails({ invoice }: { invoice: Record<string, any> }) {
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap gap-6">
        <Summary label="Reference" value={String(invoice.reference_no ?? '-')} />
        <Summary label="Purchase date" value={String(invoice.purchase_date ?? dateOnly(invoice.created_at) ?? '-')} />
        <Summary label="Supplier" value={String(invoice.supplier?.name ?? '-')} />
        <Summary label="Status" value={String(invoice.purchase_status?.label ?? invoice.status ?? '-')} />
        <Summary label="Grand total" value={money(numberValue(invoice.grand_total))} strong />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {(invoice.products ?? []).map((line: Record<string, any>) => (
              <tr key={line.id} className="border-t border-neutral-100">
                <td className="py-2">{invoiceLineProductName(line)}</td>
                <td className="py-2 text-right">Qty {money(numberValue(line.qty))}</td>
                <td className="py-2 text-right">Received {money(numberValue(line.received))}</td>
                <td className="py-2 text-right">{money(numberValue(line.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchableSelect<T>({ label, valueLabel, placeholder, search, keyFor, labelFor, detailFor, onSelect }: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
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

  return (
    <Field label={label}>
      <div className="relative">
        <Button type="button" variant="secondary" className="h-10 w-full justify-between overflow-hidden px-3 text-left font-normal" onClick={() => { setQuery(''); setDebouncedQuery(''); setOpen(true); }}>
          <span className="truncate">{valueLabel}</span>
        </Button>
        {open ? createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
            <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium">{label}</div>
                <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setOpen(false)}>Close</Button>
              </div>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus />
              <div className="mt-2 max-h-80 overflow-y-auto">
                {loading ? <div className="px-3 py-4 text-sm text-neutral-500">Searching...</div> : null}
                {!loading && !options.length ? <div className="px-3 py-4 text-sm text-neutral-500">No matches found.</div> : null}
                {options.map((option) => {
                  const detail = detailFor?.(option);
                  return (
                    <button key={keyFor(option)} type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100" onClick={() => { onSelect(option); setOpen(false); }}>
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

function buildPayload(form: FormState, lines: InvoiceLine[], products: Product[], totals: ReturnType<typeof calculateTotals>): PurchaseInvoicePayload | null {
  if (!form.referenceNo.trim()) {
    toast.error('Missing reference', { description: 'Reference no is required.' });
    return null;
  }
  if (form.supplierId === 'none' || form.warehouseId === 'none') {
    toast.error('Missing invoice fields', { description: 'Supplier and warehouse are required.' });
    return null;
  }

  const statusId = Number(form.purchaseStatusId);
  const invoiceLines = lines.map((line) => ({ line, product: products.find((item) => String(item.id) === line.productId), values: calculateLine(line, form.purchaseStatusId) }));
  if (invoiceLines.some((item) => !item.product)) {
    toast.error('Missing product', { description: 'Every invoice line must have a product.' });
    return null;
  }
  if (invoiceLines.some((item) => item.values.qty <= 0)) {
    toast.error('Invalid quantity', { description: 'Line quantities must be greater than zero.' });
    return null;
  }
  if (statusId === PURCHASE_STATUS_PARTIAL && invoiceLines.some((item) => item.values.received < 0 || item.values.received > item.values.qty)) {
    toast.error('Invalid received quantity', { description: 'Received quantity must be between zero and ordered quantity.' });
    return null;
  }
  if (invoiceLines.some((item) => isBatchProduct(item.product) && (!item.line.batchNo.trim() || !item.line.expiredDate))) {
    toast.error('Missing batch details', { description: 'Batch no and expiry date are required for batch products.' });
    return null;
  }
  if (invoiceLines.some((item) => isVariantProduct(item.product) && !productVariantById(item.product, nullableId(item.line.variantId)))) {
    toast.error('Missing variant', { description: 'Variant is required for variant products.' });
    return null;
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);
  return {
    reference_no: form.referenceNo.trim(),
    purchase_date: form.purchaseDate,
    supplier_id: Number(form.supplierId),
    warehouse_id: Number(form.warehouseId),
    status: statusId,
    purchase_status_id: statusId,
    payment_status: paymentStatus(form.paymentMode),
    lines: invoiceLines.map(({ line, product, values }) => {
      const variant = productVariantById(product, nullableId(line.variantId));

      return {
        product_id: product?.id as number,
        product_code: variant?.item_code ?? product?.code ?? null,
        variant_id: variant?.variant_id ?? null,
        qty: values.qty,
        received: normalizedReceived(statusId, line),
        batch_no: isBatchProduct(product) ? nullableText(line.batchNo) : null,
        expired_date: isBatchProduct(product) ? nullableText(line.expiredDate) : null,
        purchase_unit: nullableId(line.unitId),
        net_unit_cost: values.cost,
        discount: values.discount,
        tax_rate: values.taxRate,
        tax: values.tax,
        subtotal: values.subtotal,
      };
    }),
    order_tax_rate: numberValue(form.orderTaxRate),
    order_discount: numberValue(form.orderDiscount),
    shipping_cost: numberValue(form.shippingCost),
    paid_by_id: form.paymentMode === 'unpaid' ? null : 1,
    paying_amount: paidAmount,
    paid_amount: paidAmount,
    payment_note: nullableText(form.paymentNote),
    note: nullableText(form.note),
  };
}

function calculateTotals(lines: InvoiceLine[], form: FormState) {
  const lineTotals = lines.map((line) => calculateLine(line, form.purchaseStatusId));
  const totalQty = round2(lineTotals.reduce((sum, line) => sum + line.qty, 0));
  if (Number(form.purchaseStatusId) === PURCHASE_STATUS_ORDERED) {
    return { totalQty, totalDiscount: 0, totalCost: 0, orderTax: 0, grandTotal: 0 };
  }
  const lineDiscount = round2(lineTotals.reduce((sum, line) => sum + line.discount, 0));
  const orderDiscount = numberValue(form.orderDiscount);
  const totalDiscount = round2(lineDiscount + orderDiscount);
  const totalCost = round2(lineTotals.reduce((sum, line) => sum + line.subtotal, 0));
  const orderTax = round2(Math.max(totalCost - orderDiscount, 0) * numberValue(form.orderTaxRate) / 100);
  const grandTotal = round2(totalCost + orderTax + numberValue(form.shippingCost) - orderDiscount);
  return { totalQty, totalDiscount, totalCost, orderTax, grandTotal };
}

function calculateLine(line: InvoiceLine, purchaseStatusId: string | number) {
  const statusId = Number(purchaseStatusId);
  const qty = numberValue(line.qty);
  const received = normalizedReceived(statusId, line);
  const cost = numberValue(line.cost);
  const discount = numberValue(line.discount);
  const taxRate = numberValue(line.taxRate);
  if (statusId === PURCHASE_STATUS_ORDERED) {
    return { qty, received, cost, discount: 0, taxRate, tax: 0, subtotal: 0 };
  }
  const taxable = Math.max(0, cost * qty - discount);
  const tax = round2(taxable * taxRate / 100);
  const subtotal = round2(taxable + tax);
  return { qty, received, cost, discount, taxRate, tax, subtotal };
}

function normalizedReceived(statusId: number, line: InvoiceLine) {
  if (statusId === PURCHASE_STATUS_RECEIVED) return numberValue(line.qty);
  if (isUnreceivedStatus(statusId)) return 0;
  return Math.min(Math.max(numberValue(line.received), 0), numberValue(line.qty));
}

function isReceivedQuantitySyncedStatus(statusId: number) {
  return statusId === PURCHASE_STATUS_RECEIVED || statusId === PURCHASE_STATUS_PARTIAL;
}

function isUnreceivedStatus(statusId: number) {
  return statusId === PURCHASE_STATUS_PENDING || statusId === PURCHASE_STATUS_ORDERED;
}

function boundedReceivedValue(received: string, qty: string) {
  if (!received.trim()) return received;
  return String(Math.min(Math.max(numberValue(received), 0), numberValue(qty)));
}

function paymentStatus(mode: PaymentMode) {
  if (mode === 'paid') return 2;
  return 1;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function paymentPaidAmount(mode: PaymentMode, paidAmount: string, grandTotal: number) {
  if (mode === 'paid') return grandTotal;
  if (mode === 'partial') return Math.min(numberValue(paidAmount), grandTotal);
  return 0;
}

function purchasePaymentModeFromStatus(status: number, paidAmount: number): PaymentMode {
  if (status === 2) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}

function taxForProduct(product: Product, taxes: Tax[]) {
  return Number(taxes.find((tax) => tax.id === product.tax_id)?.rate ?? 0);
}

function isBatchProduct(product?: Product | null) {
  return product?.is_batch === true || String(product?.is_batch) === '1';
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
  const productUnitId = product.unit_id ?? product.unit?.id ?? product.purchase_unit_id ?? product.sale_unit_id ?? null;
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

function baseUnitCostForProduct(product: Product) {
  return numberValue(product.cost);
}

function unitCostForProductUnit(product: Product, unitId: number | null | undefined, units: Unit[]) {
  const baseCost = baseUnitCostForProduct(product);
  const baseUnitId = product.unit_id ?? product.unit?.id ?? null;
  const factor = unitConversionFactorFromBase(unitId, baseUnitId, units);

  return round2(baseCost * factor);
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

function firstBatchNoForProduct(product: Product, warehouseId?: number | null) {
  const batch = product.warehouse_prices?.find((item) =>
    Number(item.warehouse_id) === Number(warehouseId) && item.batch_no
  );

  return batch?.batch_no ?? null;
}

async function validateBatchLines(lines: PurchaseInvoicePayload['lines'], products: Product[], warehouseId: number) {
  for (const line of lines) {
    if (!line.batch_no) continue;

    const response = await api.checkBatchAvailability(line.product_id, line.batch_no, warehouseId);
    if (!response.data.valid) {
      const product = products.find((item) => item.id === line.product_id);
      return `${product?.name ?? 'Selected product'} batch "${line.batch_no}" is not available in the selected warehouse. ${response.data.message}`;
    }
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

function generateReference() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `pr-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
