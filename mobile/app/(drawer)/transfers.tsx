import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Button, Dialog, FAB, Menu, Portal, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type TransferPayload } from '@/src/lib/api';
import type { PaginationMeta, Product, Transfer, Unit, User, Warehouse } from '@/src/types';

const perPage = 15;

type StatusFilter = 'all' | 'pending' | 'completed' | 'cancelled';
type FormStep = 1 | 2 | 3;

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
};

type DraftLine = {
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

const today = () => new Date().toISOString().slice(0, 10);

function emptyLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    productId: 'none',
    variantId: 'none',
    batchId: 'none',
    unitId: 'none',
    qty: '1',
    cost: '0',
    taxRate: '0',
    note: '',
  };
}

function defaultForm(): TransferForm {
  const date = new Date();
  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));

  return {
    referenceNo: `ST-${year}${month}-${suffix}`,
    transferDate: today(),
    fromWarehouseId: 'none',
    toWarehouseId: 'none',
    status: 'pending',
    expectedDeliveryDate: '',
    requestedBy: 'none',
    note: '',
    vehicleCourier: '',
    driverContact: '',
  };
}

export function TransfersScreen({ mode = 'list' }: { mode?: 'list' | 'create' }) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<Transfer[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [step, setStep] = useState<FormStep>(1);
  const [form, setForm] = useState<TransferForm>(defaultForm);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [expectedDeliveryPickerVisible, setExpectedDeliveryPickerVisible] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Transfer | null>(null);
  const [completing, setCompleting] = useState(false);

  const canOpen = hasPermission(['transfers-index', 'transfers-add', 'transfers-edit']);
  const canCreate = hasPermission('transfers-add');
  const canComplete = hasPermission('transfers-edit');

  const load = useCallback(async (nextPage = page) => {
    if (mode !== 'list' || status === 'cancelled') {
      setItems([]);
      setPagination(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.transfers({
        page: nextPage,
        perPage,
        search: debouncedSearch,
        status: status === 'all' ? undefined : status,
      });
      setItems(response.data);
      setPagination(response.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, mode, page, status]);

  const loadOptions = useCallback(async () => {
      const [warehouseResponse, productResponse, productOptionsResponse, userOptionsResponse] = await Promise.all([
        api.warehouses({ page: 1, perPage: 100, activeOnly: true }),
        api.products({ page: 1, perPage: 100 }),
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
        fromWarehouseId: current.fromWarehouseId === 'none' && nextWarehouses[0] ? String(nextWarehouses[0].id) : current.fromWarehouseId,
        toWarehouseId: current.toWarehouseId === 'none' && nextWarehouses[1] ? String(nextWarehouses[1].id) : current.toWarehouseId,
        requestedBy: current.requestedBy === 'none' ? idValue(userOptions.users?.[0]?.id) : current.requestedBy,
      }));
  }, []);

  useEffect(() => {
    if (mode === 'list') void load(page);
  }, [load, mode, page]);

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

  if (!canOpen && mode === 'list') {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  if (!canCreate && mode === 'create') {
    return <Redirect href="/(drawer)/transfers" />;
  }

  function resetCreate() {
    setStep(1);
    setForm(defaultForm());
    setLines([emptyLine()]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectedProduct(line: DraftLine) {
    return products.find((product) => String(product.id) === line.productId);
  }

  function productOptions() {
    return products.map((product) => ({
      value: String(product.id),
      label: `${product.name} (${product.code})`,
    }));
  }

  function warehouseName(id: string | number) {
    return warehouses.find((warehouse) => String(warehouse.id) === String(id))?.name ?? 'Select warehouse';
  }

  function productName(id: string) {
    return products.find((product) => String(product.id) === id)?.name ?? 'Select product';
  }

  function batchOptions(line: DraftLine) {
    const product = selectedProduct(line);
    if (!isBatchProduct(product)) return [{ value: 'none', label: 'No batch' }];
    const batches = (product?.warehouse_prices ?? [])
      .filter((stock) => String(stock.warehouse_id) === form.fromWarehouseId)
      .filter((stock) => line.variantId === 'none' || String(stock.variant_id ?? 'none') === line.variantId)
      .filter((stock) => stock.product_batch_id && stock.batch_no)
      .map((stock) => ({
        value: String(stock.product_batch_id),
        label: `${stock.batch_no} (${formatQty(numberValue(stock.qty))})`,
      }));

    return [{ value: 'none', label: 'Select batch' }, ...batches];
  }

  function variantOptions(line: DraftLine) {
    const product = selectedProduct(line);
    if (!isVariantProduct(product)) return [{ value: 'none', label: 'No variant' }];

    return [
      { value: 'none', label: 'Select variant' },
      ...(product?.variants ?? []).map((variant) => ({
        value: String(variant.variant_id),
        label: variant.name,
      })),
    ];
  }

  function ensureDetailsValid() {
    if (form.fromWarehouseId === 'none' || form.toWarehouseId === 'none') {
      Alert.alert('Missing warehouses', 'Select both from and to warehouses.');
      return false;
    }
    if (form.fromWarehouseId === form.toWarehouseId) {
      Alert.alert('Invalid warehouses', 'From and to warehouses must be different.');
      return false;
    }
    if (!form.referenceNo.trim()) {
      Alert.alert('Missing reference', 'Enter a reference number.');
      return false;
    }
    if (!form.transferDate.trim()) {
      Alert.alert('Missing date', 'Enter the transfer date.');
      return false;
    }

    return true;
  }

  function payload(): TransferPayload | null {
    if (!ensureDetailsValid()) return null;

    const payloadLines = lines
      .map((line, index) => {
        const product = selectedProduct(line);
        const qty = Number(line.qty);
        const cost = Number(line.cost || 0);
        const taxRate = Number(line.taxRate || 0);
        const tax = (qty * cost * taxRate) / 100;

        if (!product || !Number.isFinite(qty) || qty <= 0 || !numericId(line.unitId)) {
          Alert.alert('Incomplete item', `Complete product, unit, and quantity for item ${index + 1}.`);
          return null;
        }
        if (isVariantProduct(product) && !numericId(line.variantId)) {
          Alert.alert('Missing variant', `Select a variant for item ${index + 1}.`);
          return null;
        }
        if (isBatchProduct(product) && !numericId(line.batchId)) {
          Alert.alert('Missing batch', `Select a batch for item ${index + 1}.`);
          return null;
        }

        return {
          product_id: Number(line.productId),
          variant_id: numericId(line.variantId),
          product_batch_id: numericId(line.batchId),
          qty,
          purchase_unit: Number(line.unitId),
          net_unit_cost: Number.isFinite(cost) ? cost : 0,
          tax_rate: Number.isFinite(taxRate) ? taxRate : 0,
          tax: Number.isFinite(tax) ? tax : 0,
          subtotal: qty * (Number.isFinite(cost) ? cost : 0) + (Number.isFinite(tax) ? tax : 0),
          line_note: line.note.trim() || null,
        };
      })
      .filter(Boolean) as TransferPayload['lines'];

    if (payloadLines.length !== lines.length) return null;

    if (!payloadLines.length) {
      Alert.alert('Missing items', 'Add at least one product with a valid quantity.');
      return null;
    }

    return {
      reference_no: form.referenceNo.trim(),
      transfer_date: form.transferDate.trim(),
      from_warehouse_id: Number(form.fromWarehouseId),
      to_warehouse_id: Number(form.toWarehouseId),
      status: form.status,
      expected_delivery_date: form.expectedDeliveryDate || null,
      requested_by: numericId(form.requestedBy),
      note: form.note.trim() || null,
      vehicle_courier: form.vehicleCourier.trim() || null,
      driver_contact: form.driverContact.trim() || null,
      lines: payloadLines,
    };
  }

  function nextStep() {
    if (step === 1 && !ensureDetailsValid()) return;
    if (step === 2 && !payload()) return;
    setStep((current) => Math.min(3, current + 1) as FormStep);
  }

  async function saveTransfer() {
    const transferPayload = payload();
    if (!transferPayload) return;

    setSaving(true);
    try {
      await api.createTransfer(transferPayload);
      resetCreate();
      router.replace('/(drawer)/transfers');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to create stock movement.');
    } finally {
      setSaving(false);
    }
  }

  async function completeTransfer() {
    if (!completeTarget) return;

    setCompleting(true);
    try {
      const response = await api.transfer(completeTarget.id);
      const payload = payloadFromTransfer(response.data, 'completed');
      await api.updateTransfer(completeTarget.id, payload);
      setCompleteTarget(null);
      await load(page);
    } catch (error) {
      Alert.alert('Complete failed', error instanceof Error ? error.message : 'Unable to complete stock movement.');
    } finally {
      setCompleting(false);
    }
  }

  if (mode === 'create') {
    const totals = calculateTotals(lines);
    const requestedUser = users.find((item) => String(item.id) === form.requestedBy);

    return (
      <Screen contentStyle={styles.formScreen}>
        <View style={styles.mobileTopBar}>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
            <MaterialCommunityIcons name="close" size={28} color="#111827" />
          </Pressable>
          <Text variant="titleLarge" style={styles.topTitle}>New Stock Movement</Text>
          <View style={styles.topSpacer} />
        </View>

        <StepIndicator step={step} />

        {step === 1 ? (
          <View style={styles.formCard}>
            <Field label="Reference No">
              <TextInput
                mode="outlined"
                value={form.referenceNo}
                onChangeText={(referenceNo) => setForm((current) => ({ ...current, referenceNo }))}
                style={styles.input}
              />
              <Text style={styles.helper}>Auto generated</Text>
            </Field>

            <Field label="Date">
              <TextInput
                mode="outlined"
                left={<TextInput.Icon icon="calendar-outline" />}
                value={form.transferDate}
                onChangeText={(transferDate) => setForm((current) => ({ ...current, transferDate }))}
                placeholder="YYYY-MM-DD"
                style={styles.input}
              />
            </Field>

            <Field label="From Warehouse">
              <SelectMenu
                icon="warehouse"
                value={form.fromWarehouseId}
                label={warehouseName(form.fromWarehouseId)}
                options={warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))}
                onSelect={(fromWarehouseId) => setForm((current) => ({ ...current, fromWarehouseId }))}
              />
            </Field>

            <Field label="To Warehouse">
              <SelectMenu
                icon="office-building-outline"
                value={form.toWarehouseId}
                label={warehouseName(form.toWarehouseId)}
                options={warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))}
                onSelect={(toWarehouseId) => setForm((current) => ({ ...current, toWarehouseId }))}
              />
            </Field>

            <Field label="Status">
              <SegmentedButtons
                value={form.status}
                onValueChange={(value) => setForm((current) => ({ ...current, status: value as TransferForm['status'] }))}
                buttons={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Complete' },
                ]}
              />
            </Field>

            <Field label="Expected Delivery">
              <Pressable onPress={() => setExpectedDeliveryPickerVisible(true)}>
                <TextInput
                  mode="outlined"
                  left={<TextInput.Icon icon="calendar-clock" />}
                  right={<TextInput.Icon icon="chevron-down" onPress={() => setExpectedDeliveryPickerVisible(true)} />}
                  value={form.expectedDeliveryDate}
                  placeholder="Select date"
                  editable={false}
                  pointerEvents="none"
                  style={styles.input}
                />
              </Pressable>
            </Field>

            <Field label="Requested By">
              <SelectMenu
                icon="account-outline"
                value={form.requestedBy}
                label={users.find((item) => String(item.id) === form.requestedBy)?.name ?? 'Select user'}
                options={users.map((item) => ({ value: String(item.id), label: item.name }))}
                onSelect={(requestedBy) => setForm((current) => ({ ...current, requestedBy }))}
              />
            </Field>

            <Field label="Note (Optional)">
              <TextInput
                mode="outlined"
                value={form.note}
                onChangeText={(note) => setForm((current) => ({ ...current, note }))}
                placeholder="Enter note"
                multiline
                style={styles.input}
              />
            </Field>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.formCard}>
            {lines.map((line, index) => {
              const product = selectedProduct(line);
              return (
                <View key={line.key} style={styles.lineCard}>
                  <View style={styles.lineHeader}>
                    <Text variant="titleMedium">Item {index + 1}</Text>
                    {lines.length > 1 ? (
                      <Button compact textColor="#dc2626" onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Remove</Button>
                    ) : null}
                  </View>

                  <Field label="Product">
                    <SelectMenu
                      icon="package-variant-closed"
                      value={line.productId}
                      label={productName(line.productId)}
                      options={productOptions()}
                      onSelect={(productId) => {
                        const nextProduct = products.find((item) => String(item.id) === productId);
                        updateLine(line.key, {
                          productId,
                          unitId: idValue(nextProduct?.purchase_unit_id ?? nextProduct?.unit_id),
                          cost: String(numberValue(nextProduct?.cost)),
                          taxRate: '0',
                          variantId: 'none',
                          batchId: 'none',
                        });
                      }}
                    />
                  </Field>

                  {product?.is_variant ? (
                    <Field label="Variant">
                      <SelectMenu
                        icon="shape-outline"
                        value={line.variantId}
                        label={variantOptions(line).find((option) => option.value === line.variantId)?.label ?? 'Select variant'}
                        options={variantOptions(line)}
                        onSelect={(variantId) => updateLine(line.key, { variantId })}
                      />
                    </Field>
                  ) : null}

                  {product?.is_batch ? (
                    <Field label="Batch">
                      <SelectMenu
                        icon="archive-outline"
                        value={line.batchId}
                        label={batchOptions(line).find((option) => option.value === line.batchId)?.label ?? 'Select batch'}
                        options={batchOptions(line)}
                        onSelect={(batchId) => updateLine(line.key, { batchId })}
                      />
                    </Field>
                  ) : null}

                  <View style={styles.availableBox}>
                    <Text style={styles.availableQty}>{formatQty(availableStock(product, form.fromWarehouseId, line.variantId, line.batchId))}</Text>
                    <Text style={[styles.availableLabel, availableStock(product, form.fromWarehouseId, line.variantId, line.batchId) > 0 ? styles.availableInStock : styles.availableNoStock]}>
                      {availableStock(product, form.fromWarehouseId, line.variantId, line.batchId) > 0 ? 'In stock' : 'No stock'}
                    </Text>
                  </View>

                  <View style={styles.twoColumns}>
                    <Field label="Qty" compact>
                      <TextInput
                        mode="outlined"
                        value={line.qty}
                        onChangeText={(qty) => updateLine(line.key, { qty })}
                        keyboardType="decimal-pad"
                        style={styles.input}
                      />
                    </Field>
                    <Field label="Unit" compact>
                      <SelectMenu
                        icon="scale-balance"
                        value={line.unitId}
                        label={unitLabel(units.find((unit) => String(unit.id) === line.unitId)) ?? 'Select unit'}
                        options={unitOptions(units)}
                        onSelect={(unitId) => updateLine(line.key, { unitId })}
                      />
                    </Field>
                  </View>

                  <Field label="Note" compact>
                    <TextInput
                      mode="outlined"
                      value={line.note}
                      onChangeText={(note) => updateLine(line.key, { note })}
                      placeholder="Line note"
                      style={styles.input}
                    />
                  </Field>
                </View>
              );
            })}

            <Button
              mode="outlined"
              icon="plus"
              onPress={() => setLines((current) => [...current, emptyLine()])}
            >
              Add Item
            </Button>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.formCard}>
            <SummaryRow label="From" value={warehouseName(form.fromWarehouseId)} />
            <SummaryRow label="To" value={warehouseName(form.toWarehouseId)} />
            <SummaryRow label="Total Items" value={String(totals.items)} />
            <SummaryRow label="Quantity Summary" value={formQuantitySummary(lines, units)} />
            <SummaryRow label="Estimated Value" value={formatMoney(totals.value)} />
            <SummaryRow label="Status" value={form.status === 'completed' ? 'Completed' : 'Pending'} />
            <SummaryRow label="Initiated By" value={requestedUser?.name ?? '-'} />

            <View style={styles.stockNotice}>
              <Text style={styles.stockNoticeText}>Stock is deducted from the source warehouse only when the transfer status is completed.</Text>
            </View>

            <View style={styles.reviewItems}>
              {lines.map((line) => (
                <View key={line.key} style={styles.reviewLine}>
                  <Text variant="titleSmall">{productName(line.productId)}</Text>
                  <Text style={styles.muted}>{line.variantId !== 'none' ? variantOptions(line).find((option) => option.value === line.variantId)?.label : 'No variant'} • {line.batchId !== 'none' ? batchOptions(line).find((option) => option.value === line.batchId)?.label : 'No batch'}</Text>
                  <Text style={styles.muted}>{formatQty(numberValue(line.qty))} {unitLabel(units.find((unit) => String(unit.id) === line.unitId)) ?? ''} • {formatMoney(lineValue(line))}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footerActions}>
          {step > 1 ? <Button mode="outlined" onPress={() => setStep((current) => Math.max(1, current - 1) as FormStep)}>Back</Button> : null}
          {step < 3 ? (
            <Button mode="contained" icon="arrow-right" contentStyle={styles.nextButtonContent} style={styles.nextButton} onPress={nextStep}>
              {step === 1 ? 'Next: Add Items' : 'Next: Review'}
            </Button>
          ) : (
            <Button mode="contained" icon="check" loading={saving} disabled={saving} style={styles.nextButton} onPress={() => void saveTransfer()}>
              Create Movement
            </Button>
          )}
        </View>

        <Portal>
          <CalendarDialog
            visible={expectedDeliveryPickerVisible}
            value={form.expectedDeliveryDate}
            onDismiss={() => setExpectedDeliveryPickerVisible(false)}
            onSelect={(expectedDeliveryDate) => {
              setForm((current) => ({ ...current, expectedDeliveryDate }));
              setExpectedDeliveryPickerVisible(false);
            }}
            onClear={() => {
              setForm((current) => ({ ...current, expectedDeliveryDate: '' }));
              setExpectedDeliveryPickerVisible(false);
            }}
          />
        </Portal>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.listScreen}>
      <View style={styles.mobileTopBar}>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#111827" />
        </Pressable>
        <Text variant="titleLarge" style={styles.topTitle}>Stock Movement</Text>
        <Button mode="outlined" compact icon="filter-variant" style={styles.filterButton}>
          Filter
        </Button>
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search by reference, item or warehouse"
        loading={loading}
        style={styles.searchbar}
        inputStyle={styles.searchInput}
      />

      <View style={styles.tabs}>
        {(['all', 'pending', 'completed', 'cancelled'] as StatusFilter[]).map((tab) => (
          <Pressable key={tab} onPress={() => { setStatus(tab); setPage(1); }} style={styles.tabButton}>
            <View style={styles.tabLabelRow}>
              <Text style={[styles.tabText, status === tab ? styles.tabTextActive : null]}>{tabLabel(tab)}</Text>
              {tab !== 'all' ? <View style={[styles.statusDot, dotStyle(tab)]} /> : null}
            </View>
            {status === tab ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.transferList}>
        {items.map((transfer) => (
          <View key={transfer.id} style={styles.transferCard}>
            <View style={styles.transferIcon}>
              <MaterialCommunityIcons name="swap-horizontal" size={30} color="#3f8f24" />
            </View>
            <View style={styles.transferBody}>
              <View style={styles.cardTitleRow}>
                <Text variant="titleMedium" style={styles.reference}>{transfer.reference_no}</Text>
                <View style={[styles.badge, badgeStyle(transfer.status_key)]}>
                  <Text style={[styles.badgeText, badgeTextStyle(transfer.status_key)]}>{transfer.status_label}</Text>
                </View>
              </View>
              <Text style={styles.routeText}>
                {transfer.from_warehouse?.name ?? 'From warehouse'} <Text style={styles.arrow}>→</Text> {transfer.to_warehouse?.name ?? 'To warehouse'}
              </Text>
              <Text style={styles.muted}>{formatDate(transfer.transfer_date)} • {formatTime(transfer.created_at)}</Text>
              <Text style={styles.muted}>{Number(transfer.item ?? transfer.products?.length ?? 0)} Items • {formatQty(Number(transfer.total_qty ?? 0))} Qty</Text>
              {transfer.status_key === 'pending' && canComplete ? (
                <Button
                  compact
                  mode="outlined"
                  icon="check-circle-outline"
                  style={styles.completeButton}
                  textColor="#159447"
                  onPress={() => setCompleteTarget(transfer)}
                >
                  Complete
                </Button>
              ) : null}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={28} color="#6b7280" />
          </View>
        ))}
      </View>

      {!loading && !items.length ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="swap-horizontal-circle-outline" size={44} color="#9ca3af" />
          <Text style={styles.muted}>No stock movements found.</Text>
        </View>
      ) : null}

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Text>Page {pagination.current_page} of {pagination.last_page}</Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>Next</Button>
        </View>
      ) : null}

      {canCreate ? (
        <FAB
          icon="plus"
          color="#ffffff"
          style={styles.fab}
          onPress={() => router.push('/(drawer)/transfers-create')}
        />
      ) : null}

      <Portal>
        <Dialog visible={completeTarget !== null} onDismiss={() => setCompleteTarget(null)} style={styles.confirmDialog}>
          <Dialog.Title>Complete Stock Movement</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.muted}>
              Complete {completeTarget?.reference_no}? Stock will be deducted from the source warehouse and added to the destination warehouse.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={completing} onPress={() => setCompleteTarget(null)}>Cancel</Button>
            <Button loading={completing} disabled={completing} onPress={() => void completeTransfer()}>Complete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

export default function TransfersRoute() {
  return <TransfersScreen />;
}

function Field({ label, children, compact = false }: { label: string; children: ReactNode; compact?: boolean }) {
  return (
    <View style={[styles.field, compact ? styles.fieldCompact : null]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SelectMenu({
  icon,
  label,
  options,
  onSelect,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  label: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Pressable onPress={() => setVisible(true)} style={styles.selectButton}>
          <View style={styles.selectInner}>
            <MaterialCommunityIcons name={icon} size={22} color="#4b5563" />
            <Text style={styles.selectLabel} numberOfLines={1}>{label}</Text>
            <MaterialCommunityIcons name="chevron-down" size={22} color="#111827" />
          </View>
        </Pressable>
      }
    >
      {options.map((option) => (
        <Menu.Item key={option.value} title={option.label} onPress={() => { onSelect(option.value); setVisible(false); }} />
      ))}
    </Menu>
  );
}

function StepIndicator({ step }: { step: FormStep }) {
  const labels = ['Details', 'Items', 'Review'];

  return (
    <View style={styles.steps}>
      {labels.map((label, index) => {
        const number = (index + 1) as FormStep;
        const active = step >= number;
        return (
          <View key={label} style={styles.stepItem}>
            {index > 0 ? <View style={[styles.stepLine, step >= number ? styles.stepLineActive : null]} /> : null}
            <View style={[styles.stepCircle, active ? styles.stepCircleActive : null]}>
              <Text style={styles.stepNumber}>{number}</Text>
            </View>
            <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CalendarDialog({
  visible,
  value,
  onDismiss,
  onSelect,
  onClear,
}: {
  visible: boolean;
  value: string;
  onDismiss: () => void;
  onSelect: (value: string) => void;
  onClear: () => void;
}) {
  const initialDate = parseDate(value) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  useEffect(() => {
    if (visible) {
      const nextDate = parseDate(value) ?? new Date();
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  }, [value, visible]);

  const days = calendarDays(visibleMonth);
  const selected = parseDate(value);

  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.calendarDialog}>
      <Dialog.Title>Expected Delivery</Dialog.Title>
      <Dialog.Content>
        <View style={styles.calendarHeader}>
          <IconCircleButton
            icon="chevron-left"
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          />
          <Text variant="titleMedium" style={styles.calendarMonth}>{monthLabel(visibleMonth)}</Text>
          <IconCircleButton
            icon="chevron-right"
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          />
        </View>

        <View style={styles.weekRow}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <Text key={day} style={styles.weekLabel}>{day}</Text>
          ))}
        </View>

        <View style={styles.dayGrid}>
          {days.map((day, index) => {
            const active = selected ? sameDate(day, selected) : false;
            const outside = day.getMonth() !== visibleMonth.getMonth();
            return (
              <Pressable
                key={`${day.toISOString()}-${index}`}
                onPress={() => onSelect(formatIsoDate(day))}
                style={[styles.dayButton, active ? styles.dayButtonActive : null]}
              >
                <Text style={[styles.dayText, outside ? styles.dayTextMuted : null, active ? styles.dayTextActive : null]}>
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onClear}>Clear</Button>
        <Button onPress={onDismiss}>Cancel</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

function IconCircleButton({ icon, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.calendarNavButton}>
      <MaterialCommunityIcons name={icon} size={22} color="#111827" />
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function tabLabel(status: StatusFilter) {
  if (status === 'all') return 'All';
  if (status === 'completed') return 'Complete';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function dotStyle(status: StatusFilter) {
  if (status === 'pending') return { backgroundColor: '#f59e0b' };
  if (status === 'completed') return { backgroundColor: '#22c55e' };
  return { backgroundColor: '#ef4444' };
}

function badgeStyle(status: string) {
  return status === 'completed' ? styles.badgeComplete : styles.badgePending;
}

function badgeTextStyle(status: string) {
  return status === 'completed' ? styles.badgeTextComplete : styles.badgeTextPending;
}

function unitOptions(units: Unit[]) {
  return [{ value: 'none', label: 'Select unit' }, ...units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))];
}

function payloadFromTransfer(transfer: Transfer, status: TransferPayload['status']): TransferPayload {
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

function availableStock(product: Product | undefined, warehouseId: string, variantId: string, batchId: string) {
  if (!product || warehouseId === 'none') return 0;

  return (product.warehouse_prices ?? [])
    .filter((stock) => String(stock.warehouse_id) === warehouseId)
    .filter((stock) => variantId === 'none' || String(stock.variant_id ?? 'none') === variantId)
    .filter((stock) => batchId === 'none' || String(stock.product_batch_id ?? 'none') === batchId)
    .reduce((sum, stock) => sum + numberValue(stock.qty), 0);
}

function calculateTotals(lines: DraftLine[]) {
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

function formQuantitySummary(lines: DraftLine[], units: Unit[]) {
  const grouped = lines
    .filter((line) => line.productId !== 'none')
    .reduce((totals, line) => {
      const qty = numberValue(line.qty);
      const unit = unitLabel(units.find((item) => String(item.id) === line.unitId));
      if (qty <= 0 || !unit) return totals;
      totals.set(unit, (totals.get(unit) ?? 0) + qty);
      return totals;
    }, new Map<string, number>());

  return [...grouped.entries()]
    .map(([unit, qty]) => `${formatQty(qty)} ${unit}`)
    .join(' · ') || '-';
}

function lineValue(line: DraftLine) {
  const qty = numberValue(line.qty);
  const cost = numberValue(line.cost);
  return (qty * cost) + ((qty * cost * numberValue(line.taxRate)) / 100);
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

function unitLabel(unit?: Pick<Unit, 'unit_code' | 'unit_name'> | null) {
  return unit?.unit_code || unit?.unit_name || null;
}

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDays(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

const styles = StyleSheet.create({
  listScreen: {
    padding: 14,
    paddingBottom: 96,
    gap: 14,
    backgroundColor: '#ffffff',
  },
  formScreen: {
    padding: 18,
    paddingBottom: 32,
    gap: 18,
    backgroundColor: '#ffffff',
  },
  mobileTopBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    color: '#111827',
  },
  topSpacer: {
    width: 28,
  },
  filterButton: {
    borderRadius: 12,
    borderColor: '#d1d5db',
  },
  searchbar: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 0,
  },
  searchInput: {
    fontSize: 15,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabLabelRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    color: '#4b5563',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#159447',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    width: '82%',
    height: 2,
    backgroundColor: '#159447',
  },
  transferList: {
    gap: 12,
  },
  transferCard: {
    minHeight: 122,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
  },
  transferIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eaf6e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBody: {
    flex: 1,
    gap: 5,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reference: {
    flex: 1,
    color: '#111827',
    fontWeight: '800',
  },
  routeText: {
    color: '#4b5563',
    fontSize: 14,
  },
  arrow: {
    color: '#6b7280',
  },
  muted: {
    color: '#6b7280',
    fontSize: 14,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  badgePending: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  badgeComplete: {
    backgroundColor: '#ecfdf3',
    borderColor: '#bbf7d0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextPending: {
    color: '#d97706',
  },
  badgeTextComplete: {
    color: '#15803d',
  },
  completeButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderColor: '#bbf7d0',
    borderRadius: 999,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 48,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fab: {
    position: 'absolute',
    right: 26,
    bottom: 30,
    borderRadius: 28,
    backgroundColor: '#159447',
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  stepLine: {
    position: 'absolute',
    top: 18,
    left: '-50%',
    right: '50%',
    height: 2,
    backgroundColor: '#d1d5db',
  },
  stepLineActive: {
    backgroundColor: '#159447',
  },
  stepCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6b7280',
  },
  stepCircleActive: {
    backgroundColor: '#159447',
  },
  stepNumber: {
    color: '#ffffff',
    fontWeight: '800',
  },
  stepLabel: {
    color: '#4b5563',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#159447',
    fontWeight: '800',
  },
  formCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  field: {
    gap: 8,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  fieldCompact: {
    flex: 1,
    borderBottomWidth: 0,
    padding: 0,
  },
  fieldLabel: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '500',
  },
  helper: {
    color: '#6b7280',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#ffffff',
  },
  selectButton: {
    borderRadius: 8,
    borderColor: '#d1d5db',
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 56,
    justifyContent: 'center',
  },
  selectInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectLabel: {
    flex: 1,
    color: '#374151',
    fontSize: 16,
    textAlign: 'left',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  nextButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#159447',
  },
  nextButtonContent: {
    flexDirection: 'row-reverse',
  },
  lineCard: {
    padding: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  availableBox: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  availableQty: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  availableLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  availableInStock: {
    color: '#159447',
  },
  availableNoStock: {
    color: '#dc2626',
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    color: '#111827',
    fontWeight: '700',
  },
  stockNotice: {
    margin: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#ecfdf3',
    padding: 12,
  },
  stockNoticeText: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 18,
  },
  reviewItems: {
    padding: 14,
    gap: 10,
  },
  reviewLine: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  calendarDialog: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  confirmDialog: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarMonth: {
    flex: 1,
    textAlign: 'center',
    color: '#111827',
    fontWeight: '700',
  },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayButton: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  dayButtonActive: {
    backgroundColor: '#159447',
  },
  dayText: {
    color: '#111827',
    fontWeight: '600',
  },
  dayTextMuted: {
    color: '#9ca3af',
  },
  dayTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
