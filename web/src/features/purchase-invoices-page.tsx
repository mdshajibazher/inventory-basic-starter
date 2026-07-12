'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Box, CircleCheck, Eye, FileText, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, type PurchaseInvoicePayload, type PurchaseReturnPayload } from '@/lib/api';
import type { PaginationMeta, Product, PurchaseStatus, Supplier, Tax, Unit, Warehouse } from '@/lib/types';
import { clsx, errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActivityLogTimeline } from '@/components/activity-log';
import { Pagination, TableWrap } from '@/components/resource-shell';
import { ActionButton, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

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

const fallbackPurchaseStatuses: PurchaseStatus[] = [
  { id: 1, value: '1', label: 'Received' },
  { id: 2, value: '2', label: 'Partial' },
  { id: 3, value: '3', label: 'Pending' },
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
type PurchasePageKind = 'purchase' | 'return';

export function PurchaseInvoicesPage({ mode = 'index', invoiceId, kind = 'purchase' }: { mode?: InvoicePageMode; invoiceId?: number; kind?: PurchasePageKind }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const isReturn = kind === 'return';
  const basePath = isReturn ? '/purchase-return-invoices' : '/purchase-invoices';
  const pageTitle = isReturn ? 'Purchase returns' : 'Purchase invoices';
  const singularTitle = isReturn ? 'Purchase Return' : 'Purchase Invoice';
  const dateLabel = isReturn ? 'Return date' : 'Purchase date';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatuses, setPurchaseStatuses] = useState<PurchaseStatus[]>(fallbackPurchaseStatuses);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
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

  const selectedSupplier = suppliers.find((supplier) => String(supplier.id) === form.supplierId);
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.warehouseId);
  const showReceived = !isReturn && Number(form.purchaseStatusId) === PURCHASE_STATUS_PARTIAL;
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
      const apiPurchaseStatuses = (purchaseStatusResponse.data as PurchaseStatus[]).filter((status) => Number(status.id) !== 4 && String(status.value) !== '4');
      const nextPurchaseStatuses = apiPurchaseStatuses.length
        ? apiPurchaseStatuses
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
  }, [loadOptions]);

  useEffect(() => {
    if (mode === 'index') void loadInvoices(page);
  }, [approvalStatus, debouncedSearch, isReturn, mode, page, perPage]);

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
      const response = isReturn
        ? await api.purchaseReturnInvoices({ page: nextPage, perPage, search: debouncedSearch, approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus })
        : await api.purchaseInvoices({ page: nextPage, perPage, search: debouncedSearch, approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus });
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
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;

        const statusId = Number(form.purchaseStatusId);
        const nextLine = { ...line, [field]: value };
        if (field === 'qty' && isReceivedQuantitySyncedStatus(statusId)) {
          nextLine.received = String(value);
        } else if (field === 'qty' && statusId === PURCHASE_STATUS_PARTIAL) {
          nextLine.received = boundedReceivedValue(nextLine.received, String(value));
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
    const payload = buildPayload(form, lines, products, totals, kind);
    if (!payload) return;

    setSaving(true);
    try {
      const batchError = await validateBatchLines(payload.lines, products, payload.warehouse_id);
      if (batchError) {
        toast.error('Invalid batch no', { description: batchError });
        return;
      }

      const response = isReturn
        ? editingId
          ? await api.updatePurchaseReturnInvoice(editingId, payload as PurchaseReturnPayload)
          : await api.createPurchaseReturnInvoice(payload as PurchaseReturnPayload)
        : editingId
          ? await api.updatePurchaseInvoice(editingId, payload as PurchaseInvoicePayload)
          : await api.createPurchaseInvoice(payload as PurchaseInvoicePayload);
      toast.success(response.message || (editingId ? `${singularTitle} updated` : `${singularTitle} created`));
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
      const response = isReturn ? await api.purchaseReturnInvoice(id) : await api.purchaseInvoice(id);
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
      const response = isReturn ? await api.approvePurchaseReturnInvoice(id) : await api.approvePurchaseInvoice(id);
      toast.success(response.message || `${singularTitle} approved`);
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

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      purchaseDate: String(invoice.return_date ?? invoice.purchase_date ?? dateOnly(invoice.created_at) ?? todayDate()),
      supplierId: idValue(invoice.supplier_id),
      warehouseId: idValue(invoice.warehouse_id),
      purchaseStatusId: idValue(invoice.purchase_status_id ?? invoice.status),
      orderTaxRate: String(invoice.order_tax_rate ?? '0'),
      orderDiscount: String(invoice.order_discount ?? '0'),
      shippingCost: String(invoice.shipping_cost ?? '0'),
      paymentMode: isReturn ? 'unpaid' : purchasePaymentModeFromStatus(Number(invoice.payment_status), Number(invoice.paid_amount)),
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
          <h2 className="text-lg font-semibold">{pageTitle}</h2>
          <div className="flex gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800" href={`${basePath}/create`}>Create invoice</Link>
            <Button type="button" variant="secondary" onClick={() => void loadInvoices()} disabled={listLoading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Search"><Input value={search} placeholder="Search reference or supplier" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()} /></Field>
          <Field label="Approval Status"><Select value={approvalStatus} onValueChange={(value) => { setApprovalStatus(value as 'all' | 'pending' | 'approved'); setPage(1); }} options={[{ value: 'all', label: 'All statuses' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }]} /></Field>
        </div>
        <TableWrap loading={listLoading}>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">{dateLabel}</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3">{String(invoice.return_date ?? invoice.purchase_date ?? dateOnly(invoice.created_at) ?? '-')}</td>
                  <td className="px-4 py-3 font-medium">{invoice.reference_no}</td>
                  <td className="px-4 py-3">{invoice.supplier?.name ?? '-'}</td>
                  <td className="px-4 py-3">{isReturn ? '-' : <PurchaseStatusBadge status={invoice.purchase_status?.label ?? invoice.status} />}</td>
                  <td className="px-4 py-3">{money(numberValue(invoice.grand_total))}</td>
                  <td className="px-4 py-3"><ApprovalBadge status={invoice.approval_status} /></td>
                  <td className="px-4 py-3 text-right">
                    {invoice.can_approve ? <ApproveActionButton disabled={saving} onClick={() => requestApproval(Number(invoice.id))} /> : null}
                    <Link className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100" href={`${basePath}/${invoice.id}`} aria-label={`View ${singularTitle}`} title="View"><Eye className="h-4 w-4" /></Link>
                    <Link className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" href={`${basePath}/${invoice.id}/edit`} aria-label={`Edit ${singularTitle}`} title="Edit"><Pencil className="h-4 w-4" /></Link>
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
              <h1 className="text-2xl font-semibold tracking-tight">{singularTitle} Details</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <Link className="hover:text-neutral-900" href="/dashboard">Dashboard</Link>
                <span>/</span>
                <Link className="hover:text-neutral-900" href={basePath}>{isReturn ? 'Purchase returns' : 'Purchase invoices'}</Link>
                <span>/</span>
                <span>{singularTitle} Details</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href={basePath}>Back</Link>
              {selectedInvoice?.can_approve ? <Button type="button" variant="secondary" disabled={saving} onClick={() => requestApproval(Number(selectedInvoice.id))}>Approve</Button> : null}
              {invoiceId ? <Link className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" href={`${basePath}/${invoiceId}/edit`} aria-label={`Edit ${singularTitle}`} title="Edit"><Pencil className="h-4 w-4" /></Link> : null}
            </div>
          </div>
          {selectedInvoice ? <PurchaseInvoiceDetails invoice={selectedInvoice} kind={kind} /> : <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading invoice...</div>}
        </section>
      ) : null}
      {mode !== 'details' && mode !== 'index' ? <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50" href={basePath}>
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </Link>
            <Button type="button" variant="secondary" className="border-slate-200 text-slate-800 shadow-sm" disabled={saving} onClick={resetForm}>
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{editingId ? `Edit ${singularTitle}` : singularTitle}</h1>
          <p className="mt-2 text-base text-slate-500">{editingId ? 'Update fields and line items' : isReturn ? 'Return purchased stock to a supplier' : 'Receive purchased stock with optional cash payment'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="border-slate-200 text-slate-800 shadow-sm" disabled={loading} onClick={() => void loadOptions()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="submit" className="bg-emerald-600 px-5 shadow-sm hover:bg-emerald-700" disabled={saving || loading}>
            <FileText className="h-4 w-4" />
            {saving ? 'Saving...' : editingId ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </div>
      </div>

      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-semibold text-slate-950">Invoice</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Reference No"><Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} /></Field>
          <Field label={dateLabel.replace('date', 'Date')}><Input type="date" value={form.purchaseDate} onChange={(event) => setValue('purchaseDate', event.target.value)} /></Field>
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
          {!isReturn ? <Field label="Purchase Status"><Select value={form.purchaseStatusId} onValueChange={setPurchaseStatus} options={purchaseStatuses.map((status) => ({ value: String(status.id), label: status.label }))} /></Field> : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Box className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-semibold text-slate-950">Products</h2>
          </div>
          <Button type="button" variant="secondary" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </div>
        <div className="grid gap-3">
          {lines.map((line, index) => {
            const product = products.find((item) => String(item.id) === line.productId);
            const lineRequiresBatch = isBatchProduct(product);
            const lineHasVariant = isVariantProduct(product);

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
                    onClick={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.key !== line.key))}
                  />
                </div>
                <div className="grid gap-3 xl:grid-cols-12">
                  <div className={lineHasVariant ? 'xl:col-span-2' : 'xl:col-span-3'}>
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
                  </div>
                  {lineHasVariant || hasVariantLine ? (
                    <div className="xl:col-span-2">
                      <Field label="Variant">
                        {lineHasVariant ? <Select value={line.variantId} onValueChange={(value) => selectVariant(line.key, value)} options={variantSelectOptions(product)} /> : <div className="h-10" />}
                      </Field>
                    </div>
                  ) : null}
                  <div className="xl:col-span-1">
                    <Field label="Qty"><Input type="number" step="0.01" min="0" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} /></Field>
                  </div>
                  {showReceived ? (
                    <div className="xl:col-span-1">
                      <Field label="Received"><Input type="number" step="0.01" min="0" value={line.received} onChange={(event) => updateLine(line.key, 'received', event.target.value)} /></Field>
                    </div>
                  ) : null}
                  <div className="xl:col-span-2">
                    <Field label="Unit">
                      {product ? <Select value={line.unitId} onValueChange={(value) => selectLineUnit(line.key, value)} options={unitSelectOptions(productOptionsForFamily(product, units))} /> : <div className="h-10" />}
                    </Field>
                  </div>
                  {hasBatchLine ? (
                    <>
                      <div className="xl:col-span-2">
                        <Field label="Batch No">{lineRequiresBatch ? <Input required value={line.batchNo} onChange={(event) => updateLine(line.key, 'batchNo', event.target.value)} /> : <div className="h-10" />}</Field>
                      </div>
                      <div className="xl:col-span-2">
                        <Field label="Expiry">{lineRequiresBatch ? <Input required type="date" value={line.expiredDate} onChange={(event) => updateLine(line.key, 'expiredDate', event.target.value)} /> : <div className="h-10" />}</Field>
                      </div>
                    </>
                  ) : null}
                  <div className={hasBatchLine || showReceived || lineHasVariant ? 'xl:col-span-1' : 'xl:col-span-2'}>
                    <Field label="Unit Cost (৳)"><Input type="number" step="0.01" min="0" value={line.cost} onChange={(event) => updateLine(line.key, 'cost', event.target.value)} /></Field>
                  </div>
                  <div className={hasBatchLine || showReceived || lineHasVariant ? 'xl:col-span-1' : 'xl:col-span-2'}>
                    <Field label="Discount (৳)"><Input type="number" step="0.01" min="0" value={line.discount} onChange={(event) => updateLine(line.key, 'discount', event.target.value)} /></Field>
                  </div>
                  <div className="xl:col-span-1">
                    <Field label="Tax %"><Input type="number" step="0.01" min="0" value={line.taxRate} onChange={(event) => updateLine(line.key, 'taxRate', event.target.value)} /></Field>
                  </div>
                  <div className="xl:col-span-1">
                    <Field label="Line Total (৳)">
                      <Input value={money(calculateLine(line, form.purchaseStatusId).subtotal)} readOnly className="bg-slate-100 font-semibold text-slate-700" />
                    </Field>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!isReturn ? <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-semibold text-slate-950">Adjustments and Payment</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Order Tax %"><Input type="number" step="0.01" min="0" value={form.orderTaxRate} onChange={(event) => setValue('orderTaxRate', event.target.value)} /></Field>
          <Field label="Order Discount"><Input type="number" step="0.01" min="0" value={form.orderDiscount} onChange={(event) => setValue('orderDiscount', event.target.value)} /></Field>
          <Field label="Shipping Cost"><Input type="number" step="0.01" min="0" value={form.shippingCost} onChange={(event) => setValue('shippingCost', event.target.value)} /></Field>
          <Field label="Payment Status"><Select value={form.paymentMode} onValueChange={(value) => setValue('paymentMode', value as PaymentMode)} options={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial cash' },
            { value: 'paid', label: 'Paid cash' },
          ]} /></Field>
          {form.paymentMode === 'partial' ? <Field label="Paid Amount"><Input type="number" step="0.01" min="0" value={form.paidAmount} onChange={(event) => setValue('paidAmount', event.target.value)} /></Field> : null}
          <Field label="Payment Note"><Input placeholder="Payment note (optional)" value={form.paymentNote} onChange={(event) => setValue('paymentNote', event.target.value)} /></Field>
        </div>
      </section> : (
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-semibold text-slate-950">Adjustment</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Order Tax %"><Input type="number" step="0.01" min="0" value={form.orderTaxRate} onChange={(event) => setValue('orderTaxRate', event.target.value)} /></Field>
        </div>
      </section>
      )}

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-semibold text-slate-950">Notes</h2>
        </div>
        <Field label={isReturn ? 'Return Note' : 'Purchase Note'}><Textarea placeholder={isReturn ? 'Add return note (optional)' : 'Add purchase note (optional)'} value={form.note} onChange={(event) => setValue('note', event.target.value)} /></Field>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 divide-slate-200 text-sm sm:grid-cols-5 sm:divide-x">
          <Summary label="Total qty" value={money(totals.totalQty)} />
          <Summary label="Items subtotal" value={money(totals.totalCost)} />
          <Summary label="Discount" value={money(totals.totalDiscount)} />
          <Summary label="Order tax" value={money(totals.orderTax)} />
          <Summary label="Grand total" value={money(totals.grandTotal)} strong />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" className="bg-emerald-600 px-6 shadow-sm hover:bg-emerald-700" disabled={saving || loading}>
          <FileText className="h-4 w-4" />
          {saving ? 'Saving...' : editingId ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
      </> : null}
      <Modal title="Approve Invoice" open={approvalTarget !== null} onOpenChange={(open) => !open && setApprovalTarget(null)}>
        <div className="grid gap-4">
          <p className="text-sm text-neutral-700">Approve this {singularTitle.toLowerCase()}? This will apply its inventory and financial effects.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setApprovalTarget(null)}>Cancel</Button><Button type="button" disabled={saving} onClick={() => { if (approvalTarget !== null) void approveInvoice(approvalTarget).finally(() => setApprovalTarget(null)); }}>{saving ? 'Approving...' : 'Approve invoice'}</Button></div>
        </div>
      </Modal>
    </form>
  );
}

function PurchaseInvoiceDetails({ invoice, kind }: { invoice: Record<string, any>; kind: PurchasePageKind }) {
  const isReturn = kind === 'return';
  const lines = (invoice.products ?? []) as Record<string, any>[];
  const subtotal = numberValue(invoice.total_cost ?? invoice.total_price);
  const orderDiscount = numberValue(invoice.order_discount);
  const orderTax = numberValue(invoice.order_tax);
  const shippingCost = numberValue(invoice.shipping_cost);
  const grandTotal = numberValue(invoice.grand_total);
  const paidAmount = numberValue(invoice.paid_amount);
  const dueAmount = numberValue(invoice.due_amount);
  const payment = invoice.payments?.[0] ?? null;
  const invoiceDate = String(invoice.return_date ?? invoice.purchase_date ?? dateOnly(invoice.created_at) ?? '-');
  const invoiceTime = timeOnly(invoice.created_at);
  const note = String(invoice.return_note ?? invoice.purchase_note ?? invoice.note ?? '-');

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid gap-6 border-b border-neutral-200 p-5 md:grid-cols-5">
          <DetailHeader label="Invoice No." value={String(invoice.reference_no ?? '-')} accent>
            <span className={clsx('mt-2 inline-flex w-fit rounded px-2 py-1 text-xs font-semibold', invoice.approval_status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-600 text-white')}>
              {String(invoice.approval_status ?? 'approved')}
            </span>
          </DetailHeader>
          <DetailHeader label={isReturn ? 'Return Date' : 'Purchase Date'} value={invoiceDate}>
            {invoiceTime ? <span className="mt-1 block text-sm text-neutral-500">{invoiceTime}</span> : null}
          </DetailHeader>
          <DetailHeader label="Supplier" value={String(invoice.supplier?.name ?? '-')} accent>
            {invoice.supplier?.phone_number ? <span className="mt-1 block text-sm text-blue-600">{invoice.supplier.phone_number}</span> : null}
          </DetailHeader>
          <DetailHeader label="Warehouse" value={String(invoice.warehouse?.name ?? '-')} accent />
          <DetailHeader label={isReturn ? 'Created By' : 'Purchase Status'} value={String(isReturn ? invoice.user?.name ?? '-' : invoice.purchase_status?.label ?? invoice.status ?? '-')} />
        </div>

        <div className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-950">{isReturn ? 'Purchase Return Items' : 'Purchase Items'}</h2>
          <div className="overflow-x-auto rounded-md border border-neutral-200">
            <table className="min-w-[1040px] w-full border-collapse text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-950">
                <tr className="[&>th]:border-r [&>th]:border-neutral-200 last:[&>th]:border-r-0">
                  <th className="w-12 px-3 py-3 font-semibold">SL</th>
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Variant</th>
                  <th className="px-3 py-3 font-semibold">SKU / Code</th>
                  <th className="px-3 py-3 font-semibold">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold">Quantity</th>
                  {!isReturn ? <th className="px-3 py-3 text-right font-semibold">Received</th> : null}
                  <th className="px-3 py-3 text-right font-semibold">Unit Cost</th>
                  <th className="px-3 py-3 text-right font-semibold">Discount</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {lines.map((line, index) => (
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
                    {!isReturn ? <td className="px-3 py-3 text-right">{money(numberValue(line.received))}</td> : null}
                    <td className="px-3 py-3 text-right">{money(numberValue(line.net_unit_cost ?? line.net_unit_price ?? line.cost))}</td>
                    <td className="px-3 py-3 text-right">{money(numberValue(line.discount))}</td>
                    <td className="px-3 py-3 text-right font-semibold">{money(numberValue(line.total))}</td>
                  </tr>
                ))}
                {!lines.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={isReturn ? 9 : 10}>No products found</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_1.05fr]">
          <div className="grid content-start gap-3">
            <InfoPanel title="Payment Information">
              <InfoRow label="Payment Method" value={paymentMethodLabel(payment?.paying_method)} />
              <InfoRow label="Paid Amount" value={isReturn ? '-' : money(paidAmount)} />
              <InfoRow label="Due Amount" value={isReturn ? '-' : money(dueAmount)} highlight={!isReturn && dueAmount > 0} />
              <InfoRow label="Payment Note" value={String(payment?.payment_note ?? '-')} />
            </InfoPanel>

            <InfoPanel title="Additional Information">
              <InfoRow label="Reference" value={String(invoice.reference_no ?? '-')} />
              <InfoRow label="Note" value={note} />
              <InfoRow label="Approval" value={String(invoice.approval_status ?? 'approved')} badge />
              {invoice.approver?.name ? <InfoRow label="Approved By" value={String(invoice.approver.name)} /> : null}
            </InfoPanel>
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <TotalRow label="Subtotal" value={money(subtotal)} />
            <TotalRow label="Discount" value={money(orderDiscount)} />
            <TotalRow label={`VAT (${money(numberValue(invoice.order_tax_rate))}%)`} value={money(orderTax)} />
            {!isReturn && shippingCost > 0 ? <TotalRow label="Shipping Cost" value={money(shippingCost)} /> : null}
            <TotalRow label="Grand Total" value={money(grandTotal)} primary />
            {!isReturn ? <TotalRow label="Paid Amount" value={money(paidAmount)} /> : null}
            {!isReturn ? <TotalRow label="Due Amount" value={money(dueAmount)} danger={dueAmount > 0} /> : null}
          </div>
        </div>
      </div>
      <ActivityLogTimeline logs={invoice.activity_logs ?? []} />
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

function InfoRow({ label, value, badge = false, highlight = false }: { label: string; value: string; badge?: boolean; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(120px,0.75fr)_1fr] items-center gap-3 text-sm">
      <div className="text-neutral-700">{label}</div>
      <div className="font-medium text-neutral-950">
        {badge ? (
          <span className={clsx('inline-flex w-fit rounded px-2 py-1 text-xs font-semibold', highlight ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-700')}>
            {value}
          </span>
        ) : (
          <span className={highlight ? 'text-amber-700' : undefined}>{value}</span>
        )}
      </div>
    </div>
  );
}

function TotalRow({ label, value, primary = false, danger = false }: { label: string; value: string; primary?: boolean; danger?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 text-sm last:border-b-0', primary && 'bg-blue-50 text-blue-700', danger && 'bg-red-50 text-red-700')}>
      <span className={clsx((primary || danger) && 'text-base font-semibold')}>{label}</span>
      <span className={clsx('font-semibold', primary && 'text-xl', danger && 'text-lg')}>{value}</span>
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

function PurchaseStatusBadge({ status }: { status: unknown }) {
  const normalized = String(status ?? '').toLowerCase();
  const className = normalized.includes('received')
    ? 'bg-emerald-100 text-emerald-800'
    : normalized.includes('partial')
      ? 'bg-sky-100 text-sky-800'
      : normalized.includes('pending')
        ? 'bg-amber-100 text-amber-800'
        : 'bg-neutral-100 text-neutral-700';

  return (
    <span className={clsx('inline-flex rounded-full px-2 py-1 text-xs font-medium', className)}>
      {String(status ?? '-')}
    </span>
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
    <div className="px-3 py-1">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className={strong ? 'mt-1 text-2xl font-bold text-emerald-600' : 'mt-1 text-lg font-semibold text-slate-950'}>{value}</div>
    </div>
  );
}

function buildPayload(form: FormState, lines: InvoiceLine[], products: Product[], totals: ReturnType<typeof calculateTotals>, kind: PurchasePageKind): PurchaseInvoicePayload | PurchaseReturnPayload | null {
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
  if (statusId === PURCHASE_STATUS_PARTIAL && invoiceLines.some((item) => item.values.received < 0 || item.values.received >= item.values.qty)) {
    toast.error('Invalid received quantity', { description: 'For partial purchases, received quantity must be less than ordered quantity.' });
    return null;
  }
  if (invoiceLines.some((item) => isBatchProduct(item.product) && (!item.line.batchNo.trim() || (kind === 'purchase' && !item.line.expiredDate)))) {
    toast.error('Missing batch details', { description: kind === 'return' ? 'Batch no is required for batch products.' : 'Batch no and expiry date are required for batch products.' });
    return null;
  }
  if (invoiceLines.some((item) => isVariantProduct(item.product) && !productVariantById(item.product, nullableId(item.line.variantId)))) {
    toast.error('Missing variant', { description: 'Variant is required for variant products.' });
    return null;
  }

  const common = {
    reference_no: form.referenceNo.trim(),
    supplier_id: Number(form.supplierId),
    warehouse_id: Number(form.warehouseId),
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
    note: nullableText(form.note),
  };

  if (kind === 'return') {
    return {
      ...common,
      return_date: form.purchaseDate,
      return_note: nullableText(form.note),
    };
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);
  return {
    ...common,
    purchase_date: form.purchaseDate,
    status: statusId,
    purchase_status_id: statusId,
    payment_status: paymentStatus(form.paymentMode),
    order_discount: numberValue(form.orderDiscount),
    shipping_cost: numberValue(form.shippingCost),
    paid_by_id: form.paymentMode === 'unpaid' ? null : 1,
    paying_amount: paidAmount,
    paid_amount: paidAmount,
    payment_note: nullableText(form.paymentNote),
  };
}

function calculateTotals(lines: InvoiceLine[], form: FormState) {
  const lineTotals = lines.map((line) => calculateLine(line, form.purchaseStatusId));
  const totalQty = round2(lineTotals.reduce((sum, line) => sum + line.qty, 0));
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
  return statusId === PURCHASE_STATUS_RECEIVED;
}

function isUnreceivedStatus(statusId: number) {
  return statusId === PURCHASE_STATUS_PENDING;
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

function detailLineUnit(line: Record<string, any>) {
  if (!line.unit) return '-';
  const unitName = line.unit.unit_name ?? line.unit.name;
  const unitCode = line.unit.unit_code ?? line.unit.code;
  return unitCode && unitName ? `${unitName} (${unitCode})` : String(unitName ?? unitCode ?? '-');
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

async function validateBatchLines(lines: PurchaseInvoicePayload['lines'] | PurchaseReturnPayload['lines'], products: Product[], warehouseId: number) {
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
