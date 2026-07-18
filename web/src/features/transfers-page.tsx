'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowLeftRight, CalendarDays, CheckCircle2, Eye, FileText, Package, Pencil, Plus, Search, SlidersHorizontal, Truck, Trash2 } from 'lucide-react';
import { api, type StockTransferPayload } from '@/lib/api';
import type { PaginationMeta, Product, StockTransfer, StockTransferLine, Unit, User, Warehouse } from '@/lib/types';
import { clsx, errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActivityLogTimeline } from '@/components/activity-log';
import { EmptyState, Pagination, TableWrap } from '@/components/resource-shell';
import { ActionButton, Button, Field, Input, Modal, Select } from '@/components/ui';

type PageMode = 'index' | 'create' | 'details' | 'edit';
type StatusFilter = 'all' | 'pending' | 'completed';

type TransferLineForm = {
  key: string;
  productId: string;
  variantId: string;
  batchId: string;
  unitId: string;
  qty: string;
  cost: string;
  taxRate: string;
  note: string;
};

type TransferForm = {
  referenceNo: string;
  transferDate: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: 'pending' | 'completed';
  expectedDeliveryDate: string;
  requestedBy: string;
  note: string;
  vehicleCourier: string;
  driverContact: string;
  document: File | null;
};

const defaultPerPage = 10;

const emptyLine = (): TransferLineForm => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: 'none',
  variantId: 'none',
  batchId: 'none',
  unitId: 'none',
  qty: '1',
  cost: '0',
  taxRate: '0',
  note: '',
});

const emptyForm = (): TransferForm => ({
  referenceNo: generateReference(),
  transferDate: todayDate(),
  fromWarehouseId: 'none',
  toWarehouseId: 'none',
  status: 'pending',
  expectedDeliveryDate: '',
  requestedBy: 'none',
  note: '',
  vehicleCourier: '',
  driverContact: '',
  document: null,
});

