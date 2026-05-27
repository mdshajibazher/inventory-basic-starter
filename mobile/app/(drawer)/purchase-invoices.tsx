import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Button, DataTable, Menu, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type PurchaseInvoicePayload } from '@/src/lib/api';
import type { Product, PurchaseStatus, Supplier, Tax, Warehouse } from '@/src/types';

type ProductOptions = { taxes?: Tax[] };
type PaymentMode = 'unpaid' | 'partial' | 'paid';

type InvoiceLine = {
  key: string;
  productId: number | null;
  qty: string;
  received: string;
  cost: string;
  discount: string;
  taxRate: string;
  batchNo: string;
  expiredDate: string;
};

type SelectFieldProps<T> = {
  label: string;
  valueLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  options: T[];
  keyFor: (option: T) => string | number;
  labelFor: (option: T) => string;
  onSelect: (option: T) => void;
};

type SearchableSelectFieldProps<T> = {
  label: string;
  valueLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
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
  productId: null,
  qty: '1',
  received: '1',
  cost: '0',
  discount: '0',
  taxRate: '0',
  batchNo: '',
  expiredDate: '',
});

const initialForm = {
  referenceNo: generateReference(),
  supplierId: null as number | null,
  warehouseId: null as number | null,
  purchaseStatusId: PURCHASE_STATUS_RECEIVED,
  orderTaxRate: '0',
  orderDiscount: '0',
  shippingCost: '0',
  paymentMode: 'unpaid' as PaymentMode,
  paidAmount: '0',
  paymentNote: '',
  note: '',
};

type InvoiceScreenMode = 'index' | 'create' | 'details' | 'edit';

