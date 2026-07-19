'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Box, CheckCircle2, Download, Edit, History, Layers, Package, RefreshCw, Search, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api, type StockAdjustmentPayload } from '@/lib/api';
import type { Category, PaginationMeta, ProductStock, StockMovement, Unit, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActionButton, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { EmptyState, Pagination, TableWrap } from '@/components/resource-shell';

const defaultPerPage = 15;
const defaultHistoryPerPage = 10;
type StockStatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

type AdjustmentForm = {
  warehouseId: string;
  batchId: string;
  variantId: string;
  unitId: string;
  direction: 'increase' | 'decrease';
  qty: string;
  movementDate: string;
  note: string;
};

const emptyAdjustment: AdjustmentForm = {
  warehouseId: 'none',
  batchId: 'none',
  variantId: 'none',
  unitId: 'none',
  direction: 'increase',
  qty: '',
  movementDate: new Date().toISOString().slice(0, 10),
  note: '',
};

export function ProductStocksPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<ProductStock[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductStock | null>(null);
  const [variantStockProduct, setVariantStockProduct] = useState<ProductStock | null>(null);
  const [variantStockOpen, setVariantStockOpen] = useState(false);
  const [stockBreakdownProduct, setStockBreakdownProduct] = useState<ProductStock | null>(null);
  const [stockBreakdownOpen, setStockBreakdownOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<StockMovement[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PaginationMeta | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage, setHistoryPerPage] = useState(defaultHistoryPerPage);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>('all');
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [form, setForm] = useState<AdjustmentForm>(emptyAdjustment);

  const canAdjust = hasPermission('product-stocks-adjust');
  const visibleItems = useMemo(() => items.filter((item) => stockStatusFilter === 'all' || stockStatus(item).key === stockStatusFilter), [items, stockStatusFilter]);
  const stockSummary = useMemo(() => summarizeStock(items, pagination), [items, pagination]);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.productStocks({
        page: nextPage,
        perPage,
        search: debouncedSearch,
        warehouseId: selectedWarehouseId === 'all' ? undefined : Number(selectedWarehouseId),
        categoryId: selectedCategoryId === 'all' ? undefined : Number(selectedCategoryId),
      });
      setItems(response.data as ProductStock[]);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, perPage, selectedCategoryId, selectedWarehouseId]);

  const loadOptions = useCallback(async () => {
    try {
      const [warehouseResponse, unitResponse, categoryResponse] = await Promise.all([
        api.warehouses({ perPage: 100, activeOnly: true }),
        api.units({ perPage: 100 }),
        api.categories({ perPage: 100, activeOnly: true }),
      ]);
      setWarehouses(warehouseResponse.data as Warehouse[]);
      setUnits(unitResponse.data as Unit[]);
      setCategories(categoryResponse.data as Category[]);
    } catch (error) {
      toast.error('Options failed', { description: errorMessage(error) });
    }
  }, []);

  const loadHistory = useCallback(async (productId: number, nextPage = historyPage) => {
    setHistoryLoading(true);
    try {
      const response = await api.productStockHistory(productId, { page: nextPage, perPage: historyPerPage });
      setHistoryRows(response.data as StockMovement[]);
      setHistoryMeta(response.meta ?? null);
    } catch (error) {
      toast.error('History failed', { description: errorMessage(error) });
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historyPerPage]);

  useEffect(() => {
    if (!hasPermission('product-stocks-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const productBatches = useMemo(() => {
    const stocks = selectedProduct?.stocks ?? [];
    const byId = new Map<number, { id: number; label: string }>();
    stocks.forEach((stock) => {
      if (stock.product_batch_id && stock.batch_no) byId.set(stock.product_batch_id, { id: stock.product_batch_id, label: stock.batch_no });
    });
    return [...byId.values()];
  }, [selectedProduct]);

  const warehouseFilterOptions = useMemo(() => [
    { value: 'all', label: 'All warehouses' },
    ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })),
  ], [warehouses]);

  const categoryFilterOptions = useMemo(() => [
    { value: 'all', label: 'All Categories' },
    ...categories.map((category) => ({ value: String(category.id), label: category.name })),
  ], [categories]);

  function changeWarehouseFilter(value: string) {
    setSelectedWarehouseId(value);
    setPage(1);
  }

  function changeCategoryFilter(value: string) {
    setSelectedCategoryId(value);
    setPage(1);
  }

  function changeStockStatusFilter(value: string) {
    setStockStatusFilter(value as StockStatusFilter);
  }

  function openHistory(product: ProductStock) {
    setSelectedProduct(product);
    setHistoryOpen(true);
    setHistoryPage(1);
    void loadHistory(product.id, 1);
  }

  function openVariantStock(product: ProductStock) {
    setVariantStockProduct(product);
    setVariantStockOpen(true);
  }

  function openStockBreakdown(product: ProductStock) {
    setStockBreakdownProduct(product);
    setStockBreakdownOpen(true);
  }

  function openAdjust(product: ProductStock, movement?: StockMovement) {
    setSelectedProduct(product);
    setEditingMovement(movement ?? null);
    setForm(movement ? formFromMovement(product, movement, units) : defaultForm(product, warehouses, units));
    setAdjustOpen(true);
  }

  function closeAdjust() {
    setAdjustOpen(false);
    setEditingMovement(null);
    setForm(emptyAdjustment);
  }

  async function saveAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!selectedProduct) return;
    const payload = adjustmentPayload(form, selectedProduct);
    if (!payload) return;

    setSaving(true);
    try {
      if (editingMovement) await api.updateStockAdjustment(editingMovement.id, payload);
      else await api.createStockAdjustment(selectedProduct.id, payload);
      toast.success(editingMovement ? 'Stock adjustment updated' : 'Stock adjustment created');
      closeAdjust();
      await load(page);
      if (historyOpen) await loadHistory(selectedProduct.id, historyPage);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdjustment(movement: StockMovement) {
    if (!window.confirm('Delete this stock adjustment?')) return;
    try {
      await api.deleteStockAdjustment(movement.id);
      toast.success('Stock adjustment deleted');
      await load(page);
      if (selectedProduct) await loadHistory(selectedProduct.id, historyPage);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    }
  }

  async function exportHistory() {
    if (!selectedProduct) return;
    try {
      await api.exportProductStockHistory(selectedProduct.id);
    } catch (error) {
      toast.error('Export failed', { description: errorMessage(error) });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Product Stock</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Warehouse-wise stock overview and quick actions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StockMetricCard icon={Box} iconClassName="bg-blue-50 text-blue-600" label="Total Products" value={formatQty(stockSummary.totalProducts)} caption="Across all warehouses" />
        <StockMetricCard icon={CheckCircle2} iconClassName="bg-emerald-50 text-emerald-600" label="In Stock" value={formatQty(stockSummary.inStock)} valueClassName="text-emerald-600" caption={`${stockSummary.inStockRate}% of products`} />
        <StockMetricCard icon={AlertTriangle} iconClassName="bg-orange-50 text-orange-500" label="Low Stock" value={formatQty(stockSummary.lowStock)} valueClassName="text-orange-500" caption="Needs attention" />
        <StockMetricCard icon={XCircle} iconClassName="bg-red-50 text-red-500" label="Out of Stock" value={formatQty(stockSummary.outOfStock)} valueClassName="text-red-500" caption="Reorder required" />
        <StockMetricCard icon={Layers} iconClassName="bg-violet-50 text-violet-600" label="Variants Tracked" value={formatQty(stockSummary.variantsTracked)} valueClassName="text-violet-600" caption="Variant/Pack items" />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-3 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product, SKU or code..." className="border-slate-300 pl-11 text-slate-700 focus:border-blue-500" />
          </div>
          <Select value={selectedWarehouseId} onValueChange={changeWarehouseFilter} options={warehouseFilterOptions} />
          <Select value={selectedCategoryId} onValueChange={changeCategoryFilter} options={categoryFilterOptions} />
          <Select value={stockStatusFilter} onValueChange={changeStockStatusFilter} options={[
            { value: 'all', label: 'All Stock Status' },
            { value: 'in_stock', label: 'In Stock' },
            { value: 'low_stock', label: 'Low Stock' },
            { value: 'out_of_stock', label: 'Out of Stock' },
          ]} />
          <Button type="button" variant="secondary" className="border-blue-200 px-5 text-blue-600 hover:bg-blue-50" onClick={() => void load(page)} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {visibleItems.length ? (
          <>
            <TableWrap loading={loading}>
              <table className="min-w-[1160px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    {['SL', 'Product', 'SKU / Code', 'Category', 'Warehouse', 'Current Stock', 'Unit', 'Stock Status', 'Last Updated', 'Actions'].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((item, index) => {
                    const status = stockStatus(item);
                    return (
                      <tr key={item.id} className="bg-white hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-slate-600">{(pagination?.from ?? 1) + index}</td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-56 items-center gap-3">
                            <ProductAvatar product={item} />
                            <div>
                              <div className="font-semibold text-slate-950">{item.name}</div>
                              <div className="text-xs text-slate-500">{productDescriptor(item)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{item.code}</td>
                        <td className="px-4 py-3 text-slate-700">{categoryLabel(item)}</td>
                        <td className="px-4 py-3 text-slate-700">{warehouseLabel(item, selectedWarehouseId)}</td>
                        <td className="px-4 py-3">
                          <div className="w-36">
                            <div className="font-semibold text-slate-950">{formatQty(item.current_stock)}</div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className={status.barClassName} style={{ width: `${stockPercent(item)}%` }} />
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{stockPercent(item)}%</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{item.unit?.unit_code ?? '-'}</td>
                        <td className="min-w-32 px-4 py-3"><StockStatusBadge status={status} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{lastUpdatedLabel()}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <ActionButton
                              icon={History}
                              text="History"
                              color="text-blue-500 hover:text-blue-600"
                              bgColor="bg-blue-50 hover:border-blue-100 hover:bg-blue-100"
                              onClick={() => openHistory(item)}
                            />
                            {isVariantProduct(item) ? (
                              <ActionButton
                                icon={BarChart3}
                                text="Variant Stock"
                                color="text-violet-600 hover:text-violet-700"
                                bgColor="bg-violet-50 hover:border-violet-100 hover:bg-violet-100"
                                onClick={() => openVariantStock(item)}
                              />
                            ) : (
                              <ActionButton
                                icon={BarChart3}
                                text="Breakdown"
                                color="text-amber-600 hover:text-amber-700"
                                bgColor="bg-amber-50 hover:border-amber-100 hover:bg-amber-100"
                                onClick={() => openStockBreakdown(item)}
                              />
                            )}
                            {canAdjust ? (
                              <ActionButton
                                icon={Edit}
                                text="Adjust"
                                color="text-red-500 hover:text-red-600"
                                bgColor="bg-red-50 hover:border-red-100 hover:bg-red-100"
                                onClick={() => openAdjust(item)}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <div className="border-t border-slate-200 bg-white px-4 pb-4">
              <Pagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />
            </div>
          </>
        ) : <div className="p-4"><EmptyState label={loading ? 'Loading stock...' : 'No stock products found'} /></div>}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Package className="h-6 w-6" /></div>
            <div>
              <div className="font-semibold text-slate-950">Stock Summary ({selectedWarehouseId === 'all' ? 'All Warehouses' : warehouseFilterOptions.find((option) => option.value === selectedWarehouseId)?.label})</div>
              <div className="mt-1 text-xs text-slate-500">Real-time overview of your inventory</div>
            </div>
          </div>
          <SummaryMetric label="Total Stock Qty" value={formatQty(stockSummary.totalQty)} caption="All units" />
          <SummaryMetric label="Low Stock Items" value={formatQty(stockSummary.lowStock)} valueClassName="text-orange-500" caption="Need attention" />
          <SummaryMetric label="Out of Stock Items" value={formatQty(stockSummary.outOfStock)} valueClassName="text-red-500" caption="Reorder required" />
          <SummaryMetric label="Last Updated" value={lastUpdatedLabel()} caption="Auto refresh: On" accent />
        </div>
      </section>

      <Modal title={stockBreakdownProduct ? `${stockBreakdownProduct.name} Stock Breakdown` : 'Stock Breakdown'} open={stockBreakdownOpen} onOpenChange={setStockBreakdownOpen}>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                {['Warehouse', 'Batch', 'Expired Date', 'Stock'].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {stockBreakdownRows(stockBreakdownProduct).map((row) => (
                <tr key={`${row.warehouseName}-${row.batchNo}-${row.expiredDate}`}>
                  <td className="px-3 py-2 font-medium">{row.warehouseName}</td>
                  <td className="px-3 py-2">{row.batchNo}</td>
                  <td className="px-3 py-2">{row.expiredDate}</td>
                  <td className="px-3 py-2 font-medium">{formatQty(row.qty)} {stockBreakdownProduct?.unit?.unit_code ?? ''}</td>
                </tr>
              ))}
              {!stockBreakdownRows(stockBreakdownProduct).length ? (
                <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={4}>No stock breakdown found</td></tr>
              ) : null}
            </tbody>
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td className="px-3 py-3 font-semibold" colSpan={3}>Total stock</td>
                <td className="px-3 py-3 font-semibold">{formatQty(stockBreakdownTotal(stockBreakdownProduct))} {stockBreakdownProduct?.unit?.unit_code ?? ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Modal>

      <Modal title={variantStockProduct ? `${variantStockProduct.name} Variant Stock` : 'Variant Stock'} open={variantStockOpen} onOpenChange={setVariantStockOpen}>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                {['Variant', 'Item Code', 'Warehouse', 'Stock'].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {variantStockRows(variantStockProduct).map((row) => (
                <tr key={`${row.variantId}-${row.warehouseName}`}>
                  <td className="px-3 py-2 font-medium">{row.variantName}</td>
                  <td className="px-3 py-2 text-neutral-500">{row.itemCode}</td>
                  <td className="px-3 py-2">{row.warehouseName}</td>
                  <td className="px-3 py-2 font-medium">{formatQty(row.qty)} {variantStockProduct?.unit?.unit_code ?? ''}</td>
                </tr>
              ))}
              {!variantStockRows(variantStockProduct).length ? (
                <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={4}>No variant stock found</td></tr>
              ) : null}
            </tbody>
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td className="px-3 py-3 font-semibold" colSpan={3}>Total stock</td>
                <td className="px-3 py-3 font-semibold">{formatQty(variantStockTotal(variantStockProduct))} {variantStockProduct?.unit?.unit_code ?? ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Modal>

      <Modal title={selectedProduct ? `${selectedProduct.name} History` : 'Stock History'} open={historyOpen} onOpenChange={setHistoryOpen}>
        <div className="mb-3 flex justify-end">
          <Button type="button" variant="secondary" onClick={() => void exportHistory()}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                {['Date', 'Type', 'Qty', 'Before', 'After', 'Reference', 'Variant', 'Unit', 'Warehouse', 'Action'].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {historyRows.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{movement.movement_date ?? movement.created_at?.slice(0, 10)}</td>
                  <td className="px-3 py-2"><MovementBadge type={movement.type} /></td>
                  <td className="px-3 py-2 font-medium">{formatQty(movement.quantity)}</td>
                  <td className="px-3 py-2">{formatQty(movement.before_quantity)}</td>
                  <td className="px-3 py-2">{formatQty(movement.after_quantity)}</td>
                  <td className="px-3 py-2">{movement.reference_no ?? '-'}</td>
                  <td className="px-3 py-2">{movement.variant?.name ?? '-'}</td>
                  <td className="px-3 py-2">{movement.unit?.unit_code ?? '-'}</td>
                  <td className="px-3 py-2">{movement.warehouse?.name ?? '-'}</td>
                  <td className="px-3 py-2">
                    {movement.is_editable && canAdjust && selectedProduct ? (
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label="Edit adjustment" onClick={() => openAdjust(selectedProduct, movement)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="danger" className="h-8 w-8 px-0" aria-label="Delete adjustment" onClick={() => void deleteAdjustment(movement)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {!historyRows.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={10}>{historyLoading ? 'Loading history...' : 'No stock history found'}</td></tr> : null}
            </tbody>
          </table>
        </div>
          <Pagination meta={historyMeta} loading={historyLoading} onPage={(nextPage) => {
            setHistoryPage(nextPage);
            if (selectedProduct) void loadHistory(selectedProduct.id, nextPage);
          }} onPerPageChange={(nextPerPage) => { setHistoryPerPage(nextPerPage); setHistoryPage(1); if (selectedProduct) void loadHistory(selectedProduct.id, 1); }} />
      </Modal>

      <Modal title={editingMovement ? 'Edit Stock Adjustment' : 'Adjust Stock'} open={adjustOpen} onOpenChange={(open) => open ? setAdjustOpen(true) : closeAdjust()}>
        <form onSubmit={saveAdjustment} className="grid gap-4">
          <div className="rounded-md bg-neutral-50 p-3 text-sm">
            <div className="font-medium">{selectedProduct?.name ?? 'Product'}</div>
            <div className="text-neutral-500">Current stock {formatQty(selectedProduct?.current_stock ?? 0)} {selectedProduct?.unit?.unit_code ?? ''}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Warehouse"><Select value={form.warehouseId} onValueChange={(value) => setForm((current) => ({ ...current, warehouseId: value }))} options={optionList(warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })))} /></Field>
            <Field label="Unit"><Select value={form.unitId} onValueChange={(value) => setForm((current) => ({ ...current, unitId: value }))} options={stockUnitOptions(selectedProduct, units)} /></Field>
            {selectedProduct?.is_variant ? <Field label="Variant"><Select value={form.variantId} onValueChange={(value) => setForm((current) => ({ ...current, variantId: value }))} options={optionList((selectedProduct.variants ?? []).map((variant) => ({ value: String(variant.variant_id), label: `${variant.name} (${variant.item_code})` })))} /></Field> : null}
            {selectedProduct?.is_batch ? <Field label="Batch"><Select value={form.batchId} onValueChange={(value) => setForm((current) => ({ ...current, batchId: value }))} options={optionList(productBatches.map((batch) => ({ value: String(batch.id), label: batch.label })))} /></Field> : null}
            <Field label="Direction"><Select value={form.direction} onValueChange={(value) => setForm((current) => ({ ...current, direction: value as 'increase' | 'decrease' }))} options={[{ value: 'increase', label: 'Increase' }, { value: 'decrease', label: 'Decrease' }]} /></Field>
            <Field label="Qty"><Input type="number" min="0" step="0.01" value={form.qty} onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))} /></Field>
            <Field label="Date"><Input type="date" value={form.movementDate} onChange={(event) => setForm((current) => ({ ...current, movementDate: event.target.value }))} /></Field>
          </div>
          <Field label="Note"><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeAdjust}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save adjustment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StockMetricCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  valueClassName = 'text-slate-950',
  caption,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className={`mt-1 text-2xl font-bold leading-none ${valueClassName}`}>{value}</div>
          <div className="mt-2 text-xs text-slate-500">{caption}</div>
        </div>
      </div>
    </div>
  );
}

function ProductAvatar({ product }: { product: ProductStock }) {
  const initials = product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
      {initials || <Package className="h-5 w-5" />}
    </div>
  );
}

function StockStatusBadge({ status }: { status: ReturnType<typeof stockStatus> }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${status.badgeClassName}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
      {status.label}
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  caption,
  valueClassName = 'text-slate-950',
  accent = false,
}: {
  label: string;
  value: string;
  caption: string;
  valueClassName?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-slate-200 lg:border-l lg:pl-8">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${valueClassName}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">
        {caption}{accent ? <span className="ml-1 inline-flex items-center gap-1 text-emerald-600">On <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /></span> : null}
      </div>
    </div>
  );
}

function defaultForm(product: ProductStock, warehouses: Warehouse[], units: Unit[]): AdjustmentForm {
  const familyUnits = productUnitsForFamily(product, units);

  return {
    ...emptyAdjustment,
    warehouseId: String(product.stocks?.[0]?.warehouse_id ?? warehouses[0]?.id ?? 'none'),
    batchId: String(product.stocks?.find((stock) => stock.product_batch_id)?.product_batch_id ?? 'none'),
    variantId: String(product.variants?.[0]?.variant_id ?? 'none'),
    unitId: String(product.unit?.id ?? familyUnits[0]?.id ?? 'none'),
  };
}

function formFromMovement(product: ProductStock, movement: StockMovement, units: Unit[] = []): AdjustmentForm {
  const familyUnits = productUnitsForFamily(product, units);
  const movementUnitId = familyUnits.some((unit) => unit.id === movement.unit_id)
    ? movement.unit_id
    : product.unit?.id ?? familyUnits[0]?.id ?? null;

  return {
    warehouseId: String(movement.warehouse_id ?? 'none'),
    batchId: String(movement.product_batch_id ?? 'none'),
    variantId: String(movement.variant_id ?? 'none'),
    unitId: String(movementUnitId ?? 'none'),
    direction: (movement.quantity_base ?? movement.quantity) >= 0 ? 'increase' : 'decrease',
    qty: String(Math.abs(movement.quantity)),
    movementDate: movement.movement_date ?? new Date().toISOString().slice(0, 10),
    note: movement.note ?? '',
  };
}

function adjustmentPayload(form: AdjustmentForm, product: ProductStock): StockAdjustmentPayload | null {
  const qty = Number(form.qty);
  if (form.warehouseId === 'none' || form.unitId === 'none' || !Number.isFinite(qty) || qty <= 0) {
    toast.error('Missing fields', { description: 'Warehouse, unit, and quantity are required.' });
    return null;
  }
  if (product.is_variant && form.variantId === 'none') {
    toast.error('Missing variant', { description: 'Select a variant for this product.' });
    return null;
  }

  return {
    warehouse_id: Number(form.warehouseId),
    product_batch_id: form.batchId === 'none' ? null : Number(form.batchId),
    variant_id: form.variantId === 'none' ? null : Number(form.variantId),
    unit_id: Number(form.unitId),
    direction: form.direction,
    qty,
    movement_date: form.movementDate || null,
    note: form.note || null,
  };
}

function optionList(options: { value: string; label: string }[]) {
  return [{ value: 'none', label: 'Select' }, ...options];
}

function stockUnitOptions(product: ProductStock | null, units: Unit[]) {
  return optionList(productUnitsForFamily(product, units).map((unit) => ({
    value: String(unit.id),
    label: `${unit.unit_name} (${unit.unit_code})`,
  })));
}

function productUnitsForFamily(product: ProductStock | null | undefined, units: Unit[]) {
  if (!product?.unit?.id) return [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  if (!byId.has(product.unit.id)) byId.set(product.unit.id, product.unit);
  const mergedUnits = Array.from(byId.values());
  const rootId = rootUnitId(product.unit.id, mergedUnits);
  if (!rootId) return [];

  return mergedUnits.filter((unit) => rootUnitId(unit.id, mergedUnits) === rootId);
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

function isVariantProduct(product: ProductStock | null | undefined) {
  return product?.is_variant === true || String(product?.is_variant) === '1';
}

function isBatchProduct(product: ProductStock | null | undefined) {
  return product?.is_batch === true || String(product?.is_batch) === '1';
}

function stockStatus(product: ProductStock) {
  const quantity = Number(product.current_stock) || 0;
  const lowLimit = lowStockLimit(product);

  if (quantity <= 0) {
    return {
      key: 'out_of_stock' as const,
      label: 'Out of Stock',
      badgeClassName: 'border-red-200 bg-red-50 text-red-600',
      dotClassName: 'bg-red-500',
      barClassName: 'h-full rounded-full bg-red-500',
    };
  }

  if (quantity <= lowLimit) {
    return {
      key: 'low_stock' as const,
      label: 'Low Stock',
      badgeClassName: 'border-orange-200 bg-orange-50 text-orange-600',
      dotClassName: 'bg-orange-500',
      barClassName: 'h-full rounded-full bg-orange-500',
    };
  }

  return {
    key: 'in_stock' as const,
    label: 'In Stock',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    dotClassName: 'bg-emerald-500',
    barClassName: 'h-full rounded-full bg-emerald-500',
  };
}

function lowStockLimit(product: ProductStock) {
  const candidate = (product as ProductStock & { alert_quantity?: number | string | null; low_stock_limit?: number | string | null }).alert_quantity
    ?? (product as ProductStock & { low_stock_limit?: number | string | null }).low_stock_limit;
  const limit = Number(candidate);

  return Number.isFinite(limit) && limit > 0 ? limit : 50;
}

function stockPercent(product: ProductStock) {
  const quantity = Math.max(0, Number(product.current_stock) || 0);
  if (quantity === 0) return 0;

  const reference = Math.max(lowStockLimit(product) * 2, quantity);
  return Math.max(5, Math.min(100, Math.round((quantity / reference) * 100)));
}

function productDescriptor(product: ProductStock) {
  if (isVariantProduct(product)) return 'Variant tracked';
  if (isBatchProduct(product)) return 'Batch tracked';
  return product.type === 'standard' ? 'Standard item' : product.type;
}

function categoryLabel(product: ProductStock) {
  const withCategory = product as ProductStock & { category?: { name?: string | null } | null; category_name?: string | null };
  return withCategory.category?.name ?? withCategory.category_name ?? 'General';
}

function warehouseLabel(product: ProductStock, selectedWarehouseId: string) {
  if (selectedWarehouseId !== 'all') {
    return product.stocks?.find((stock) => String(stock.warehouse_id) === selectedWarehouseId)?.warehouse_name ?? 'Selected warehouse';
  }

  const warehouses = [...new Set((product.stocks ?? []).map((stock) => stock.warehouse_name).filter(Boolean))];
  if (warehouses.length === 0) return 'All Warehouses';
  if (warehouses.length === 1) return warehouses[0];
  return `${warehouses[0]} +${warehouses.length - 1}`;
}

function lastUpdatedLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function summarizeStock(items: ProductStock[], pagination: PaginationMeta | null) {
  const inStock = items.filter((item) => stockStatus(item).key === 'in_stock').length;
  const lowStock = items.filter((item) => stockStatus(item).key === 'low_stock').length;
  const outOfStock = items.filter((item) => stockStatus(item).key === 'out_of_stock').length;
  const totalProducts = pagination?.total ?? items.length;

  return {
    totalProducts,
    inStock,
    lowStock,
    outOfStock,
    variantsTracked: items.filter(isVariantProduct).length,
    totalQty: items.reduce((sum, item) => sum + (Number(item.current_stock) || 0), 0),
    inStockRate: totalProducts > 0 ? Math.round((inStock / totalProducts) * 1000) / 10 : 0,
  };
}

function variantStockRows(product: ProductStock | null) {
  if (!product) return [];

  return (product.variants ?? []).flatMap((variant) => {
    const stocks = (product.stocks ?? []).filter((stock) => Number(stock.variant_id) === Number(variant.variant_id));

    return stocks.map((stock) => ({
      variantId: variant.variant_id,
      variantName: variant.name,
      itemCode: variant.item_code,
      warehouseName: stock.warehouse_name ?? `Warehouse ${stock.warehouse_id}`,
      qty: Number(stock.qty) || 0,
    }));
  });
}

function variantStockTotal(product: ProductStock | null) {
  return variantStockRows(product).reduce((sum, row) => sum + row.qty, 0);
}

function stockBreakdownRows(product: ProductStock | null) {
  if (!product) return [];

  return (product.stocks ?? [])
    .filter((stock) => !stock.variant_id)
    .map((stock) => ({
      warehouseName: stock.warehouse_name ?? `Warehouse ${stock.warehouse_id}`,
      batchNo: stock.batch_no ?? '-',
      expiredDate: stock.expired_date ?? '-',
      qty: Number(stock.qty) || 0,
    }));
}

function stockBreakdownTotal(product: ProductStock | null) {
  return stockBreakdownRows(product).reduce((sum, row) => sum + row.qty, 0);
}

function MovementBadge({ type }: { type: string }) {
  const positive = ['purchase', 'product_return', 'transfer_in', 'stock_increase', 'opening_stock'].includes(type);
  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-700'}`}>
      {type.replaceAll('_', ' ')}
    </span>
  );
}

function formatQty(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 9 }).format(number);
}
