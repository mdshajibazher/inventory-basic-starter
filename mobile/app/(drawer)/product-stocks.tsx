import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, DataTable, Dialog, Menu, Portal, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Redirect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type StockAdjustmentPayload } from '@/src/lib/api';
import type { PaginationMeta, ProductStock, StockMovement, Unit, Warehouse } from '@/src/types';

const perPage = 15;
const historyPerPage = 10;

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

export default function ProductStocksScreen() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<ProductStock[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductStock | null>(null);
  const [variantStockProduct, setVariantStockProduct] = useState<ProductStock | null>(null);
  const [variantStockVisible, setVariantStockVisible] = useState(false);
  const [stockBreakdownProduct, setStockBreakdownProduct] = useState<ProductStock | null>(null);
  const [stockBreakdownVisible, setStockBreakdownVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [historyRows, setHistoryRows] = useState<StockMovement[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PaginationMeta | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
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
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, selectedWarehouseId]);

  const loadOptions = useCallback(async () => {
    const [warehouseResponse, unitResponse] = await Promise.all([
      api.warehouses({ page: 1, perPage: 100, activeOnly: true }),
      api.units({ page: 1, perPage: 100 }),
    ]);
    setWarehouses(warehouseResponse.data as Warehouse[]);
    setUnits(unitResponse.data as Unit[]);
  }, []);

  const loadHistory = useCallback(async (productId: number, nextPage = historyPage) => {
    const response = await api.productStockHistory(productId, { page: nextPage, perPage: historyPerPage });
    setHistoryRows(response.data as StockMovement[]);
    setHistoryMeta(response.meta ?? null);
  }, [historyPage]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const batches = useMemo(() => {
    const byId = new Map<number, string>();
    selectedProduct?.stocks?.forEach((stock) => {
      if (stock.product_batch_id && stock.batch_no) byId.set(stock.product_batch_id, stock.batch_no);
    });
    return [...byId.entries()].map(([id, label]) => ({ value: String(id), label }));
  }, [selectedProduct]);

  const warehouseFilterOptions = useMemo(() => [
    { value: 'all', label: 'All warehouses' },
    ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })),
  ], [warehouses]);

  function changeWarehouseFilter(value: string) {
    setSelectedWarehouseId(value);
    setPage(1);
  }

  if (!hasPermission('product-stocks-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  function openHistory(product: ProductStock) {
    setSelectedProduct(product);
    setHistoryVisible(true);
    setHistoryPage(1);
    void loadHistory(product.id, 1);
  }

  function openVariantStock(product: ProductStock) {
    setVariantStockProduct(product);
    setVariantStockVisible(true);
  }

  function openStockBreakdown(product: ProductStock) {
    setStockBreakdownProduct(product);
    setStockBreakdownVisible(true);
  }

  function openAdjust(product: ProductStock, movement?: StockMovement) {
    setSelectedProduct(product);
    setEditingMovement(movement ?? null);
    setForm(movement ? formFromMovement(product, movement, units) : defaultForm(product, warehouses, units));
    setAdjustVisible(true);
  }

  function closeAdjust() {
    setAdjustVisible(false);
    setEditingMovement(null);
    setForm(emptyAdjustment);
  }

  async function saveAdjustment() {
    if (!selectedProduct) return;
    const payload = adjustmentPayload(form, selectedProduct);
    if (!payload) return;

    setSaving(true);
    try {
      if (editingMovement) await api.updateStockAdjustment(editingMovement.id, payload);
      else await api.createStockAdjustment(selectedProduct.id, payload);
      closeAdjust();
      await load(page);
      if (historyVisible) await loadHistory(selectedProduct.id, historyPage);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save stock adjustment.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(movement: StockMovement) {
    Alert.alert('Delete adjustment', 'Delete this stock adjustment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteStockAdjustment(movement.id);
            await load(page);
            if (selectedProduct) await loadHistory(selectedProduct.id, historyPage);
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete stock adjustment.');
          }
        },
      },
    ]);
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Product Stock</Text>
          <Text variant="bodyMedium" style={styles.muted}>{items.length} shown from {pagination?.total ?? items.length}</Text>
        </View>
        <View style={styles.headerActions}>
          <SelectMenu label="Warehouse" value={selectedWarehouseId} options={warehouseFilterOptions} onSelect={changeWarehouseFilter} />
          <Button mode="outlined" icon="refresh" loading={loading} onPress={() => void load(page)}>Refresh</Button>
        </View>
      </View>

      <Searchbar
        style={styles.searchbar}
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, codes, warehouses"
        loading={loading}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.slColumn}>SL</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Product Name</DataTable.Title>
            <DataTable.Title numeric style={styles.stockColumn}>Current Stock</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>
          {items.map((item, index) => (
            <DataTable.Row key={item.id}>
              <DataTable.Cell style={styles.slColumn}>{(pagination?.from ?? 1) + index}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>
                <View>
                  <Text variant="bodyMedium">{item.name}</Text>
                  <Text variant="bodySmall" style={styles.muted}>{item.code}</Text>
                </View>
              </DataTable.Cell>
              <DataTable.Cell numeric style={styles.stockColumn}>{formatQty(item.current_stock)} {item.unit?.unit_code ?? ''}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  <Button compact mode="outlined" onPress={() => openHistory(item)}>History</Button>
                  {isVariantProduct(item)
                    ? <Button compact mode="outlined" onPress={() => openVariantStock(item)}>Variant Stock</Button>
                    : <Button compact mode="outlined" onPress={() => openStockBreakdown(item)}>Stock Breakdown</Button>}
                  {canAdjust ? <Button compact mode="outlined" onPress={() => openAdjust(item)}>Adjust</Button> : null}
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Text variant="bodyMedium">Page {pagination.current_page} of {pagination.last_page}</Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>Next</Button>
        </View>
      ) : null}

      {!loading && !items.length ? <Text style={styles.empty}>No stock products found.</Text> : null}

      <Portal>
        <Dialog visible={stockBreakdownVisible} onDismiss={() => setStockBreakdownVisible(false)} style={styles.dialog}>
          <Dialog.Title>{stockBreakdownProduct?.name ?? 'Stock'} Stock Breakdown</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <DataTable style={styles.stockBreakdownTable}>
                <DataTable.Header>
                  <DataTable.Title style={styles.nameColumn}>Warehouse</DataTable.Title>
                  <DataTable.Title style={styles.codeColumn}>Batch</DataTable.Title>
                  <DataTable.Title style={styles.dateColumn}>Expired Date</DataTable.Title>
                  <DataTable.Title numeric style={styles.stockColumn}>Stock</DataTable.Title>
                </DataTable.Header>
                {stockBreakdownRows(stockBreakdownProduct).map((row) => (
                  <DataTable.Row key={`${row.warehouseName}-${row.batchNo}-${row.expiredDate}`}>
                    <DataTable.Cell style={styles.nameColumn}>{row.warehouseName}</DataTable.Cell>
                    <DataTable.Cell style={styles.codeColumn}>{row.batchNo}</DataTable.Cell>
                    <DataTable.Cell style={styles.dateColumn}>{row.expiredDate}</DataTable.Cell>
                    <DataTable.Cell numeric style={styles.stockColumn}>{formatQty(row.qty)} {stockBreakdownProduct?.unit?.unit_code ?? ''}</DataTable.Cell>
                  </DataTable.Row>
                ))}
                {!stockBreakdownRows(stockBreakdownProduct).length ? (
                  <DataTable.Row>
                    <DataTable.Cell style={styles.nameColumn}>No stock breakdown found</DataTable.Cell>
                  </DataTable.Row>
                ) : null}
              </DataTable>
            </ScrollView>
            <View style={styles.stockModalTotal}>
              <Text variant="titleSmall">Total stock</Text>
              <Text variant="titleSmall">{formatQty(stockBreakdownTotal(stockBreakdownProduct))} {stockBreakdownProduct?.unit?.unit_code ?? ''}</Text>
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setStockBreakdownVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={variantStockVisible} onDismiss={() => setVariantStockVisible(false)} style={styles.dialog}>
          <Dialog.Title>{variantStockProduct?.name ?? 'Variant Stock'} Variant Stock</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <DataTable style={styles.variantStockTable}>
                <DataTable.Header>
                  <DataTable.Title style={styles.nameColumn}>Variant</DataTable.Title>
                  <DataTable.Title style={styles.codeColumn}>Item Code</DataTable.Title>
                  <DataTable.Title style={styles.nameColumn}>Warehouse</DataTable.Title>
                  <DataTable.Title numeric style={styles.stockColumn}>Stock</DataTable.Title>
                </DataTable.Header>
                {variantStockRows(variantStockProduct).map((row) => (
                  <DataTable.Row key={`${row.variantId}-${row.warehouseName}`}>
                    <DataTable.Cell style={styles.nameColumn}>{row.variantName}</DataTable.Cell>
                    <DataTable.Cell style={styles.codeColumn}>{row.itemCode}</DataTable.Cell>
                    <DataTable.Cell style={styles.nameColumn}>{row.warehouseName}</DataTable.Cell>
                    <DataTable.Cell numeric style={styles.stockColumn}>{formatQty(row.qty)} {variantStockProduct?.unit?.unit_code ?? ''}</DataTable.Cell>
                  </DataTable.Row>
                ))}
                {!variantStockRows(variantStockProduct).length ? (
                  <DataTable.Row>
                    <DataTable.Cell style={styles.nameColumn}>No variant stock found</DataTable.Cell>
                  </DataTable.Row>
                ) : null}
              </DataTable>
            </ScrollView>
            <View style={styles.stockModalTotal}>
              <Text variant="titleSmall">Total stock</Text>
              <Text variant="titleSmall">{formatQty(variantStockTotal(variantStockProduct))} {variantStockProduct?.unit?.unit_code ?? ''}</Text>
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setVariantStockVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={historyVisible} onDismiss={() => setHistoryVisible(false)} style={styles.dialog}>
          <Dialog.Title>{selectedProduct?.name ?? 'Stock'} History</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <DataTable style={styles.historyTable}>
                <DataTable.Header>
                  <DataTable.Title style={styles.dateColumn}>Date</DataTable.Title>
                  <DataTable.Title style={styles.typeColumn}>Type</DataTable.Title>
                  <DataTable.Title numeric style={styles.qtyColumn}>Qty</DataTable.Title>
                  <DataTable.Title numeric style={styles.qtyColumn}>Before</DataTable.Title>
                  <DataTable.Title numeric style={styles.qtyColumn}>After</DataTable.Title>
                  <DataTable.Title style={styles.nameColumn}>Reference</DataTable.Title>
                  <DataTable.Title style={styles.nameColumn}>Warehouse</DataTable.Title>
                  <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
                </DataTable.Header>
                {historyRows.map((movement) => (
                  <DataTable.Row key={movement.id}>
                    <DataTable.Cell style={styles.dateColumn}>{movement.movement_date ?? movement.created_at?.slice(0, 10)}</DataTable.Cell>
                    <DataTable.Cell style={styles.typeColumn}>{movement.type.replaceAll('_', ' ')}</DataTable.Cell>
                    <DataTable.Cell numeric style={styles.qtyColumn}>{formatQty(movement.quantity)}</DataTable.Cell>
                    <DataTable.Cell numeric style={styles.qtyColumn}>{formatQty(movement.before_quantity)}</DataTable.Cell>
                    <DataTable.Cell numeric style={styles.qtyColumn}>{formatQty(movement.after_quantity)}</DataTable.Cell>
                    <DataTable.Cell style={styles.nameColumn}>{movement.reference_no ?? '-'}</DataTable.Cell>
                    <DataTable.Cell style={styles.nameColumn}>{movement.warehouse?.name ?? '-'}</DataTable.Cell>
                    <DataTable.Cell style={styles.actionColumn}>
                      {movement.is_editable && canAdjust && selectedProduct ? (
                        <View style={styles.actions}>
                          <Button compact mode="text" onPress={() => openAdjust(selectedProduct, movement)}>Edit</Button>
                          <Button compact mode="text" onPress={() => confirmDelete(movement)}>Delete</Button>
                        </View>
                      ) : '-'}
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button disabled={!historyMeta || historyMeta.current_page <= 1} onPress={() => {
              const nextPage = Math.max(1, historyPage - 1);
              setHistoryPage(nextPage);
              if (selectedProduct) void loadHistory(selectedProduct.id, nextPage);
            }}>Previous</Button>
            <Button disabled={!historyMeta || historyMeta.current_page >= historyMeta.last_page} onPress={() => {
              const nextPage = Math.min(historyMeta?.last_page ?? historyPage, historyPage + 1);
              setHistoryPage(nextPage);
              if (selectedProduct) void loadHistory(selectedProduct.id, nextPage);
            }}>Next</Button>
            <Button onPress={() => setHistoryVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={adjustVisible} onDismiss={closeAdjust} style={styles.dialog}>
          <Dialog.Title>{editingMovement ? 'Edit Stock Adjustment' : 'Adjust Stock'}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.formContent}>
              <Text variant="bodyMedium">{selectedProduct?.name}</Text>
              <SelectMenu label="Warehouse" value={form.warehouseId} options={optionList(warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })))} onSelect={(value) => setForm((current) => ({ ...current, warehouseId: value }))} />
              <SelectMenu label="Unit" value={form.unitId} options={stockUnitOptions(selectedProduct, units)} onSelect={(value) => setForm((current) => ({ ...current, unitId: value }))} />
              {selectedProduct?.is_variant ? <SelectMenu label="Variant" value={form.variantId} options={optionList((selectedProduct.variants ?? []).map((variant) => ({ value: String(variant.variant_id), label: `${variant.name} (${variant.item_code})` })))} onSelect={(value) => setForm((current) => ({ ...current, variantId: value }))} /> : null}
              {selectedProduct?.is_batch ? <SelectMenu label="Batch" value={form.batchId} options={optionList(batches)} onSelect={(value) => setForm((current) => ({ ...current, batchId: value }))} /> : null}
              <SegmentedButtons value={form.direction} onValueChange={(value) => setForm((current) => ({ ...current, direction: value as 'increase' | 'decrease' }))} buttons={[{ value: 'increase', label: 'Increase' }, { value: 'decrease', label: 'Decrease' }]} />
              <TextInput mode="outlined" label="Qty" value={form.qty} keyboardType="numeric" onChangeText={(value) => setForm((current) => ({ ...current, qty: value }))} />
              <TextInput mode="outlined" label="Date" value={form.movementDate} onChangeText={(value) => setForm((current) => ({ ...current, movementDate: value }))} />
              <TextInput mode="outlined" label="Note" value={form.note} multiline onChangeText={(value) => setForm((current) => ({ ...current, note: value }))} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeAdjust}>Cancel</Button>
            <Button loading={saving} onPress={() => void saveAdjustment()}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function SelectMenu({ label, value, options, onSelect }: { label: string; value: string; options: { value: string; label: string }[]; onSelect: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? 'Select';

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={<Button mode="outlined" onPress={() => setVisible(true)}>{label}: {selected}</Button>}
    >
      {options.map((option) => (
        <Menu.Item key={option.value} title={option.label} onPress={() => {
          onSelect(option.value);
          setVisible(false);
        }} />
      ))}
    </Menu>
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
    Alert.alert('Missing fields', 'Warehouse, unit, and quantity are required.');
    return null;
  }
  if (product.is_variant && form.variantId === 'none') {
    Alert.alert('Missing variant', 'Select a variant for this product.');
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

function formatQty(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 9 }).format(number);
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', flexShrink: 1 },
  muted: { color: '#666666' },
  searchbar: { borderRadius: 8, backgroundColor: '#f5f5f5' },
  table: { minWidth: 760, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8 },
  historyTable: { minWidth: 900 },
  variantStockTable: { minWidth: 720 },
  stockBreakdownTable: { minWidth: 680 },
  slColumn: { maxWidth: 64 },
  nameColumn: { minWidth: 180 },
  codeColumn: { minWidth: 150 },
  stockColumn: { minWidth: 130 },
  actionColumn: { minWidth: 180 },
  dateColumn: { minWidth: 120 },
  typeColumn: { minWidth: 150 },
  qtyColumn: { minWidth: 100 },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  empty: { textAlign: 'center', color: '#666666', padding: 18 },
  dialog: { backgroundColor: '#ffffff' },
  formContent: { gap: 12, paddingVertical: 8 },
  stockModalTotal: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
});