export function PurchaseInvoicesScreen({ mode = 'index', invoiceId }: { mode?: InvoiceScreenMode; invoiceId?: number }) {
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatuses, setPurchaseStatuses] = useState<PurchaseStatus[]>(fallbackPurchaseStatuses);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [form, setForm] = useState(initialForm);
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === form.warehouseId);
  const selectedPurchaseStatus = purchaseStatuses.find((status) => status.id === form.purchaseStatusId);
  const showReceived = form.purchaseStatusId === PURCHASE_STATUS_PARTIAL;
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
        api.suppliers({ perPage: 100, activeOnly: true }),
        api.warehouses({ perPage: 100, activeOnly: true }),
        api.products({ perPage: 100 }),
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
      setForm((current) => ({
        ...current,
        supplierId: current.supplierId ?? nextSuppliers[0]?.id ?? null,
        warehouseId: current.warehouseId ?? nextWarehouses[0]?.id ?? null,
        purchaseStatusId: current.purchaseStatusId ?? nextPurchaseStatuses[0]?.id ?? PURCHASE_STATUS_RECEIVED,
      }));
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
    if (mode === 'index') void loadInvoices();
  }, [loadOptions, mode]);

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
      Alert.alert('Invoice list failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setListLoading(false);
    }
  }

  function setValue<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine<K extends keyof InvoiceLine>(key: string, field: K, value: InvoiceLine[K]) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;

        const nextLine = { ...line, [field]: value };
        if (field === 'qty' && isReceivedQuantitySyncedStatus(form.purchaseStatusId)) {
          nextLine.received = String(value);
        } else if (field === 'received' && form.purchaseStatusId === PURCHASE_STATUS_PARTIAL) {
          nextLine.received = boundedReceivedValue(String(value), nextLine.qty);
        }
        if (isUnreceivedStatus(form.purchaseStatusId)) {
          nextLine.received = '0';
        }
        return nextLine;
      })
    );
  }

  function setPurchaseStatus(statusId: number) {
    setValue('purchaseStatusId', statusId);
    if (isReceivedQuantitySyncedStatus(statusId)) {
      setLines((current) => current.map((line) => ({ ...line, received: line.qty })));
    } else if (isUnreceivedStatus(statusId)) {
      setLines((current) => current.map((line) => ({ ...line, received: '0' })));
    }
  }

  function selectProduct(lineKey: string, product: Product) {
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              productId: product.id,
              cost: String(product.purchase_price ?? product.cost ?? 0),
              taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
            }
          : line
      )
    );
  }

  function resetForm() {
    setForm({
      ...initialForm,
      referenceNo: generateReference(),
      supplierId: suppliers[0]?.id ?? null,
      warehouseId: warehouses[0]?.id ?? null,
    });
    setLines([emptyLine()]);
  }

  async function saveInvoice() {
    const payload = buildPayload(form, lines, products, totals);
    if (!payload) return;

    setSaving(true);
    try {
      const response = editingId
        ? await api.updatePurchaseInvoice(editingId, payload)
        : await api.createPurchaseInvoice(payload);
      Alert.alert(editingId ? 'Invoice updated' : 'Invoice created', response.message);
      setEditingId(null);
      resetForm();
      void loadInvoices();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Invoice load failed', error instanceof Error ? error.message : 'Try again.');
    }
  }

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      supplierId: Number(invoice.supplier_id),
      warehouseId: Number(invoice.warehouse_id),
      purchaseStatusId: Number(invoice.purchase_status_id ?? invoice.status),
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
        productId: Number(line.product_id ?? product?.id ?? 0) || null,
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

  if (!hasPermission('purchases-add')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">{editingId ? 'Edit Purchase Invoice' : 'Purchase Invoice'}</Text>
          <Text variant="bodyMedium" style={styles.muted}>{editingId ? 'Update invoice fields and line items' : 'Receive purchased stock with optional cash payment'}</Text>
        </View>
        <Button mode="outlined" loading={loading} disabled={loading} onPress={() => void loadOptions()}>Refresh</Button>
      </View>

      {mode === 'index' ? <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium">Purchase invoices</Text>
          <View style={styles.rowActions}>
            <Button mode="contained" onPress={() => router.push('/(drawer)/purchase-invoices-create')}>Create</Button>
            <Button mode="outlined" loading={listLoading} disabled={listLoading} onPress={() => void loadInvoices()}>Refresh</Button>
          </View>
        </View>
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.listItem}>
            <View style={styles.listItemText}>
              <Text variant="titleSmall">{invoice.reference_no}</Text>
              <Text variant="bodySmall" style={styles.muted}>{invoice.supplier?.name ?? '-'} | {money(numberValue(invoice.grand_total))}</Text>
            </View>
            <Button compact onPress={() => router.push({ pathname: '/(drawer)/purchase-invoices-detail', params: { id: String(invoice.id) } })}>Details</Button>
            <Button compact onPress={() => router.push({ pathname: '/(drawer)/purchase-invoices-edit', params: { id: String(invoice.id) } })}>Edit</Button>
          </View>
        ))}
        {!invoices.length ? <Text style={styles.muted}>No invoices found.</Text> : null}
      </View> : null}
      {mode === 'details' ? (
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium">Purchase invoice details</Text>
            <Button mode="outlined" onPress={() => router.push('/(drawer)/purchase-invoices')}>Back</Button>
          </View>
          {selectedInvoice ? <PurchaseInvoiceDetails invoice={selectedInvoice} /> : <Text style={styles.muted}>Loading invoice...</Text>}
        </View>
      ) : null}

      {mode !== 'index' && mode !== 'details' ? <>
      <View style={styles.topActions}>
        <Button mode="outlined" disabled={saving} onPress={() => router.push('/(drawer)/purchase-invoices')}>Back</Button>
        <Button mode="outlined" disabled={saving} onPress={resetForm}>Reset</Button>
      </View>
      <View style={styles.panel}>
        <Text variant="titleMedium">Invoice</Text>
        <TextInput mode="outlined" label="Reference no" value={form.referenceNo} onChangeText={(value) => setValue('referenceNo', value)} />
        <SearchableSelectField
          label="Supplier"
          valueLabel={selectedSupplier?.name ?? 'Select supplier'}
          placeholder="Search suppliers"
          search={searchSuppliers}
          keyFor={(supplier) => supplier.id}
          labelFor={(supplier) => supplier.name}
          detailFor={(supplier) => supplier.phone_number || supplier.email || supplier.city}
          onSelect={(supplier) => {
            setSuppliers((current) => upsertById(current, supplier));
            setValue('supplierId', supplier.id);
          }}
        />
        <SearchableSelectField
          label="Warehouse"
          valueLabel={selectedWarehouse?.name ?? 'Select warehouse'}
          placeholder="Search warehouses"
          search={searchWarehouses}
          keyFor={(warehouse) => warehouse.id}
          labelFor={(warehouse) => warehouse.name}
          detailFor={(warehouse) => warehouse.address || warehouse.email || warehouse.phone || ''}
          onSelect={(warehouse) => {
            setWarehouses((current) => upsertById(current, warehouse));
            setValue('warehouseId', warehouse.id);
          }}
        />
        <SelectField
          label="Purchase Status"
          valueLabel={selectedPurchaseStatus?.label ?? 'Select purchase status'}
          options={purchaseStatuses}
          keyFor={(status) => status.id}
          labelFor={(status) => status.label}
          onSelect={(status) => setPurchaseStatus(status.id)}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium">Products</Text>
          <Button mode="contained-tonal" onPress={() => setLines((current) => [...current, emptyLine()])}>Add line</Button>
        </View>
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId);
          const lineTotal = calculateLine(line, form.purchaseStatusId).subtotal;
          return (
            <View key={line.key} style={styles.lineCard}>
              <View style={styles.sectionHeader}>
                <Text variant="titleSmall">Line {index + 1}</Text>
                <Button compact mode="text" disabled={lines.length === 1} onPress={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.key !== line.key))}>Remove</Button>
              </View>
              <SearchableSelectField
                label="Product"
                valueLabel={product ? `${product.name} (${product.code})` : 'Select product'}
                placeholder="Search products"
                search={searchProducts}
                keyFor={(item) => item.id}
                labelFor={(item) => `${item.name} (${item.code})`}
                detailFor={(item) => `Cost ${money(numberValue(item.purchase_price ?? item.cost))} | Qty ${money(numberValue(item.qty ?? item.quantity))}`}
                onSelect={(item) => {
                  setProducts((current) => upsertById(current, item));
                  selectProduct(line.key, item);
                }}
              />
              <View style={styles.formRow}>
                <TextInput mode="outlined" label="Qty" keyboardType="numeric" value={line.qty} onChangeText={(value) => updateLine(line.key, 'qty', value)} style={styles.formField} />
                {showReceived ? <TextInput mode="outlined" label="Received" keyboardType="numeric" value={line.received} onChangeText={(value) => updateLine(line.key, 'received', value)} style={styles.formField} /> : null}
                <TextInput mode="outlined" label="Unit cost" keyboardType="numeric" value={line.cost} onChangeText={(value) => updateLine(line.key, 'cost', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Discount" keyboardType="numeric" value={line.discount} onChangeText={(value) => updateLine(line.key, 'discount', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Tax %" keyboardType="numeric" value={line.taxRate} onChangeText={(value) => updateLine(line.key, 'taxRate', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Batch no" value={line.batchNo} onChangeText={(value) => updateLine(line.key, 'batchNo', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Expiry YYYY-MM-DD" value={line.expiredDate} onChangeText={(value) => updateLine(line.key, 'expiredDate', value)} style={styles.formField} />
              </View>
              <Text variant="bodyMedium" style={styles.lineTotal}>Line total: {money(lineTotal)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text variant="titleMedium">Adjustments</Text>
        <View style={styles.formRow}>
          <TextInput mode="outlined" label="Order tax %" keyboardType="numeric" value={form.orderTaxRate} onChangeText={(value) => setValue('orderTaxRate', value)} style={styles.formField} />
          <TextInput mode="outlined" label="Order discount" keyboardType="numeric" value={form.orderDiscount} onChangeText={(value) => setValue('orderDiscount', value)} style={styles.formField} />
          <TextInput mode="outlined" label="Shipping cost" keyboardType="numeric" value={form.shippingCost} onChangeText={(value) => setValue('shippingCost', value)} style={styles.formField} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text variant="titleMedium">Payment</Text>
        <SelectField
          label="Payment status"
          valueLabel={paymentLabel(form.paymentMode)}
          options={[
            { id: 'unpaid' as PaymentMode, name: 'Unpaid' },
            { id: 'partial' as PaymentMode, name: 'Partial cash' },
            { id: 'paid' as PaymentMode, name: 'Paid cash' },
          ]}
          keyFor={(option) => option.id}
          labelFor={(option) => option.name}
          onSelect={(option) => setValue('paymentMode', option.id)}
        />
        {form.paymentMode === 'partial' ? (
          <TextInput mode="outlined" label="Paid amount" keyboardType="numeric" value={form.paidAmount} onChangeText={(value) => setValue('paidAmount', value)} />
        ) : null}
        <TextInput mode="outlined" label="Payment note" value={form.paymentNote} onChangeText={(value) => setValue('paymentNote', value)} />
      </View>

      <View style={styles.panel}>
        <Text variant="titleMedium">Notes</Text>
        <TextInput mode="outlined" label="Purchase note" multiline value={form.note} onChangeText={(value) => setValue('note', value)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.summaryTable}>
          <DataTable.Row><DataTable.Cell>Total qty</DataTable.Cell><DataTable.Cell numeric>{money(totals.totalQty)}</DataTable.Cell></DataTable.Row>
          <DataTable.Row><DataTable.Cell>Items subtotal</DataTable.Cell><DataTable.Cell numeric>{money(totals.totalCost)}</DataTable.Cell></DataTable.Row>
          <DataTable.Row><DataTable.Cell>Discount</DataTable.Cell><DataTable.Cell numeric>{money(totals.totalDiscount)}</DataTable.Cell></DataTable.Row>
          <DataTable.Row><DataTable.Cell>Order tax</DataTable.Cell><DataTable.Cell numeric>{money(totals.orderTax)}</DataTable.Cell></DataTable.Row>
          <DataTable.Row><DataTable.Cell>Grand total</DataTable.Cell><DataTable.Cell numeric>{money(totals.grandTotal)}</DataTable.Cell></DataTable.Row>
        </DataTable>
      </ScrollView>

      <View style={styles.actions}>
        <Button mode="contained" loading={saving} disabled={saving || loading} onPress={saveInvoice}>{editingId ? 'Update invoice' : 'Create invoice'}</Button>
      </View>
      </> : null}
    </Screen>
  );
}

export default function PurchaseInvoicesIndexScreen() {
  return <PurchaseInvoicesScreen mode="index" />;
}

function PurchaseInvoiceDetails({ invoice }: { invoice: Record<string, any> }) {
  return (
    <View style={styles.detailBox}>
      <Text variant="titleSmall">{invoice.reference_no}</Text>
      <Text style={styles.muted}>{invoice.supplier?.name ?? '-'}</Text>
      <Text>Grand total: {money(numberValue(invoice.grand_total))}</Text>
      {(invoice.products ?? []).map((line: Record<string, any>) => (
        <Text key={line.id} style={styles.muted}>
          {line.product?.name ?? `#${line.product_id}`} | Qty {money(numberValue(line.qty))} | Received {money(numberValue(line.received))}
        </Text>
      ))}
    </View>
  );
}

function SelectField<T>({ label, valueLabel, disabled, style, options, keyFor, labelFor, onSelect }: SelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.selectField, style]}>
      <Text variant="labelMedium" style={styles.fieldLabel}>{label}</Text>
      <Menu visible={visible} onDismiss={() => setVisible(false)} anchor={<Button mode="outlined" disabled={disabled} contentStyle={styles.selectButton} onPress={() => setVisible(true)}>{valueLabel}</Button>}>
        {options.map((option) => (
          <Menu.Item key={keyFor(option)} title={labelFor(option)} onPress={() => { onSelect(option); setVisible(false); }} />
        ))}
      </Menu>
    </View>
  );
}