export function TransfersPage({ mode = 'index', transferId }: { mode?: PageMode; transferId?: number }) {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState('all');
  const [toWarehouseFilter, setToWarehouseFilter] = useState('all');
  const [dateRangeLabel, setDateRangeLabel] = useState('01/06/2025 - 14/07/2025');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [completeTarget, setCompleteTarget] = useState<StockTransfer | null>(null);
  const [form, setForm] = useState<TransferForm>(emptyForm);
  const [lines, setLines] = useState<TransferLineForm[]>([emptyLine()]);

  const canAdd = hasPermission('transfers-add');
  const canEdit = hasPermission('transfers-edit');
  const canComplete = hasPermission('transfers-edit');
  const canDelete = hasPermission('transfers-delete');
  const totals = useMemo(() => calculateTotals(lines), [lines]);
  const listSummary = useMemo(() => calculateListSummary(transfers, pagination), [pagination, transfers]);
  const selectedFromWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.fromWarehouseId);
  const selectedToWarehouse = warehouses.find((warehouse) => String(warehouse.id) === form.toWarehouseId);
  const requestedUser = users.find((item) => String(item.id) === form.requestedBy) ?? user;

  const loadOptions = useCallback(async () => {
    try {
      const [warehouseResponse, productResponse, productOptionsResponse, userOptionsResponse] = await Promise.all([
        api.warehouses({ perPage: 100, activeOnly: true }),
        api.products({ perPage: 100 }),
        api.productOptions(),
        api.userOptions(),
      ]);
      const nextWarehouses = warehouseResponse.data as Warehouse[];
      const nextProducts = (productResponse.data as Product[]).filter((product) => product.type !== 'digital');
      const productOptions = productOptionsResponse.data as { units?: Unit[] };
      const userOptions = userOptionsResponse.data as { users?: User[] };

      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setUnits(productOptions.units ?? []);
      setUsers(userOptions.users ?? []);
      setForm((current) => ({
        ...current,
        fromWarehouseId: current.fromWarehouseId === 'none' ? idValue(nextWarehouses[0]?.id) : current.fromWarehouseId,
        toWarehouseId: current.toWarehouseId === 'none' ? idValue(nextWarehouses[1]?.id ?? nextWarehouses[0]?.id) : current.toWarehouseId,
        requestedBy: current.requestedBy === 'none' ? idValue(user?.id ?? userOptions.users?.[0]?.id) : current.requestedBy,
      }));
    } catch (error) {
      toast.error('Options failed', { description: errorMessage(error) });
    }
  }, [user?.id]);

  const loadTransfers = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.transfers({
        page: nextPage,
        perPage,
        search: debouncedSearch,
        status: statusFilter,
        fromWarehouseId: fromWarehouseFilter === 'all' ? null : Number(fromWarehouseFilter),
        toWarehouseId: toWarehouseFilter === 'all' ? null : Number(toWarehouseFilter),
      });
      setTransfers(response.data);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Transfer list failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, fromWarehouseFilter, page, perPage, statusFilter, toWarehouseFilter]);

  const loadTransfer = useCallback(async (id: number, editing = false) => {
    setLoading(true);
    try {
      const response = await api.transfer(id);
      setSelectedTransfer(response.data);
      if (editing) {
        setForm(formFromTransfer(response.data));
        setLines(linesFromTransfer(response.data));
      }
    } catch (error) {
      toast.error('Transfer load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'index' && !hasPermission('transfers-index')) router.replace('/dashboard');
    if (mode === 'create' && !hasPermission('transfers-add')) router.replace('/dashboard');
    if (mode === 'edit' && !hasPermission('transfers-edit')) router.replace('/dashboard');
  }, [hasPermission, mode, router]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (mode === 'index') void loadTransfers(page);
  }, [loadTransfers, mode, page]);

  useEffect(() => {
    if (!transferId || mode === 'index' || mode === 'create') return;
    void loadTransfer(transferId, mode === 'edit');
  }, [loadTransfer, mode, transferId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  function setValue<K extends keyof TransferForm>(key: K, value: TransferForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine<K extends keyof TransferLineForm>(key: string, field: K, value: TransferLineForm[K]) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const nextLine = { ...line, [field]: value };
        if (field === 'productId') {
          const product = products.find((item) => String(item.id) === value);
          nextLine.unitId = idValue(product?.purchase_unit_id ?? product?.unit_id);
          nextLine.cost = String(numberValue(product?.cost));
          nextLine.variantId = 'none';
          nextLine.batchId = 'none';
        }
        return nextLine;
      })
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload(form, lines, products);
    if (!payload) return;

    setSaving(true);
    try {
      if (mode === 'edit' && transferId) await api.updateTransfer(transferId, payload);
      else await api.createTransfer(payload);
      toast.success(mode === 'edit' ? 'Transfer updated' : 'Transfer created');
      router.push('/transfers');
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransfer(transfer: StockTransfer) {
    if (!window.confirm(`Delete transfer ${transfer.reference_no}?`)) return;
    try {
      await api.deleteTransfer(transfer.id);
      toast.success('Transfer deleted');
      await loadTransfers(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    }
  }

  async function completeTransfer() {
    if (!completeTarget) return;

    setSaving(true);
    try {
      const response = await api.transfer(completeTarget.id);
      await api.updateTransfer(completeTarget.id, payloadFromTransfer(response.data, 'completed'));
      toast.success('Transfer completed');
      setCompleteTarget(null);
      await loadTransfers(page);
    } catch (error) {
      toast.error('Complete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'details') {
    return (
      <div>
        <BackHeader title="Transfer Details" href="/transfers" />
        {!selectedTransfer ? (
          <EmptyState label={loading ? 'Loading transfer...' : 'Transfer not found'} />
        ) : (
          <TransferDetails transfer={selectedTransfer} canEdit={canEdit} />
        )}
      </div>
    );
  }

  if (mode === 'create' || mode === 'edit') {
    return (
      <form onSubmit={submit}>
        <BackHeader title={mode === 'edit' ? 'Edit Stock Transfer' : 'New Stock Transfer'} href="/transfers" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <h2 className="mb-4 text-base font-semibold text-emerald-700">1. Transfer Information</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Transfer Date">
                  <Input type="date" value={form.transferDate} onChange={(event) => setValue('transferDate', event.target.value)} />
                </Field>
                <Field label="Reference No">
                  <Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} required />
                </Field>
                <Field label="From Warehouse">
                  <Select value={form.fromWarehouseId} onValueChange={(value) => setValue('fromWarehouseId', value)} options={warehouseOptions(warehouses)} />
                </Field>
                <Field label="To Warehouse">
                  <Select value={form.toWarehouseId} onValueChange={(value) => setValue('toWarehouseId', value)} options={warehouseOptions(warehouses)} />
                </Field>
                <Field label="Transfer Status">
                  <Select value={form.status} onValueChange={(value) => setValue('status', value as TransferForm['status'])} options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'completed', label: 'Completed' },
                  ]} />
                </Field>
                <Field label="Expected Delivery">
                  <Input type="date" value={form.expectedDeliveryDate} onChange={(event) => setValue('expectedDeliveryDate', event.target.value)} />
                </Field>
                <Field label="Requested By">
                  <Select value={form.requestedBy} onValueChange={(value) => setValue('requestedBy', value)} options={userOptions(users, user)} />
                </Field>
                <Field label="Transfer Note">
                  <Input value={form.note} onChange={(event) => setValue('note', event.target.value)} placeholder="Optional note" />
                </Field>
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-emerald-700">2. Transfer Items</h2>
                <Button type="button" variant="secondary" onClick={addLine}>
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>
              <TableWrap>
                <table className="min-w-[980px] divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                    <tr>
                      {['Product', 'Variant', 'Batch', 'Available', 'Qty', 'Unit', 'Note', ''].map((header) => <th key={header} className="px-3 py-3 font-medium">{header}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {lines.map((line) => {
                      const product = products.find((item) => String(item.id) === line.productId);
                      const available = availableStock(product, form.fromWarehouseId, line.variantId, line.batchId);
                      return (
                        <tr key={line.key}>
                          <td className="px-3 py-3">
                            <Select value={line.productId} onValueChange={(value) => updateLine(line.key, 'productId', value)} options={productOptions(products)} />
                          </td>
                          <td className="px-3 py-3">
                            <Select value={line.variantId} onValueChange={(value) => updateLine(line.key, 'variantId', value)} disabled={!isVariantProduct(product)} options={variantOptions(product)} />
                          </td>
                          <td className="px-3 py-3">
                            <Select value={line.batchId} onValueChange={(value) => updateLine(line.key, 'batchId', value)} disabled={!isBatchProduct(product)} options={batchOptions(product, form.fromWarehouseId, line.variantId)} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="font-medium">{formatNumber(available)}</div>
                            <div className={clsx('text-xs', available > 0 ? 'text-emerald-600' : 'text-red-600')}>{available > 0 ? 'In stock' : 'No stock'}</div>
                          </td>
                          <td className="px-3 py-3">
                            <Input className="w-24" type="number" min="0.01" step="0.01" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} />
                          </td>
                          <td className="px-3 py-3">
                            <Select value={line.unitId} onValueChange={(value) => updateLine(line.key, 'unitId', value)} options={unitOptions(units)} />
                          </td>
                          <td className="px-3 py-3">
                            <Input value={line.note} onChange={(event) => updateLine(line.key, 'note', event.target.value)} placeholder="Line note" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button type="button" variant="danger" className="h-9 w-9 px-0" disabled={lines.length === 1} onClick={() => removeLine(line.key)} aria-label="Remove item">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <h2 className="mb-4 text-base font-semibold text-emerald-700">3. Additional Details</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Vehicle / Courier">
                  <Input value={form.vehicleCourier} onChange={(event) => setValue('vehicleCourier', event.target.value)} placeholder="Delivery vehicle" />
                </Field>
                <Field label="Driver / Contact">
                  <Input value={form.driverContact} onChange={(event) => setValue('driverContact', event.target.value)} placeholder="Contact number" />
                </Field>
                <Field label="Attachment">
                  <Input type="file" onChange={(event) => setValue('document', event.target.files?.[0] ?? null)} />
                </Field>
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-4 text-base font-semibold text-emerald-700">Transfer Summary</h2>
            <SummaryRow label="From" value={selectedFromWarehouse?.name ?? '-'} />
            <SummaryRow label="To" value={selectedToWarehouse?.name ?? '-'} />
            <SummaryRow label="Total Items" value={String(totals.items)} />
            <SummaryRow label="Quantity Summary" value={formQuantitySummary(lines, units)} />
            <SummaryRow label="Estimated Value" value={formatCurrency(totals.value)} />
            <SummaryRow label="Status" value={form.status === 'completed' ? 'Completed' : 'Pending'} />
            <SummaryRow label="Initiated By" value={requestedUser?.name ?? '-'} />
            <div className="mt-5 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              Stock is deducted from the source warehouse only when the transfer status is completed.
            </div>
          </aside>
        </div>
        <div className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t border-neutral-200 bg-neutral-50 py-4">
          <Button type="button" variant="secondary" onClick={() => router.push('/transfers')}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            <FileText className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Transfer'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Transfers</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage product movement between branches and warehouses</p>
        </div>
        {canAdd ? (
          <Button
            type="button"
            className="h-11 bg-emerald-700 px-5 shadow-sm hover:bg-emerald-800"
            onClick={() => router.push('/transfers/create')}
          >
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ArrowLeftRight}
          iconClassName="bg-emerald-100 text-emerald-700"
          title="Total Transfers"
          value={formatNumber(listSummary.totalTransfers)}
          caption="All time transfers"
          accentClassName="text-emerald-600"
        />
        <MetricCard
          icon={Truck}
          iconClassName="bg-orange-100 text-orange-600"
          title="Pending"
          value={formatNumber(listSummary.pendingCount)}
          caption="Currently pending"
          accentClassName="text-orange-500"
        />
        <MetricCard
          icon={CheckCircle2}
          iconClassName="bg-blue-100 text-blue-600"
          title="Complete"
          value={formatNumber(listSummary.completedCount)}
          caption="Successfully completed"
          accentClassName="text-blue-600"
        />
        <MetricCard
          icon={Package}
          iconClassName="bg-violet-100 text-violet-600"
          title="Product Lines Moved"
          value={formatNumber(listSummary.productLinesMoved)}
          caption="Across loaded transfers"
          accentClassName="text-violet-600"
        />
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1.45fr_1fr_1fr_.85fr_auto] lg:items-end">
          <Field label="Date Range">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
              <Input value={dateRangeLabel} onChange={(event) => setDateRangeLabel(event.target.value)} className="pl-9" />
            </div>
          </Field>
          <Field label="Search by transfer no / product / note">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="pl-9" />
            </div>
          </Field>
          <Field label="From Warehouse">
            <Select value={fromWarehouseFilter} onValueChange={(value) => { setFromWarehouseFilter(value); setPage(1); }} options={warehouseFilterOptions(warehouses)} />
          </Field>
          <Field label="To Warehouse">
            <Select value={toWarehouseFilter} onValueChange={(value) => { setToWarehouseFilter(value); setPage(1); }} options={warehouseFilterOptions(warehouses)} />
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }} options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Complete' },
            ]} />
          </Field>
          <Button type="button" variant="secondary" className="h-10 border-emerald-200 px-4 text-emerald-700 hover:bg-emerald-50" onClick={() => void loadTransfers(1)} disabled={loading}>
            <SlidersHorizontal className="h-4 w-4" />
            More Filters
          </Button>
        </div>
      </section>

      {transfers.length ? (
        <>
          <TableWrap loading={loading}>
            <table className="min-w-[1180px] divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-900">
                <tr>
                  {['Date', 'Transfer No', 'From Warehouse', 'To Warehouse', 'Items', 'Quantity', 'Status', 'Initiated By', 'Notes', 'Actions'].map((header) => (
                    <th key={header} className="px-4 py-3 font-semibold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-neutral-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                      <div>{formatDate(transfer.transfer_date)}</div>
                      <div className="text-xs text-neutral-500">{formatTime(transfer.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{transfer.reference_no}</td>
                    <td className="px-4 py-3">{transfer.from_warehouse?.name ?? '-'}</td>
                    <td className="px-4 py-3">{transfer.to_warehouse?.name ?? '-'}</td>
                    <td className="px-4 py-3">{transfer.item}</td>
                    <td className="px-4 py-3">{transferQuantitySummary(transfer)}</td>
                    <td className="px-4 py-3"><StatusBadge status={transfer.status_key} /></td>
                    <td className="px-4 py-3">{transfer.requested_user?.name ?? transfer.user?.name ?? '-'}</td>
                    <td className="max-w-56 truncate px-4 py-3" title={transfer.note ?? undefined}>{transfer.note || transferLineNames(transfer) || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ActionButton href={`/transfers/${transfer.id}`} icon={Eye} text="View" color="text-emerald-700" bgColor="border border-emerald-200 bg-emerald-50 hover:bg-emerald-100" />
                        {transfer.status_key === 'pending' && canComplete ? <ActionButton icon={CheckCircle2} text="Complete" color="text-blue-700" bgColor="border border-blue-200 bg-blue-50 hover:bg-blue-100" onClick={() => setCompleteTarget(transfer)} /> : null}
                        {canEdit ? <ActionButton href={`/transfers/${transfer.id}/edit`} icon={Pencil} text="Edit" color="text-emerald-700" bgColor="border border-emerald-200 bg-emerald-50 hover:bg-emerald-100" /> : null}
                        {canDelete ? <ActionButton icon={Trash2} text="Delete" color="text-red-700" bgColor="border border-red-200 bg-red-50 hover:bg-red-100" onClick={() => void deleteTransfer(transfer)} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-center">
              <FooterMetric icon={CalendarDays} label="Pending Transfers" value={formatNumber(listSummary.pendingCount)} tone="orange" />
              <FooterMetric icon={Truck} label="Completed Transfers" value={formatNumber(listSummary.completedCount)} tone="blue" />
              <FooterMetric icon={CheckCircle2} label="Total Product Lines" value={formatNumber(listSummary.productLinesMoved)} tone="green" />
              <Pagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>
          </div>
        </>
      ) : (
        <EmptyState label={loading ? 'Loading transfers...' : 'No transfers found.'} />
      )}
      <Modal title="Complete Stock Transfer" open={completeTarget !== null} onOpenChange={(open) => !open && setCompleteTarget(null)} contentClassName="max-w-md">
        <div className="space-y-5">
          <p className="text-sm text-neutral-600">
            Complete transfer <span className="font-semibold text-neutral-900">{completeTarget?.reference_no}</span>? Stock will be deducted from the source warehouse and added to the destination warehouse.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void completeTransfer()}>
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Completing...' : 'Complete Transfer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TransferDetails({ transfer, canEdit }: { transfer: StockTransfer; canEdit: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{transfer.reference_no}</h1>
              <p className="mt-1 text-sm text-neutral-500">{transfer.transfer_date ?? '-'} · {transfer.from_warehouse?.name ?? '-'} to {transfer.to_warehouse?.name ?? '-'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={transfer.status_key} />
              {canEdit ? <Button type="button" onClick={() => window.location.assign(`/transfers/${transfer.id}/edit`)}><Pencil className="h-4 w-4" />Edit</Button> : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Info label="Expected Delivery" value={transfer.expected_delivery_date ?? '-'} />
            <Info label="Requested By" value={transfer.requested_user?.name ?? '-'} />
            <Info label="Vehicle / Courier" value={transfer.vehicle_courier ?? '-'} />
            <Info label="Driver / Contact" value={transfer.driver_contact ?? '-'} />
            <Info label="Attachment" value={transfer.document_url ? 'Available' : '-'} href={transfer.document_url ?? undefined} />
            <Info label="Note" value={transfer.note ?? '-'} />
          </div>
        </section>

        <TableWrap>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                {['Product', 'Variant', 'Batch', 'Quantity', 'Value', 'Note'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(transfer.products ?? []).map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{line.product?.name ?? '-'}</div>
                    <div className="text-xs text-neutral-500">{line.product?.code ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">{line.variant?.name ?? '-'}</td>
                  <td className="px-4 py-3">{line.batch?.batch_no ?? '-'}</td>
                  <td className="px-4 py-3">{lineQuantityLabel(line)}</td>
                  <td className="px-4 py-3">{formatCurrency(numberValue(line.total))}</td>
                  <td className="px-4 py-3">{line.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <ActivityLogTimeline logs={transfer.activity_logs ?? []} />
      </div>
      <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-emerald-700">Transfer Summary</h2>
        <SummaryRow label="Total Items" value={String(transfer.item)} />
        <SummaryRow label="Quantity Summary" value={transferQuantitySummary(transfer)} />
        <SummaryRow label="Estimated Value" value={formatCurrency(numberValue(transfer.grand_total))} />
        <SummaryRow label="Status" value={transfer.status_label} />
        <SummaryRow label="Initiated By" value={transfer.user?.name ?? '-'} />
      </aside>
    </div>
  );
}

function BackHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link href={href} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white hover:bg-neutral-50" aria-label="Back">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3 text-sm last:border-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-neutral-400">{label}</div>
      {href ? <a href={href} className="mt-1 block text-sm font-medium text-emerald-700 hover:underline" target="_blank" rel="noreferrer">{value}</a> : <div className="mt-1 text-sm font-medium">{value}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'completed' }) {
  return (
    <span className={clsx(
      'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
      status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
    )}>
      {status === 'completed' ? 'Complete' : 'Pending'}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  iconClassName,
  title,
  value,
  caption,
  accentClassName,
}: {
  icon: typeof ArrowLeftRight;
  iconClassName: string;
  title: string;
  value: string;
  caption: string;
  accentClassName: string;
}) {
  return (
    <article className="flex min-h-32 items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex min-w-0 items-center gap-4">
        <div className={clsx('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', iconClassName)}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-neutral-700">{title}</div>
          <div className={clsx('mt-1 text-3xl font-semibold leading-none', accentClassName)}>{value}</div>
          <div className="mt-2 text-xs text-neutral-500">{caption}</div>
        </div>
      </div>
      <div className={clsx('hidden h-10 w-16 items-end gap-1 sm:flex', accentClassName)} aria-hidden="true">
        {[8, 14, 10, 18, 12, 24].map((height, index) => (
          <span key={index} className="w-1 rounded-full bg-current opacity-80" style={{ height }} />
        ))}
      </div>
    </article>
  );
}

function FooterMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  tone: 'orange' | 'blue' | 'green';
}) {
  const toneClass = {
    orange: 'text-orange-500',
    blue: 'text-blue-600',
    green: 'text-emerald-700',
  }[tone];

  return (
    <div className="flex items-center gap-4">
      <Icon className={clsx('h-8 w-8', toneClass)} />
      <div>
        <div className="text-sm text-neutral-600">{label}</div>
        <div className={clsx('text-xl font-semibold', toneClass)}>{value}</div>
      </div>
    </div>
  );
}

function warehouseOptions(warehouses: Warehouse[]) {
  return [{ value: 'none', label: 'Select warehouse' }, ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))];
}

function warehouseFilterOptions(warehouses: Warehouse[]) {
  return [{ value: 'all', label: 'All Warehouses' }, ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))];
}

function productOptions(products: Product[]) {
  return [{ value: 'none', label: 'Select product' }, ...products.map((product) => ({ value: String(product.id), label: `${product.name} (${product.code})` }))];
}

function unitOptions(units: Unit[]) {
  return [{ value: 'none', label: 'Select unit' }, ...units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))];
}

function userOptions(users: User[], currentUser?: User | null) {
  const byId = new Map<number, User>();
  if (currentUser) byId.set(currentUser.id, currentUser);
  users.forEach((user) => byId.set(user.id, user));
  return [{ value: 'none', label: 'Select user' }, ...[...byId.values()].map((user) => ({ value: String(user.id), label: user.name }))];
}

function variantOptions(product?: Product) {
  if (!isVariantProduct(product)) return [{ value: 'none', label: 'No variant' }];
  return [{ value: 'none', label: 'Select variant' }, ...(product?.variants ?? []).map((variant) => ({ value: String(variant.variant_id), label: variant.name }))];
}

function batchOptions(product: Product | undefined, warehouseId: string, variantId: string) {
  if (!isBatchProduct(product)) return [{ value: 'none', label: 'No batch' }];
  const batches = (product?.warehouse_prices ?? [])
    .filter((stock) => String(stock.warehouse_id) === warehouseId)
    .filter((stock) => variantId === 'none' || String(stock.variant_id ?? 'none') === variantId)
    .filter((stock) => stock.product_batch_id && stock.batch_no)
    .map((stock) => ({ value: String(stock.product_batch_id), label: `${stock.batch_no} (${formatNumber(numberValue(stock.qty))})` }));
  return [{ value: 'none', label: 'Select batch' }, ...batches];
}

function availableStock(product: Product | undefined, warehouseId: string, variantId: string, batchId: string) {
  if (!product || warehouseId === 'none') return 0;
  return (product.warehouse_prices ?? [])
    .filter((stock) => String(stock.warehouse_id) === warehouseId)
    .filter((stock) => variantId === 'none' || String(stock.variant_id ?? 'none') === variantId)
    .filter((stock) => batchId === 'none' || String(stock.product_batch_id ?? 'none') === batchId)
    .reduce((sum, stock) => sum + numberValue(stock.qty), 0);
}

function buildPayload(form: TransferForm, lines: TransferLineForm[], products: Product[]): StockTransferPayload | null {
  const fromWarehouseId = numericId(form.fromWarehouseId);
  const toWarehouseId = numericId(form.toWarehouseId);
  if (!fromWarehouseId || !toWarehouseId) {
    toast.error('Select source and destination warehouses');
    return null;
  }
  if (fromWarehouseId === toWarehouseId) {
    toast.error('Source and destination warehouses must be different');
    return null;
  }

  const payloadLines = lines.map((line) => {
    const product = products.find((item) => String(item.id) === line.productId);
    const productId = numericId(line.productId);
    const unitId = numericId(line.unitId);
    const qty = numberValue(line.qty);
    const cost = numberValue(line.cost);
    const taxRate = numberValue(line.taxRate);
    const tax = ((qty * cost) * taxRate) / 100;
    return {
      product,
      product_id: productId,
      variant_id: numericId(line.variantId),
      product_batch_id: numericId(line.batchId),
      qty,
      purchase_unit: unitId,
      net_unit_cost: cost,
      tax_rate: taxRate,
      tax,
      subtotal: qty * cost + tax,
      line_note: line.note || null,
    };
  });

  for (const [index, line] of payloadLines.entries()) {
    if (!line.product_id || !line.purchase_unit || line.qty <= 0) {
      toast.error(`Complete product, unit, and quantity for row ${index + 1}`);
      return null;
    }
    if (isVariantProduct(line.product) && !line.variant_id) {
      toast.error(`Select a variant for row ${index + 1}`);
      return null;
    }
    if (isBatchProduct(line.product) && !line.product_batch_id) {
      toast.error(`Select a batch for row ${index + 1}`);
      return null;
    }
  }

  return {
    reference_no: form.referenceNo,
    transfer_date: form.transferDate || null,
    from_warehouse_id: fromWarehouseId,
    to_warehouse_id: toWarehouseId,
    status: form.status,
    expected_delivery_date: form.expectedDeliveryDate || null,
    requested_by: numericId(form.requestedBy),
    note: form.note || null,
    vehicle_courier: form.vehicleCourier || null,
    driver_contact: form.driverContact || null,
    document: form.document,
    lines: payloadLines.map((line) => ({
      product_id: line.product_id as number,
      variant_id: line.variant_id,
      product_batch_id: line.product_batch_id,
      qty: line.qty,
      purchase_unit: line.purchase_unit as number,
      net_unit_cost: line.net_unit_cost,
      tax_rate: line.tax_rate,
      tax: line.tax,
      subtotal: line.subtotal,
      line_note: line.line_note,
    })),
  };
}

function payloadFromTransfer(transfer: StockTransfer, status: StockTransferPayload['status']): StockTransferPayload {
  return {
    reference_no: transfer.reference_no,
    transfer_date: transfer.transfer_date ?? null,
    from_warehouse_id: transfer.from_warehouse_id,
    to_warehouse_id: transfer.to_warehouse_id,
    status,
    expected_delivery_date: transfer.expected_delivery_date ?? null,
    requested_by: transfer.requested_by ?? null,
    note: transfer.note ?? null,
    vehicle_courier: transfer.vehicle_courier ?? null,
    driver_contact: transfer.driver_contact ?? null,
    document: null,
    lines: (transfer.products ?? []).map((line) => ({
      product_id: line.product_id,
      variant_id: line.variant_id ?? null,
      product_batch_id: line.product_batch_id ?? null,
      qty: numberValue(line.qty),
      purchase_unit: line.purchase_unit_id,
      net_unit_cost: numberValue(line.net_unit_cost),
      tax_rate: numberValue(line.tax_rate),
      tax: numberValue(line.tax),
      subtotal: numberValue(line.total),
      line_note: line.note ?? null,
    })),
  };
}

function formFromTransfer(transfer: StockTransfer): TransferForm {
  return {
    referenceNo: transfer.reference_no,
    transferDate: transfer.transfer_date ?? todayDate(),
    fromWarehouseId: idValue(transfer.from_warehouse_id),
    toWarehouseId: idValue(transfer.to_warehouse_id),
    status: transfer.status_key,
    expectedDeliveryDate: transfer.expected_delivery_date ?? '',
    requestedBy: idValue(transfer.requested_by),
    note: transfer.note ?? '',
    vehicleCourier: transfer.vehicle_courier ?? '',
    driverContact: transfer.driver_contact ?? '',
    document: null,
  };
}

function linesFromTransfer(transfer: StockTransfer): TransferLineForm[] {
  const transferLines = transfer.products ?? [];
  if (!transferLines.length) return [emptyLine()];
  return transferLines.map((line) => ({
    key: String(line.id),
    productId: idValue(line.product_id),
    variantId: idValue(line.variant_id),
    batchId: idValue(line.product_batch_id),
    unitId: idValue(line.purchase_unit_id),
    qty: String(line.qty ?? 1),
    cost: String(line.net_unit_cost ?? 0),
    taxRate: String(line.tax_rate ?? 0),
    note: line.note ?? '',
  }));
}

function calculateTotals(lines: TransferLineForm[]) {
  return lines.reduce((totals, line) => {
    const qty = numberValue(line.qty);
    const cost = numberValue(line.cost);
    const tax = (qty * cost * numberValue(line.taxRate)) / 100;
    return {
      items: totals.items + (line.productId !== 'none' ? 1 : 0),
      qty: totals.qty + qty,
      value: totals.value + (qty * cost) + tax,
    };
  }, { items: 0, qty: 0, value: 0 });
}

function calculateListSummary(transfers: StockTransfer[], pagination: PaginationMeta | null) {
  return transfers.reduce((summary, transfer) => {
    const isCompleted = transfer.status_key === 'completed';

    return {
      totalTransfers: summary.totalTransfers,
      pendingCount: summary.pendingCount + (isCompleted ? 0 : 1),
      completedCount: summary.completedCount + (isCompleted ? 1 : 0),
      productLinesMoved: summary.productLinesMoved + Number(transfer.item ?? 0),
    };
  }, {
    totalTransfers: pagination?.total ?? transfers.length,
    pendingCount: 0,
    completedCount: 0,
    productLinesMoved: 0,
  });
}

function transferQuantitySummary(transfer: StockTransfer) {
  return unitQuantitySummary((transfer.products ?? []).map((line) => ({
    qty: line.qty,
    unit: unitLabel(line.unit),
  })));
}

function formQuantitySummary(lines: TransferLineForm[], units: Unit[]) {
  return unitQuantitySummary(lines
    .filter((line) => line.productId !== 'none')
    .map((line) => ({
      qty: line.qty,
      unit: unitLabel(units.find((unit) => String(unit.id) === line.unitId)),
    })));
}

function unitQuantitySummary(lines: { qty: number | string; unit?: string | null }[]) {
  const grouped = lines.reduce((totals, line) => {
    const qty = numberValue(line.qty);
    if (qty <= 0 || !line.unit) return totals;
    totals.set(line.unit, (totals.get(line.unit) ?? 0) + qty);
    return totals;
  }, new Map<string, number>());

  const summary = [...grouped.entries()]
    .map(([unit, qty]) => `${formatNumber(qty)} ${unit}`)
    .join(' · ');

  return summary || '-';
}

function lineQuantityLabel(line: StockTransferLine) {
  const unit = unitLabel(line.unit);
  return unit ? `${formatNumber(numberValue(line.qty))} ${unit}` : '-';
}

function unitLabel(unit?: Pick<Unit, 'unit_code' | 'unit_name'> | null) {
  return unit?.unit_code || unit?.unit_name || null;
}

function transferLineNames(transfer: StockTransfer) {
  return (transfer.products ?? [])
    .map((line) => line.product?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

function isVariantProduct(product?: Product) {
  return Boolean(product?.is_variant);
}

function isBatchProduct(product?: Product) {
  return Boolean(product?.is_batch);
}

function numericId(value?: string | number | null) {
  if (value === undefined || value === null || value === 'none' || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function idValue(value?: string | number | null) {
  return value === undefined || value === null || value === '' ? 'none' : String(value);
}

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB').format(date);
}

function formatTime(value?: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function generateReference() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return `ST-${stamp}-${suffix}`;
}
