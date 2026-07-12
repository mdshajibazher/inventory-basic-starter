'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Box, CircleCheck, Download, Eye, FileText, Pencil, Plus, Printer, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, type ReturnInvoicePayload, type SalesInvoicePayload } from '@/lib/api';
import type { Customer, PaginationMeta, Product, ProductVariant, Tax, Unit, Warehouse } from '@/lib/types';
import { clsx, errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActivityLogTimeline } from '@/components/activity-log';
import { Pagination, TableWrap } from '@/components/resource-shell';
import { ActionButton, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

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
  const { hasPermission, user } = useAuth();
  const labels = invoiceLabels(kind);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(kind));
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const selectedCustomer = customers.find((customer) => String(customer.id) === form.customerId);
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.warehouseId);
  const currentBranchLabel = user?.current_biller
    ? user.current_biller.company_name
      ? `${user.current_biller.name} - ${user.current_biller.company_name}`
      : user.current_biller.name
    : 'No branch selected';
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
      const [customerResponse, warehouseResponse, productResponse, productOptionsResponse] = await Promise.all([
        api.customers({ perPage: 30 }),
        api.warehouses({ perPage: 30, activeOnly: true }),
        api.products({ perPage: 30 }),
        api.productOptions(),
      ]);
      const nextCustomers = customerResponse.data as Customer[];
      const nextWarehouses = warehouseResponse.data as Warehouse[];
      const nextProducts = (productResponse.data as Product[]).filter(isInvoiceProductSupported);
      const productOptions = productOptionsResponse.data as ProductOptions;
      setCustomers(nextCustomers);
      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setTaxes(productOptions.taxes ?? []);
      setUnits(productOptions.units ?? []);
      setForm((current) => ({
        ...current,
        customerId: current.customerId === 'none' ? idValue(nextCustomers[0]?.id) : current.customerId,
        warehouseId: current.warehouseId === 'none' ? idValue(nextWarehouses[0]?.id) : current.warehouseId,
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
  }, [loadOptions]);

  useEffect(() => {
    if (mode === 'index') void loadInvoices(page);
  }, [approvalStatus, debouncedSearch, kind, mode, page, perPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!invoiceId || mode === 'index' || mode === 'create') return;
    void openInvoice(invoiceId, mode === 'edit' ? 'edit' : 'view');
  }, [invoiceId, mode]);

  async function loadInvoices(nextPage = page) {
    setListLoading(true);
    try {
      const response = kind === 'returns'
        ? await api.returnInvoices({ page: nextPage, perPage, search: debouncedSearch, approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus })
        : await api.salesInvoices({ page: nextPage, perPage, search: debouncedSearch, approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus });
      setInvoices(response.data as Record<string, any>[]);
      setPagination(response.meta ?? null);
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
    const nextWarehouseId = String(warehouse.id);
    const warehouseChanged = form.warehouseId !== nextWarehouseId;

    setWarehouses((current) => upsertById(current, warehouse));
    setForm((current) => ({ ...current, warehouseId: nextWarehouseId }));
    if (kind === 'returns') return;

    if (warehouseChanged) {
      setLines([emptyLine()]);
    }
  }

  function selectProduct(lineKey: string, product: Product) {
    const warehouseId = nullableId(form.warehouseId);
    if (!warehouseId) {
      toast.error('Select warehouse first', { description: 'Choose a warehouse before selecting products.' });
      return;
    }

    const availableQty = warehouseStockForProduct(product, warehouseId);
    if (kind === 'sales' && !isVariantProduct(product) && availableQty <= 0) {
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
      const warehouseId = nullableId(form.warehouseId);

      if (product && variant && kind === 'sales' && warehouseStockForProduct(product, warehouseId, variant.variant_id) <= 0) {
        toast.error('No stock available', {
          description: `${product.name} - ${variant.name} has no stock in ${selectedWarehouse?.name ?? 'the selected warehouse'}.`,
        });
      }

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

  async function approveInvoice(id: number) {
    setSaving(true);
    try {
      const response = kind === 'returns' ? await api.approveReturnInvoice(id) : await api.approveSalesInvoice(id);
      toast.success(response.message || `${labels.singular} approved`);
      setSelectedInvoice(response.data as Record<string, any>);
      void loadInvoices();
    } catch (error) {
      toast.error('Approval failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function requestApproval(id: number) {
    setApprovalTarget(id);
  }

  async function exportInvoicePdf() {
    if (!selectedInvoice?.id) return;

    setExportingPdf(true);
    try {
      await api.exportSalesInvoicePdf(Number(selectedInvoice.id), String(selectedInvoice.reference_no ?? selectedInvoice.id));
    } catch (error) {
      toast.error('PDF export failed', { description: errorMessage(error) });
    } finally {
      setExportingPdf(false);
    }
  }

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      invoiceDate: String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? todayDate()),
      customerId: idValue(invoice.customer_id),
      warehouseId: idValue(invoice.warehouse_id),
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
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Search"><Input value={search} placeholder="Search reference or customer" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()} /></Field>
          <Field label="Approval Status"><Select value={approvalStatus} onValueChange={(value) => { setApprovalStatus(value as 'all' | 'pending' | 'approved'); setPage(1); }} options={[{ value: 'all', label: 'All statuses' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }]} /></Field>
        </div>
        <TableWrap loading={listLoading}>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">{kind === 'returns' ? 'Return date' : 'Sale date'}</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Approval</th>
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
                  <td className="px-4 py-3"><ApprovalBadge status={invoice.approval_status} /></td>
                  <td className="px-4 py-3 text-right">
                    {invoice.can_approve ? <ApproveActionButton disabled={saving} onClick={() => requestApproval(Number(invoice.id))} /> : null}
                    <Link className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100" href={`${labels.basePath}/${invoice.id}`} aria-label={`View ${labels.singular}`} title="View"><Eye className="h-4 w-4" /></Link>
                    <Link className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" href={`${labels.basePath}/${invoice.id}/edit`} aria-label={`Edit ${labels.singular}`} title="Edit"><Pencil className="h-4 w-4" /></Link>
                  </td>
                </tr>
              ))}
              {!invoices.length ? <tr><td className="px-4 py-6 text-center text-neutral-500" colSpan={7}>No invoices found</td></tr> : null}
            </tbody>
          </table>
        </TableWrap>
        <Pagination meta={pagination} loading={listLoading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />
      </section> : null}
      {mode === 'details' ? (
        <section className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{labels.singularTitle} Details</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <Link className="hover:text-neutral-900" href="/dashboard">Dashboard</Link>
                <span>/</span>
                <Link className="hover:text-neutral-900" href={labels.basePath}>{labels.plural}</Link>
                <span>/</span>
                <span>{labels.singularTitle} Details</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href={labels.basePath}>Back</Link>
              {selectedInvoice?.can_approve ? <Button type="button" variant="secondary" disabled={saving} onClick={() => requestApproval(Number(selectedInvoice.id))}>Approve</Button> : null}
              {invoiceId ? (
                <Link className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" href={`${labels.basePath}/${invoiceId}/edit`} aria-label={`Edit ${labels.singular}`} title="Edit"><Pencil className="h-4 w-4" /></Link>
              ) : null}
              <Button type="button" variant="secondary" disabled={!selectedInvoice || exportingPdf} onClick={() => void exportInvoicePdf()}>
                <Printer className="h-4 w-4" />
                {exportingPdf ? 'Generating...' : 'Print'}
              </Button>
              {selectedInvoice?.document_url ? (
                <a className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href={String(selectedInvoice.document_url)} download>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              ) : (
                <Button type="button" variant="secondary" disabled>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              )}
            </div>
          </div>
          {selectedInvoice ? <InvoiceDetails invoice={selectedInvoice} kind={kind} canEditCost={hasPermission('sales-edit')} onInvoiceUpdated={setSelectedInvoice} /> : <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading invoice...</div>}
        </section>
      ) : null}
      {mode !== 'details' && mode !== 'index' ? <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50" href={labels.basePath}>
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </Link>
            <Button type="button" variant="secondary" className="border-slate-200 text-slate-800 shadow-sm" disabled={saving} onClick={resetForm}>
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{editingId ? `Edit ${labels.singularTitle}` : labels.singularTitle}</h1>
          <p className="mt-2 text-base text-slate-500">{editingId ? 'Update invoice fields and line items' : labels.description}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="border-slate-200 text-slate-800 shadow-sm" disabled={loading} onClick={() => void loadOptions()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="submit" className="bg-blue-600 px-5 shadow-sm hover:bg-blue-700" disabled={saving || loading}>
            <FileText className="h-4 w-4" />
            {saving ? 'Saving...' : editingId ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </div>
      </div>

      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-950">Invoice</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Reference No"><Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} /></Field>
          <Field label={kind === 'returns' ? 'Return Date' : 'Sale Date'}><Input type="date" value={form.invoiceDate} onChange={(event) => setValue('invoiceDate', event.target.value)} /></Field>
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
          <div className="md:col-span-2">
            <Field label="Branch"><Input value={currentBranchLabel} readOnly /></Field>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Box className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-950">Products</h2>
          </div>
          <Button type="button" variant="secondary" className="border-blue-200 text-blue-600 hover:bg-blue-50" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </div>
        <div className="grid gap-3">
          {lines.map((line, index) => {
            const product = products.find((item) => String(item.id) === line.productId);
            const lineRequiresBatch = isBatchProduct(product);
            const selectedVariant = productVariantById(product, nullableId(line.variantId));
            const currentStock = product && (!isVariantProduct(product) || selectedVariant)
              ? currentStockLabel(product, nullableId(form.warehouseId), selectedVariant?.variant_id)
              : null;

            return (
              <div key={line.key} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">Line {index + 1}</div>
                  <ActionButton
                    icon={Trash2}
                    text="Remove line"
                    color="text-red-500 hover:text-red-600"
                    bgColor="bg-red-50 hover:border-red-100 hover:bg-red-100"
                    disabled={lines.length === 1}
                    onClick={() => removeLine(line.key)}
                  />
                </div>
                <div className="grid gap-3 xl:grid-cols-12">
                  <div className={isVariantProduct(product) ? 'xl:col-span-2' : 'xl:col-span-3'}>
                    <SearchableSelect
                      label="Product"
                      valueLabel={productLabel(line.productId, line.variantId, products)}
                      placeholder="Search products"
                      search={searchProducts}
                      keyFor={(product) => product.id}
                      labelFor={(product) => `${product.name} (${product.code})`}
                      detailFor={(product) => {
                        const warehouseId = nullableId(form.warehouseId);
                        if (isVariantProduct(product)) {
                          return `Base price ${money(baseUnitPriceForProduct(product))} | Select variant for stock`;
                        }
                        return `Base price ${money(baseUnitPriceForProduct(product))} | Qty ${money(warehouseStockForProduct(product, warehouseId))}`;
                      }}
                      onSelect={(product) => selectProduct(line.key, product)}
                    />
                    {currentStock && !isVariantProduct(product) ? (
                      <div className="mt-1 text-xs font-medium text-neutral-500">
                        Current stock: {currentStock}
                      </div>
                    ) : null}
                  </div>
                  {isVariantProduct(product) ? (
                    <div className="xl:col-span-2">
                      <Field label="Variant">
                        <Select value={line.variantId} onValueChange={(value) => selectVariant(line.key, value)} options={variantSelectOptions(product)} />
                        {currentStock ? (
                          <div className="mt-1 text-xs font-medium text-neutral-500">
                            Current stock: {currentStock}
                          </div>
                        ) : null}
                      </Field>
                    </div>
                  ) : null}
                  <div className="xl:col-span-1">
                    <Field label="Qty"><Input type="number" step="0.01" min="0" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} /></Field>
                  </div>
                  <div className="xl:col-span-2">
                    <Field label="Unit">
                      {product && product.type !== 'combo' ? (
                        <Select value={line.unitId} onValueChange={(value) => selectLineUnit(line.key, value)} options={unitSelectOptions(productOptionsForFamily(product, units))} />
                      ) : <div className="h-10" />}
                    </Field>
                  </div>
                  {lineRequiresBatch ? (
                    <div className="xl:col-span-2">
                      <Field label="Batch No"><Input required value={line.batchNo} onChange={(event) => updateLine(line.key, 'batchNo', event.target.value)} /></Field>
                    </div>
                  ) : null}
                  <div className={lineRequiresBatch || isVariantProduct(product) ? 'xl:col-span-1' : 'xl:col-span-2'}>
                    <Field label="Unit Price (৳)"><Input type="number" step="0.01" min="0" value={line.price} onChange={(event) => updateLine(line.key, 'price', event.target.value)} /></Field>
                  </div>
                  <div className={lineRequiresBatch || isVariantProduct(product) ? 'xl:col-span-1' : 'xl:col-span-2'}>
                    <Field label="Discount (৳)"><Input type="number" step="0.01" min="0" value={line.discount} onChange={(event) => updateLine(line.key, 'discount', event.target.value)} /></Field>
                  </div>
                  <div className={lineRequiresBatch ? 'xl:col-span-1' : 'xl:col-span-1'}>
                    <Field label="Tax %"><Input type="number" step="0.01" min="0" value={line.taxRate} onChange={(event) => updateLine(line.key, 'taxRate', event.target.value)} /></Field>
                  </div>
                  <div className={lineRequiresBatch ? 'xl:col-span-1' : 'xl:col-span-1'}>
                    <Field label="Line Total (৳)">
                      <Input value={money(calculateLine(line).subtotal)} readOnly className="bg-slate-100 font-semibold text-slate-700" />
                    </Field>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-950">{kind === 'returns' ? 'Adjustments' : 'Adjustments and Payment'}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Order Tax %"><Input type="number" step="0.01" min="0" value={form.orderTaxRate} onChange={(event) => setValue('orderTaxRate', event.target.value)} /></Field>
          {kind === 'sales' ? <Field label="Order Discount"><Input type="number" step="0.01" min="0" value={form.orderDiscount} onChange={(event) => setValue('orderDiscount', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Shipping Cost"><Input type="number" step="0.01" min="0" value={form.shippingCost} onChange={(event) => setValue('shippingCost', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Payment Status"><Select value={form.paymentMode} onValueChange={(value) => setValue('paymentMode', value as PaymentMode)} options={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial cash' },
            { value: 'paid', label: 'Paid cash' },
          ]} /></Field> : null}
          {kind === 'sales' && form.paymentMode === 'partial' ? <Field label="Paid Amount"><Input type="number" step="0.01" min="0" value={form.paidAmount} onChange={(event) => setValue('paidAmount', event.target.value)} /></Field> : null}
          {kind === 'sales' ? <Field label="Payment Note"><Input placeholder="Payment note (optional)" value={form.paymentNote} onChange={(event) => setValue('paymentNote', event.target.value)} /></Field> : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-950">Notes</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={kind === 'returns' ? 'Return Note' : 'Sale Note'}><Textarea placeholder={kind === 'returns' ? 'Add return note (optional)' : 'Add sale note (optional)'} value={form.saleNote} onChange={(event) => setValue('saleNote', event.target.value)} /></Field>
          <Field label="Staff Note"><Textarea placeholder="Add staff note (optional)" value={form.staffNote} onChange={(event) => setValue('staffNote', event.target.value)} /></Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 divide-slate-200 text-sm sm:grid-cols-5 sm:divide-x">
          <Summary label="Total qty" value={money(totals.totalQty)} />
          <Summary label="Items subtotal" value={money(totals.totalPrice)} />
          <Summary label="Discount" value={money(totals.totalDiscount)} />
          <Summary label="Order tax" value={money(totals.orderTax)} />
          <Summary label="Grand total" value={money(totals.grandTotal)} strong />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" className="bg-blue-600 px-6 shadow-sm hover:bg-blue-700" disabled={saving || loading}>
          <FileText className="h-4 w-4" />
          {saving ? 'Saving...' : editingId ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
      </> : null}
      <Modal title="Approve Invoice" open={approvalTarget !== null} onOpenChange={(open) => !open && setApprovalTarget(null)}>
        <div className="grid gap-4">
          <p className="text-sm text-neutral-700">Approve this {labels.singular.toLowerCase()}? This will apply its inventory and financial effects.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setApprovalTarget(null)}>Cancel</Button><Button type="button" disabled={saving} onClick={() => { if (approvalTarget !== null) void approveInvoice(approvalTarget).finally(() => setApprovalTarget(null)); }}>{saving ? 'Approving...' : 'Approve invoice'}</Button></div>
        </div>
      </Modal>
    </form>
  );
}

function InvoiceDetails({ invoice, kind, canEditCost, onInvoiceUpdated }: { invoice: Record<string, any>; kind: InvoiceKind; canEditCost: boolean; onInvoiceUpdated: (invoice: Record<string, any>) => void }) {
  const [costLine, setCostLine] = useState<Record<string, any> | null>(null);
  const [costValue, setCostValue] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const lines = (invoice.products ?? []) as Record<string, any>[];
  const subtotal = numberValue(invoice.total_price);
  const orderDiscount = numberValue(invoice.order_discount) + numberValue(invoice.coupon_discount);
  const orderTax = numberValue(invoice.order_tax);
  const shippingCost = numberValue(invoice.shipping_cost);
  const grandTotal = numberValue(invoice.grand_total);
  const paidAmount = numberValue(invoice.paid_amount);
  const dueAmount = numberValue(invoice.due_amount);
  const changeAmount = Math.max(paidAmount - grandTotal, 0);
  const lineCostTotal = round2(lines.reduce((sum, line) => sum + detailLineCost(line), 0));
  const profit = round2(grandTotal - lineCostTotal);
  const showProfit = kind === 'sales' && lines.some((line) => detailLineCost(line) > 0);
  const payment = invoice.payments?.[0] ?? null;
  const invoiceDate = String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-');
  const invoiceTime = timeOnly(invoice.created_at);
  const note = String((kind === 'returns' ? invoice.return_note : invoice.sale_note) ?? '-');

  function openCostEditor(line: Record<string, any>) {
    setCostLine(line);
    setCostValue(String(detailLineUnitCost(line)));
  }

  async function saveCost() {
    if (!costLine?.id || !invoice.id) return;
    const unitCost = numberValue(costValue);
    if (unitCost < 0) {
      toast.error('Cost must be zero or greater.');
      return;
    }

    setSavingCost(true);
    try {
      const response = await api.updateSalesInvoiceLineCost(Number(invoice.id), Number(costLine.id), unitCost);
      onInvoiceUpdated(response.data as Record<string, any>);
      setCostLine(null);
      toast.success('Sale cost updated');
    } catch (error) {
      toast.error('Cost update failed', { description: errorMessage(error) });
    } finally {
      setSavingCost(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid gap-6 border-b border-neutral-200 p-5 md:grid-cols-5">
          <DetailHeader label="Invoice No." value={String(invoice.reference_no ?? '-')} accent>
            <span className={clsx('mt-2 inline-flex w-fit rounded px-2 py-1 text-xs font-semibold', paymentStatusClasses(invoice.payment_status))}>
              {kind === 'sales' ? paymentStatusLabel(invoice.payment_status, paidAmount, grandTotal) : String(invoice.approval_status ?? 'approved')}
            </span>
          </DetailHeader>
          <DetailHeader label="Date" value={invoiceDate}>
            {invoiceTime ? <span className="mt-1 block text-sm text-neutral-500">{invoiceTime}</span> : null}
          </DetailHeader>
          <DetailHeader label="Customer" value={String(invoice.customer?.name ?? '-')} accent>
            {invoice.customer?.phone_number ? <span className="mt-1 block text-sm text-blue-600">{invoice.customer.phone_number}</span> : null}
          </DetailHeader>
          <DetailHeader label={kind === 'returns' ? 'Return Location' : 'Sales Location'} value={String(invoice.warehouse?.name ?? invoice.biller?.name ?? '-')} accent />
          <DetailHeader label={kind === 'returns' ? 'Returned By' : 'Sales Person'} value={String(invoice.user?.name ?? '-')} />
        </div>

        <div className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-950">{kind === 'returns' ? 'Return Items' : 'Sales Items'}</h2>
          <div className="overflow-x-auto rounded-md border border-neutral-200">
            <table className="min-w-[1120px] w-full border-collapse text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-950">
                <tr className="[&>th]:border-r [&>th]:border-neutral-200 last:[&>th]:border-r-0">
                  <th className="w-12 px-3 py-3 font-semibold">SL</th>
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Variant</th>
                  <th className="px-3 py-3 font-semibold">SKU / Code</th>
                  <th className="px-3 py-3 font-semibold">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold">Quantity</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                  <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                  <th className="px-3 py-3 text-right font-semibold">Discount</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-3 py-3 text-right font-semibold">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {lines.map((line, index) => {
                  const lineCost = detailLineCost(line);
                  const lineProfit = round2(numberValue(line.total) - lineCost);
                  return (
                    <tr key={line.id ?? index} className="align-top [&>td]:border-r [&>td]:border-neutral-100 last:[&>td]:border-r-0">
                      <td className="px-3 py-3 text-center text-neutral-700">{index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-950">{line.product?.name ?? `#${line.product_id}`}</div>
                        {line.product?.code ? <div className="mt-1 text-sm text-neutral-500">{line.product.code}</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-700">{line.variant?.name ?? '-'}</div>
                        {line.batch?.batch_no ? <div className="mt-1 text-sm text-neutral-500">Batch {line.batch.batch_no}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-neutral-700">{line.variant?.item_code ?? line.product?.sku ?? line.product?.code ?? '-'}</td>
                      <td className="px-3 py-3 text-neutral-700">{detailLineUnit(line)}</td>
                      <td className="px-3 py-3 text-right">{money(numberValue(line.qty))}</td>
                      <td className="px-3 py-3 text-right">{money(numberValue(line.net_unit_price))}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <span>{money(detailLineUnitCost(line))}</span>
                          {kind === 'sales' && canEditCost ? <Button type="button" variant="ghost" className="h-5 w-5 cursor-pointer px-0 text-sm font-semibold text-black hover:bg-neutral-100" aria-label={`Edit cost for ${invoiceLineProductName(line)}`} title="Edit sale cost" onClick={() => openCostEditor(line)}><span aria-hidden="true">✎</span></Button> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">{money(numberValue(line.discount))}</td>
                      <td className="px-3 py-3 text-right">{money(numberValue(line.total))}</td>
                      <td className={clsx('px-3 py-3 text-right font-semibold', lineProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {lineCost > 0 ? money(lineProfit) : '-'}
                      </td>
                    </tr>
                  );
                })}
                {!lines.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={11}>No products found</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_1.05fr]">
          <div className="grid content-start gap-3">
            <InfoPanel title="Payment Information">
              <InfoRow label="Payment Method" value={paymentMethodLabel(payment?.paying_method)} />
              <InfoRow label="Paid Amount" value={kind === 'sales' ? money(paidAmount) : '-'} />
              <InfoRow label="Change Amount" value={kind === 'sales' ? money(changeAmount) : '-'} highlight={changeAmount > 0} />
              <InfoRow label="Payment Note" value={String(payment?.payment_note ?? '-')} />
            </InfoPanel>

            <InfoPanel title="Additional Information">
              <InfoRow label="Reference" value={String(invoice.reference_no ?? '-')} />
              <InfoRow label="Note" value={note} />
              <InfoRow
                label="Overall Profit Status"
                value={showProfit ? (profit >= 0 ? 'Profitable' : 'Loss') : '-'}
                badge={showProfit}
                trailing={showProfit ? money(profit) : undefined}
                highlight={profit >= 0}
              />
              <InfoRow label="Approval" value={String(invoice.approval_status ?? 'approved')} badge />
              {invoice.approver?.name ? <InfoRow label="Approved By" value={String(invoice.approver.name)} /> : null}
            </InfoPanel>
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <TotalRow label="Subtotal" value={money(subtotal)} />
            <TotalRow label="Discount" value={money(orderDiscount)} />
            <TotalRow label={`VAT (${money(numberValue(invoice.order_tax_rate))}%)`} value={money(orderTax)} />
            {shippingCost > 0 ? <TotalRow label="Shipping Cost" value={money(shippingCost)} /> : null}
            <TotalRow label="Grand Total" value={money(grandTotal)} primary />
            {kind === 'sales' ? <TotalRow label="Paid Amount" value={money(paidAmount)} /> : null}
            {kind === 'sales' ? <TotalRow label="Due Amount" value={money(dueAmount)} /> : null}
            <TotalRow label="Total Cost" value={showProfit ? money(lineCostTotal) : '-'} />
            <TotalRow label="Total Profit" value={showProfit ? money(profit) : '-'} success={showProfit && profit >= 0} danger={showProfit && profit < 0} />
          </div>
        </div>
      </div>
      <ActivityLogTimeline logs={invoice.activity_logs ?? []} />
      <Modal title="Edit Sale Cost" open={costLine !== null} onOpenChange={(open) => !open && setCostLine(null)}>
        <div className="grid gap-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This changes the saved cost for this sale only. It updates profit reporting but does not change the product's default cost or stock.</div>
          <div className="text-sm text-neutral-600">{costLine ? `${invoiceLineProductName(costLine)} · ${detailLineUnit(costLine)}` : ''}</div>
          <Field label="Cost per sales unit"><Input type="number" min="0" step="0.01" value={costValue} onChange={(event) => setCostValue(event.target.value)} autoFocus /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCostLine(null)} disabled={savingCost}>Cancel</Button><Button type="button" onClick={() => void saveCost()} disabled={savingCost}>{savingCost ? 'Saving...' : 'Save cost'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function DetailHeader({ label, value, accent = false, children }: { label: string; value: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={clsx('mt-3 break-words text-base font-semibold', accent ? 'text-blue-600' : 'text-neutral-950')}>{value}</div>
      {children}
    </div>
  );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      <h3 className="border-b border-neutral-200 px-3 py-3 text-sm font-semibold text-neutral-950">{title}</h3>
      <div className="grid gap-2 p-3">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  trailing,
  badge = false,
  highlight = false,
}: {
  label: string;
  value: string;
  trailing?: string;
  badge?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,0.75fr)_1fr] items-center gap-3 text-sm">
      <div className="text-neutral-700">{label}</div>
      <div className="flex items-center justify-between gap-3 font-medium text-neutral-950">
        {badge ? (
          <span className={clsx('inline-flex w-fit rounded px-2 py-1 text-xs font-semibold', highlight ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-700')}>
            {value}
          </span>
        ) : (
          <span className={highlight ? 'text-emerald-600' : undefined}>{value}</span>
        )}
        {trailing ? <span className={highlight ? 'text-emerald-600' : 'text-neutral-700'}>{trailing}</span> : null}
      </div>
    </div>
  );
}

function TotalRow({ label, value, primary = false, success = false, danger = false }: { label: string; value: string; primary?: boolean; success?: boolean; danger?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 text-sm last:border-b-0',
        primary && 'bg-blue-50 text-blue-700',
        success && 'bg-emerald-50 text-emerald-700',
        danger && 'bg-red-50 text-red-700'
      )}
    >
      <span className={clsx((primary || success || danger) && 'text-base font-semibold')}>{label}</span>
      <span className={clsx('font-semibold', primary && 'text-xl', (success || danger) && 'text-lg')}>{value}</span>
    </div>
  );
}

function ApprovalBadge({ status }: { status: unknown }) {
  const pending = status === 'pending';
  return (
    <span className={pending ? 'inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800' : 'inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800'}>
      {pending ? 'Pending' : 'Approved'}
    </span>
  );
}

function ApproveActionButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="mr-2 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
      disabled={disabled}
      onClick={onClick}
    >
      <CircleCheck className="h-4 w-4" />
      Approve
    </Button>
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
    <div className="px-3 py-1">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className={strong ? 'mt-1 text-2xl font-bold text-blue-600' : 'mt-1 text-lg font-semibold text-slate-950'}>{value}</div>
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
  if (form.customerId === 'none' || form.warehouseId === 'none') {
    toast.error('Missing invoice fields', { description: 'Customer and warehouse are required.' });
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

function detailLineUnit(line: Record<string, any>) {
  if (!line.unit) return '-';
  const unitName = line.unit.unit_name ?? line.unit.name;
  const unitCode = line.unit.unit_code ?? line.unit.code;
  return unitCode && unitName ? `${unitName} (${unitCode})` : String(unitName ?? unitCode ?? '-');
}

function detailLineCost(line: Record<string, any>) {
  if (line.total_cost !== null && line.total_cost !== undefined) return numberValue(line.total_cost);

  const totalCost = numberValue(line.total_cost);
  if (totalCost > 0) return totalCost;

  const unitCost = numberValue(line.unit_cost);
  if (unitCost > 0) return round2(unitCost * numberValue(line.qty));

  const productCost = numberValue(line.product?.cost);
  return productCost > 0 ? round2(productCost * numberValue(line.qty)) : 0;
}

function detailLineUnitCost(line: Record<string, any>) {
  const unitCost = numberValue(line.unit_cost);
  if (unitCost > 0 || line.unit_cost === 0) return unitCost;
  const qty = numberValue(line.qty);
  const totalCost = numberValue(line.total_cost);
  if (qty > 0 && totalCost > 0) return round2(totalCost / qty);
  return numberValue(line.product?.cost);
}

function paymentStatusLabel(status: unknown, paidAmount: number, grandTotal: number) {
  if (Number(status) === 4 || (grandTotal > 0 && paidAmount >= grandTotal)) return 'Paid';
  if (Number(status) === 3 || paidAmount > 0) return 'Partial';
  return 'Unpaid';
}

function paymentStatusClasses(status: unknown) {
  if (Number(status) === 4) return 'bg-emerald-600 text-white';
  if (Number(status) === 3) return 'bg-amber-100 text-amber-800';
  return 'bg-neutral-100 text-neutral-700';
}

function paymentMethodLabel(method: unknown) {
  if (!method) return '-';
  return String(method)
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function timeOnly(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

function warehouseStockForProduct(product: Product, warehouseId?: number | null, variantId?: number | null) {
  const warehouseStocks = warehouseId
    ? product.warehouse_prices?.filter((item) => (
      Number(item.warehouse_id) === warehouseId &&
      (variantId ? Number(item.variant_id) === Number(variantId) : true)
    ))
    : [];

  if (warehouseStocks?.length) {
    return warehouseStocks.reduce((sum, item) => sum + numberValue(item.qty), 0);
  }

  if (warehouseId) {
    return 0;
  }

  return numberValue(product.qty ?? product.quantity);
}

function currentStockLabel(product: Product, warehouseId?: number | null, variantId?: number | null) {
  const unitCode = product.unit?.unit_code ? ` ${product.unit.unit_code}` : '';
  return `${money(warehouseStockForProduct(product, warehouseId, variantId))}${unitCode}`;
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
