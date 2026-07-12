'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Edit, History, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api, type StockAdjustmentPayload } from '@/lib/api';
import type { PaginationMeta, ProductStock, StockMovement, Unit, Warehouse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { EmptyState, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';

const defaultPerPage = 15;
const defaultHistoryPerPage = 10;

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
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all');
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [form, setForm] = useState<AdjustmentForm>(emptyAdjustment);

  const canAdjust = hasPermission('product-stocks-adjust');

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.productStocks({
        page: nextPage,
        perPage,
        search: debouncedSearch,
        warehouseId: selectedWarehouseId === 'all' ? undefined : Number(selectedWarehouseId),
      });
      setItems(response.data as ProductStock[]);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, perPage, selectedWarehouseId]);

  const loadOptions = useCallback(async () => {
    try {
      const [warehouseResponse, unitResponse] = await Promise.all([
        api.warehouses({ perPage: 100, activeOnly: true }),
        api.units({ perPage: 100 }),
      ]);
      setWarehouses(warehouseResponse.data as Warehouse[]);
      setUnits(unitResponse.data as Unit[]);
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

  function changeWarehouseFilter(value: string) {
    setSelectedWarehouseId(value);
    setPage(1);
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
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product Stock</h1>
          <p className="mt-1 text-sm text-neutral-500">{pagination?.total ?? items.length} stocked products</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-56">
            <Select value={selectedWarehouseId} onValueChange={changeWarehouseFilter} options={warehouseFilterOptions} />
          </div>
          <Button type="button" variant="secondary" onClick={() => void load(page)} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="Search products, codes, warehouses" />

      {items.length ? (
        <>
          <TableWrap loading={loading}>
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  {['SL', 'Product Name', 'Current Stock', 'Action'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-neutral-500">{(pagination?.from ?? 1) + index}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-neutral-500">{item.code}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatQty(item.current_stock)} {item.unit?.unit_code ?? ''}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={() => openHistory(item)}>
                          <History className="h-4 w-4" />
                          History
                        </Button>
                        {isVariantProduct(item) ? (
                          <Button type="button" variant="secondary" onClick={() => openVariantStock(item)}>
                            Variant Stock
                          </Button>
                        ) : (
                          <Button type="button" variant="secondary" onClick={() => openStockBreakdown(item)}>
                            Stock Breakdown
                          </Button>
                        )}
                        {canAdjust ? (
                          <Button type="button" variant="secondary" onClick={() => openAdjust(item)}>
                            <SlidersHorizontal className="h-4 w-4" />
                            Adjust
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />
        </>
      ) : <EmptyState label={loading ? 'Loading stock...' : 'No stock products found'} />}

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