function SearchableSelectField<T>({ label, valueLabel, disabled, style, placeholder, search, keyFor, labelFor, detailFor, onSelect }: SearchableSelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timeout);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    search(debouncedQuery)
      .then((nextOptions) => {
        if (!cancelled) setOptions(nextOptions);
      })
      .catch((error) => {
        if (!cancelled) Alert.alert('Search failed', error instanceof Error ? error.message : 'Try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, search, visible]);

  function open() {
    setQuery('');
    setDebouncedQuery('');
    setVisible(true);
  }

  return (
    <View style={[styles.selectField, style]}>
      <Text variant="labelMedium" style={styles.fieldLabel}>{label}</Text>
      <Button mode="outlined" disabled={disabled} contentStyle={styles.selectButton} onPress={open}>{valueLabel}</Button>
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.searchModal}>
          <View style={styles.searchModalContent}>
            <Text variant="titleMedium">{label}</Text>
            <Searchbar value={query} onChangeText={setQuery} placeholder={placeholder} loading={loading} style={styles.searchbar} inputStyle={styles.searchbarInput} />
            {loading ? <ActivityIndicator style={styles.searchLoading} /> : null}
            <FlatList
              data={options}
              keyExtractor={(item) => String(keyFor(item))}
              keyboardShouldPersistTaps="handled"
              style={styles.searchList}
              ListEmptyComponent={!loading ? <Text style={styles.emptySearch}>No matches found.</Text> : null}
              renderItem={({ item }) => {
                const detail = detailFor?.(item);
                return (
                  <Button mode="text" contentStyle={styles.searchResultButton} labelStyle={styles.searchResultLabel} onPress={() => { onSelect(item); setVisible(false); }}>
                    {detail ? `${labelFor(item)}\n${detail}` : labelFor(item)}
                  </Button>
                );
              }}
            />
            <Button mode="outlined" onPress={() => setVisible(false)}>Close</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

function buildPayload(form: typeof initialForm, lines: InvoiceLine[], products: Product[], totals: ReturnType<typeof calculateTotals>): PurchaseInvoicePayload | null {
  if (!form.referenceNo.trim()) {
    Alert.alert('Missing reference', 'Reference no is required.');
    return null;
  }
  if (!form.supplierId || !form.warehouseId) {
    Alert.alert('Missing invoice fields', 'Supplier and warehouse are required.');
    return null;
  }

  const invoiceLines = lines.map((line) => ({ line, product: products.find((item) => item.id === line.productId), values: calculateLine(line, form.purchaseStatusId) }));
  if (invoiceLines.some((item) => !item.product)) {
    Alert.alert('Missing product', 'Every invoice line must have a product.');
    return null;
  }
  if (invoiceLines.some((item) => item.values.qty <= 0)) {
    Alert.alert('Invalid quantity', 'Line quantities must be greater than zero.');
    return null;
  }
  if (form.purchaseStatusId === PURCHASE_STATUS_PARTIAL && invoiceLines.some((item) => item.values.received < 0 || item.values.received > item.values.qty)) {
    Alert.alert('Invalid received quantity', 'Received quantity must be between zero and ordered quantity.');
    return null;
  }
  if (invoiceLines.some((item) => item.line.batchNo.trim() && !item.line.expiredDate.trim())) {
    Alert.alert('Missing expiry', 'Expiry date is required when batch no is set.');
    return null;
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);
  return {
    reference_no: form.referenceNo.trim(),
    supplier_id: form.supplierId,
    warehouse_id: form.warehouseId,
    status: form.purchaseStatusId,
    purchase_status_id: form.purchaseStatusId,
    payment_status: paymentStatus(form.paymentMode),
    lines: invoiceLines.map(({ line, product, values }) => ({
      product_id: product?.id as number,
      product_code: product?.code ?? null,
      qty: values.qty,
      received: normalizedReceived(form.purchaseStatusId, line),
      batch_no: nullableText(line.batchNo),
      expired_date: nullableText(line.expiredDate),
      purchase_unit: product?.purchase_unit_id ?? null,
      net_unit_cost: values.cost,
      discount: values.discount,
      tax_rate: values.taxRate,
      tax: values.tax,
      subtotal: values.subtotal,
    })),
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

function calculateTotals(lines: InvoiceLine[], form: typeof initialForm) {
  const lineTotals = lines.map((line) => calculateLine(line, form.purchaseStatusId));
  const totalQty = round2(lineTotals.reduce((sum, line) => sum + line.qty, 0));
  if (form.purchaseStatusId === PURCHASE_STATUS_ORDERED) {
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

function calculateLine(line: InvoiceLine, purchaseStatusId: number) {
  const qty = numberValue(line.qty);
  const received = normalizedReceived(purchaseStatusId, line);
  const cost = numberValue(line.cost);
  const discount = numberValue(line.discount);
  const taxRate = numberValue(line.taxRate);
  if (purchaseStatusId === PURCHASE_STATUS_ORDERED) {
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
  return mode === 'paid' ? 2 : 1;
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

function paymentLabel(mode: PaymentMode) {
  if (mode === 'paid') return 'Paid cash';
  if (mode === 'partial') return 'Partial cash';
  return 'Unpaid';
}

function taxForProduct(product: Product, taxes: Tax[]) {
  return Number(taxes.find((tax) => tax.id === product.tax_id)?.rate ?? 0);
}

function isInvoiceProductSupported(product: Product) {
  return !product.is_variant && product.type !== 'digital';
}

function upsertById<T extends { id: number }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
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

const styles = StyleSheet.create({
  screen: { gap: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  muted: { color: '#666666' },
  panel: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', gap: 10, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e5e5e5', backgroundColor: '#ffffff' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  selectField: { width: '100%', maxWidth: '100%', flexShrink: 1 },
  fieldLabel: { marginBottom: 4, color: '#333333' },
  selectButton: { justifyContent: 'flex-start', width: '100%' },
  searchModal: { maxHeight: '86%', margin: 18, borderRadius: 8, backgroundColor: '#ffffff' },
  searchModalContent: { gap: 12, padding: 16 },
  searchbar: { height: 44, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.24)', backgroundColor: '#ffffff' },
  searchbarInput: { minHeight: 0, paddingVertical: 0 },
  searchLoading: { paddingVertical: 8 },
  searchList: { maxHeight: 360 },
  searchResultButton: { minHeight: 56, justifyContent: 'flex-start', alignItems: 'center', paddingVertical: 8 },
  searchResultLabel: { width: '100%', textAlign: 'left', lineHeight: 20 },
  emptySearch: { paddingVertical: 24, textAlign: 'center', color: '#666666' },
  lineCard: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eeeeee', backgroundColor: '#fafafa' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eeeeee' },
  listItemText: { flex: 1, minWidth: 0 },
  detailBox: { gap: 6, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eeeeee', backgroundColor: '#fafafa' },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10, width: '100%', maxWidth: '100%' },
  formField: { minWidth: 0, flexBasis: '46%', flexGrow: 1, flexShrink: 1 },
  lineTotal: { textAlign: 'right', color: '#333333' },
  summaryTable: { minWidth: 360, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  rowActions: { flexDirection: 'row', gap: 8 },
  topActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 10 },
});
