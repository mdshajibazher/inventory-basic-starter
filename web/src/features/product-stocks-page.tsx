'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Box, CheckCircle2, CirclePlus, Download, Edit, History, Layers, Package, PackageCheck, Plus, RefreshCw, Save, Search, ShoppingCart, Trash2, UploadCloud, Warehouse as WarehouseIcon, XCircle, type LucideIcon } from 'lucide-react';
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

type BatchAdjustmentLine = {
  key: string;
  productId: string;
  batchId: string;
  variantId: string;
  unitId: string;
  direction: 'increase' | 'decrease';
  qty: string;
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
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchWarehouseId, setBatchWarehouseId] = useState('none');
  const [batchDocument, setBatchDocument] = useState<File | null>(null);
  const [batchNote, setBatchNote] = useState('');
  const [batchProductId, setBatchProductId] = useState('none');
  const [batchProductSearch, setBatchProductSearch] = useState('');
  const [batchLines, setBatchLines] = useState<BatchAdjustmentLine[]>([]);
  const [adjustmentProducts, setAdjustmentProducts] = useState<ProductStock[]>([]);
  const [batchProductOptions, setBatchProductOptions] = useState<ProductStock[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchDocumentDragging, setBatchDocumentDragging] = useState(false);

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
      const [warehouseResponse, unitResponse, categoryResponse, productResponse] = await Promise.all([
        api.warehouses({ perPage: 100, activeOnly: true }),
        api.units({ perPage: 100 }),
        api.categories({ perPage: 100, activeOnly: true }),
        api.productStocks({ perPage: 100 }),
      ]);
      setWarehouses(warehouseResponse.data as Warehouse[]);
      setUnits(unitResponse.data as Unit[]);
      setCategories(categoryResponse.data as Category[]);
      setAdjustmentProducts(productResponse.data as ProductStock[]);
      setBatchProductOptions(productResponse.data as ProductStock[]);
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

  useEffect(() => {
    if (!batchOpen) return;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.productStocks({ perPage: 100, search: batchProductSearch.trim() || undefined });
        const results = response.data as ProductStock[];
        setBatchProductOptions(results);
        setAdjustmentProducts((current) => mergeProducts(current, results));
      } catch (error) {
        toast.error('Product search failed', { description: errorMessage(error) });
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [batchOpen, batchProductSearch]);

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

  function openBatchAdjustment() {
    setBatchWarehouseId(warehouses[0] ? String(warehouses[0].id) : 'none');
    setBatchOpen(true);
  }

  function closeBatchAdjustment() {
    setBatchOpen(false);
    setBatchWarehouseId('none');
    setBatchDocument(null);
    setBatchNote('');
    setBatchProductId('none');
    setBatchProductSearch('');
    setBatchLines([]);
    setBatchDocumentDragging(false);
  }

  function addBatchLine() {
    const product = adjustmentProducts.find((item) => String(item.id) === batchProductId);
    if (!product) return;
    setBatchLines((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      productId: String(product.id),
      batchId: 'none',
      variantId: 'none',
      unitId: String(product.unit?.id ?? 'none'),
      direction: 'increase',
      qty: '',
    }]);
    setBatchProductId('none');
  }

  function updateBatchLine(key: string, field: keyof Omit<BatchAdjustmentLine, 'key' | 'productId'>, value: string) {
    setBatchLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  async function saveBatchAdjustment(event: FormEvent) {
    event.preventDefault();
    if (batchWarehouseId === 'none' || !batchLines.length) {
      toast.error('Missing fields', { description: 'Warehouse and at least one product line are required.' });
      return;
    }
    const invalidLine = batchLines.find((line) => {
      const product = adjustmentProducts.find((item) => String(item.id) === line.productId);
      return line.unitId === 'none' || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0
        || Boolean(product?.is_variant && line.variantId === 'none')
        || Boolean(product?.is_batch && line.batchId === 'none');
    });
    if (invalidLine) {
      toast.error('Incomplete product line', { description: 'Complete quantity, unit, variant, and batch fields where required.' });
      return;
    }
    const buckets = batchLines.map((line) => `${line.productId}:${line.variantId}:${line.batchId}`);
    if (new Set(buckets).size !== buckets.length) {
      toast.error('Duplicate product line', { description: 'Each product, variant, and batch combination can only be added once.' });
      return;
    }

    setBatchSaving(true);
    try {
      await api.createBatchStockAdjustment({
        warehouse_id: Number(batchWarehouseId),
        document: batchDocument,
        note: batchNote.trim() || null,
        lines: batchLines.map((line) => ({
          product_id: Number(line.productId),
          product_batch_id: line.batchId === 'none' ? null : Number(line.batchId),
          variant_id: line.variantId === 'none' ? null : Number(line.variantId),
          unit_id: Number(line.unitId),
          direction: line.direction,
          qty: Number(line.qty),
        })),
      });
      toast.success('Stock adjustment created');
      closeBatchAdjustment();
      await load(page);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setBatchSaving(false);
    }
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Product Stock</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Warehouse-wise stock overview and quick actions</p>
        </div>
        {canAdjust ? <Button type="button" onClick={openBatchAdjustment}><Plus className="h-4 w-4" />Stock Adjustment</Button> : null}
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

      <Modal
        title="Stock Adjustment"
        description="Increase or decrease product stock for the selected warehouse."
        headerIcon={PackageCheck}
        showDescription
        open={batchOpen}
        onOpenChange={(open) => open ? setBatchOpen(true) : closeBatchAdjustment()}
        contentClassName="max-w-6xl overflow-y-auto rounded-xl border-slate-200 px-0 pb-0 pt-5 shadow-2xl [&>div:first-child]:px-6"
      >
        <form onSubmit={saveBatchAdjustment} className="-mt-5">
          <div className="grid gap-4 border-t border-slate-100 px-6 py-5 lg:grid-cols-2">
            <Field label="Warehouse">
              <div className="relative">
                <WarehouseIcon className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <div className="[&_button]:pl-10"><Select value={batchWarehouseId} onValueChange={setBatchWarehouseId} options={optionList(warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })))} /></div>
              </div>
            </Field>
            <Field label="Attach Document (optional)" hint={batchDocument ? `Selected: ${batchDocument.name}` : undefined}>
              <label
                className={`flex min-h-20 cursor-pointer items-center justify-center gap-4 rounded-lg border border-dashed px-4 py-3 text-center transition ${batchDocumentDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50/40 hover:border-emerald-400 hover:bg-emerald-50/40'}`}
                onDragEnter={(event) => { event.preventDefault(); setBatchDocumentDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setBatchDocumentDragging(false)}
                onDrop={(event) => { event.preventDefault(); setBatchDocumentDragging(false); setBatchDocument(event.dataTransfer.files?.[0] ?? null); }}
              >
                <input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setBatchDocument(event.target.files?.[0] ?? null)} />
                <UploadCloud className="h-8 w-8 shrink-0 text-slate-400" />
                <span className="text-sm text-slate-600">
                  <span>Drag & drop file here or </span>
                  <span className="ml-1 inline-flex rounded-md border border-emerald-200 bg-white px-3 py-1.5 font-semibold text-emerald-700 shadow-sm">Choose File</span>
                  <span className="mt-1 block text-xs text-slate-400">PDF, JPG, PNG up to 5MB</span>
                </span>
              </label>
            </Field>
            <Field label="Search Products">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input className="pl-10" value={batchProductSearch} onChange={(event) => setBatchProductSearch(event.target.value)} placeholder="Search by product name, code or barcode" />
              </div>
            </Field>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1"><Field label="Product Dropdown"><Select value={batchProductId} onValueChange={setBatchProductId} options={optionList(batchProductOptions.map((product) => ({ value: String(product.id), label: `${product.name} (${product.code})` })))} /></Field></div>
              <Button type="button" variant="secondary" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={addBatchLine} disabled={batchProductId === 'none'}><Plus className="h-4 w-4" />Add Product</Button>
            </div>
          </div>

          <div className="mx-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Adjustment Items</div>
            {batchLines.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[940px]">
                  <div className="grid grid-cols-[2fr_1fr_1.25fr_.85fr_1.1fr_52px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                    <div>Product &amp; Code</div><div>Current Stock</div><div>Adjustment Type</div><div>Quantity</div><div>Unit</div><div className="text-center">Actions</div>
                  </div>
                  {batchLines.map((line) => {
                    const product = adjustmentProducts.find((item) => String(item.id) === line.productId);
                    const batches = batchOptionsForProduct(product);
                    const currentStock = batchLineCurrentStock(product, line, batchWarehouseId);
                    return (
                      <div key={line.key} className="grid grid-cols-[2fr_1fr_1.25fr_.85fr_1.1fr_52px] items-start gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0">
                        <div className="flex min-w-0 gap-3">
                          {product ? <ProductAvatar product={product} /> : null}
                          <div className="min-w-0 pt-0.5">
                            <div className="truncate text-sm font-semibold text-slate-950">{product?.name ?? 'Product'}</div>
                            <div className="mt-0.5 text-xs text-slate-500">SKU: {product?.code ?? '-'}</div>
                            {product?.is_variant ? <div className="mt-2"><Select value={line.variantId} onValueChange={(value) => updateBatchLine(line.key, 'variantId', value)} options={optionList((product.variants ?? []).map((variant) => ({ value: String(variant.variant_id), label: `${variant.name} (${variant.item_code})` })))} /></div> : null}
                            {product?.is_batch ? <div className="mt-2"><Select value={line.batchId} onValueChange={(value) => updateBatchLine(line.key, 'batchId', value)} options={optionList(batches)} /></div> : null}
                          </div>
                        </div>
                        <div>
                          <span className={`inline-flex rounded-md border px-3 py-1.5 text-xs font-semibold ${currentStock > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>{formatQty(currentStock)} {product?.unit?.unit_code ?? ''}</span>
                          <div className={`mt-1 text-xs ${currentStock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{currentStock > 0 ? 'In Stock' : 'Out of Stock'}</div>
                        </div>
                        <Select value={line.direction} onValueChange={(value) => updateBatchLine(line.key, 'direction', value)} options={[{ value: 'increase', label: '⊕  Increase' }, { value: 'decrease', label: '⊖  Decrease' }]} />
                        <Input aria-label={`Quantity for ${product?.name ?? 'product'}`} type="number" min="0.01" step="0.01" value={line.qty} onChange={(event) => updateBatchLine(line.key, 'qty', event.target.value)} placeholder="0" />
                        <Select value={line.unitId} onValueChange={(value) => updateBatchLine(line.key, 'unitId', value)} options={stockUnitOptions(product ?? null, units)} />
                        <Button type="button" variant="danger" className="h-10 w-10 border border-red-100 px-0" aria-label="Remove product line" onClick={() => setBatchLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center px-4 py-6 text-center">
                <CirclePlus className="mb-2 h-7 w-7 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No products added yet</p>
                <p className="mt-1 text-xs text-slate-400">Choose a product above to add it to this adjustment.</p>
              </div>
            )}
            <div className="grid gap-4 border-t border-slate-200 bg-emerald-50/40 px-4 py-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 sm:border-r sm:border-slate-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Box className="h-4 w-4" /></span>
                <div><div className="text-xs text-slate-500">Total Items</div><div className="text-sm font-bold text-slate-950">{batchLines.length}</div></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><ShoppingCart className="h-4 w-4" /></span>
                <div><div className="text-xs text-slate-500">Total Quantity</div><div className="text-sm font-bold text-slate-950">{formatQty(batchLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0))}</div></div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <Field label="Note (optional)" hint="This note will be recorded in the adjustment history."><Textarea className="min-h-16" value={batchNote} onChange={(event) => setBatchNote(event.target.value)} placeholder="Add reason or note for this stock adjustment" /></Field>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" className="w-full sm:w-auto sm:min-w-28" onClick={closeBatchAdjustment}>Cancel</Button>
            <Button type="submit" className="w-full bg-emerald-800 hover:bg-emerald-900 sm:w-auto sm:min-w-44" disabled={batchSaving}><Save className="h-4 w-4" />{batchSaving ? 'Saving...' : 'Save Adjustment'}</Button>
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

function batchOptionsForProduct(product: ProductStock | null | undefined) {
  const byId = new Map<number, string>();
  product?.stocks?.forEach((stock) => {
    if (stock.product_batch_id && stock.batch_no) byId.set(stock.product_batch_id, stock.batch_no);
  });
  return [...byId.entries()].map(([id, label]) => ({ value: String(id), label }));
}

function batchLineCurrentStock(product: ProductStock | null | undefined, line: BatchAdjustmentLine, warehouseId: string) {
  if (!product) return 0;

  const matchingRows = (product.stocks ?? []).filter((stock) => {
    if (warehouseId !== 'none' && String(stock.warehouse_id) !== warehouseId) return false;
    if (line.variantId !== 'none' && String(stock.variant_id) !== line.variantId) return false;
    if (line.batchId !== 'none' && String(stock.product_batch_id) !== line.batchId) return false;
    return true;
  });

  return matchingRows.length
    ? matchingRows.reduce((sum, stock) => sum + (Number(stock.qty) || 0), 0)
    : Number(product.current_stock) || 0;
}

function mergeProducts(current: ProductStock[], incoming: ProductStock[]) {
  const byId = new Map(current.map((product) => [product.id, product]));
  incoming.forEach((product) => byId.set(product.id, product));
  return [...byId.values()];
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
