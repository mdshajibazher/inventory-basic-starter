import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Button, DataTable, Menu, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { ActivityLogTimeline } from '@/src/components/ActivityLogTimeline';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type PurchaseInvoicePayload, type PurchaseReturnPayload } from '@/src/lib/api';
import type { Product, PurchaseStatus, Supplier, Tax, Unit, Warehouse } from '@/src/types';

type ProductOptions = { taxes?: Tax[]; units?: Unit[] };
type PaymentMode = 'unpaid' | 'partial' | 'paid';

type InvoiceLine = {
  key: string;
  productId: number | null;
  unitId: number | null;
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

const fallbackPurchaseStatuses: PurchaseStatus[] = [
  { id: 1, value: '1', label: 'Received' },
  { id: 2, value: '2', label: 'Partial' },
  { id: 3, value: '3', label: 'Pending' },
];

const emptyLine = (): InvoiceLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: null,
  unitId: null,
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
  purchaseDate: todayDate(),
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
type PurchaseScreenKind = 'purchase' | 'return';

export function PurchaseInvoicesScreen({ mode = 'index', invoiceId, kind = 'purchase' }: { mode?: InvoiceScreenMode; invoiceId?: number; kind?: PurchaseScreenKind }) {
  const { hasPermission } = useAuth();
  const isReturn = kind === 'return';
  const routeBase = isReturn ? 'purchase-return-invoices' : 'purchase-invoices';
  const title = isReturn ? 'Purchase Return' : 'Purchase Invoice';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatuses, setPurchaseStatuses] = useState<PurchaseStatus[]>(fallbackPurchaseStatuses);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState(initialForm);
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === form.warehouseId);
  const selectedPurchaseStatus = purchaseStatuses.find((status) => status.id === form.purchaseStatusId);
  const showReceived = !isReturn && form.purchaseStatusId === PURCHASE_STATUS_PARTIAL;
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
      const response = isReturn ? await api.purchaseReturnInvoices({ perPage: 20 }) : await api.purchaseInvoices({ perPage: 20 });
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
        } else if (field === 'qty' && form.purchaseStatusId === PURCHASE_STATUS_PARTIAL) {
          nextLine.received = boundedReceivedValue(nextLine.received, String(value));
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

  function selectLineUnit(lineKey: string, unitId: number) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => item.id === line.productId);
      if (!product) return { ...line, unitId };

      return {
        ...line,
        unitId,
        cost: String(unitCostForProductUnit(product, unitId, units)),
      };
    }));
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
          ? (() => {
              const unitId = normalizeId(product.purchase_unit_id) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'purchase');
              return {
                ...line,
                productId: product.id,
                unitId,
                cost: String(unitCostForProductUnit(product, unitId, units)),
                taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
                batchNo: isBatchProduct(product) ? firstBatchNoForProduct(product, form.warehouseId) ?? '' : '',
                expiredDate: isBatchProduct(product) ? line.expiredDate : '',
              };
            })()
          : line
      )
    );
  }

  function resetForm() {
    setForm({
      ...initialForm,
      referenceNo: generateReference(),
      purchaseDate: todayDate(),
      supplierId: suppliers[0]?.id ?? null,
      warehouseId: warehouses[0]?.id ?? null,
    });
    setLines([emptyLine()]);
  }

  async function saveInvoice() {
    const payload = buildPayload(form, lines, products, totals, kind);
    if (!payload) return;

    setSaving(true);
    try {
      const batchError = await validateBatchLines(payload.lines, products, payload.warehouse_id);
      if (batchError) {
        Alert.alert('Invalid batch no', batchError);
        return;
      }

      const response = isReturn
        ? editingId
          ? await api.updatePurchaseReturnInvoice(editingId, payload as PurchaseReturnPayload)
          : await api.createPurchaseReturnInvoice(payload as PurchaseReturnPayload)
        : editingId
          ? await api.updatePurchaseInvoice(editingId, payload as PurchaseInvoicePayload)
          : await api.createPurchaseInvoice(payload as PurchaseInvoicePayload);
      Alert.alert(editingId ? 'Invoice updated' : 'Invoice created', response.message);
      setEditingId(null);
      resetForm();
      void loadInvoices();
      router.replace(`/(drawer)/${routeBase}` as any);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Invoice load failed', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function approveInvoice(id: number) {
    setSaving(true);
    try {
      const response = isReturn ? await api.approvePurchaseReturnInvoice(id) : await api.approvePurchaseInvoice(id);
      setSelectedInvoice(response.data as Record<string, any>);
      void loadInvoices();
    } catch (error) {
      Alert.alert('Approval failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function requestApproval(id: number) {
    Alert.alert(
      'Approve Invoice',
      `Approve this ${isReturn ? 'purchase return' : 'purchase invoice'}? This will apply its inventory and financial effects.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void approveInvoice(id) },
      ]
    );
  }

  async function exportInvoicePdf() {
    if (!selectedInvoice?.id || isReturn) return;

    setExportingPdf(true);
    try {
      const response = await api.purchaseInvoicePdf(Number(selectedInvoice.id));
      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

      if (!directory) {
        throw new Error('No writable file directory is available on this device.');
      }

      const referenceNo = String(selectedInvoice.reference_no ?? selectedInvoice.id).replace(/[^a-z0-9-_]+/gi, '-');
      const fileUri = `${directory}purchase-invoice-${referenceNo}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response.data), {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Purchase Invoice',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF exported', `Saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'Unable to export purchase invoice PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      purchaseDate: String(invoice.return_date ?? invoice.purchase_date ?? dateOnly(invoice.created_at) ?? todayDate()),
      supplierId: Number(invoice.supplier_id),
      warehouseId: Number(invoice.warehouse_id),
      purchaseStatusId: Number(invoice.purchase_status_id ?? invoice.status),
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
        productId: Number(line.product_id ?? product?.id ?? 0) || null,
        unitId: normalizeId(line.purchase_unit_id ?? line.unit?.id) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'purchase'),
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
        <View style={styles.headerText}>
          <Text variant="headlineSmall">{editingId ? `Edit ${title}` : title}</Text>
          <Text variant="bodyMedium" style={styles.muted}>{editingId ? 'Update fields and line items' : isReturn ? 'Return purchased stock to a supplier' : 'Receive purchased stock with optional cash payment'}</Text>
        </View>
        <Button compact mode="outlined" loading={loading} disabled={loading} onPress={() => void loadOptions()}>Refresh</Button>
      </View>

      {mode === 'index' ? <View style={styles.panel}>
        <View style={styles.invoiceListHeader}>
          <Text variant="titleMedium">{isReturn ? 'Purchase returns' : 'Purchase invoices'}</Text>
          <View style={styles.rowActions}>
            <Button compact mode="contained" onPress={() => router.push(`/(drawer)/${routeBase}-create` as any)}>Create</Button>
            <Button compact mode="outlined" loading={listLoading} disabled={listLoading} onPress={() => void loadInvoices()}>Refresh</Button>
          </View>
        </View>
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.listItem}>
            <View style={styles.listItemText}>
              <Text variant="titleSmall">{invoice.reference_no}</Text>
              <Text variant="bodySmall" style={styles.muted}>{isReturn ? 'Return' : 'Purchase'} date: {String(invoice.return_date ?? invoice.purchase_date ?? dateOnly(invoice.created_at) ?? '-')}</Text>
              <Text variant="bodySmall" style={styles.muted}>{invoice.supplier?.name ?? '-'} | {money(numberValue(invoice.grand_total))}</Text>
              <View style={styles.listBadgeRow}>
                {!isReturn ? <PurchaseStatusBadge status={invoice.purchase_status?.label ?? invoice.status} /> : null}
                <ApprovalBadge status={invoice.approval_status} />
              </View>
            </View>
            {invoice.can_approve ? <Button compact disabled={saving} onPress={() => requestApproval(Number(invoice.id))}>Approve</Button> : null}
            <Button compact onPress={() => router.push({ pathname: `/(drawer)/${routeBase}-detail` as any, params: { id: String(invoice.id) } })}>Details</Button>
            <Button compact onPress={() => router.push({ pathname: `/(drawer)/${routeBase}-edit` as any, params: { id: String(invoice.id) } })}>Edit</Button>
          </View>
        ))}
        {!invoices.length ? <Text style={styles.muted}>No invoices found.</Text> : null}
      </View> : null}
      {mode === 'details' ? (
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium">{title} details</Text>
            <View style={styles.rowActions}>
              {selectedInvoice?.can_approve ? <Button mode="outlined" disabled={saving} onPress={() => requestApproval(Number(selectedInvoice.id))}>Approve</Button> : null}
              {!isReturn ? <Button mode="outlined" icon="file-pdf-box" loading={exportingPdf} disabled={!selectedInvoice || exportingPdf} onPress={() => void exportInvoicePdf()}>Print</Button> : null}
              <Button mode="outlined" onPress={() => router.push(`/(drawer)/${routeBase}` as any)}>Back</Button>
            </View>
          </View>
          {selectedInvoice ? <PurchaseInvoiceDetails invoice={selectedInvoice} kind={kind} /> : <Text style={styles.muted}>Loading invoice...</Text>}
        </View>
      ) : null}

      {mode !== 'index' && mode !== 'details' ? <>
      <View style={styles.topActions}>
        <Button mode="outlined" disabled={saving} onPress={() => router.push(`/(drawer)/${routeBase}` as any)}>Back</Button>
        <Button mode="outlined" disabled={saving} onPress={resetForm}>Reset</Button>
      </View>
      <View style={styles.panel}>
        <Text variant="titleMedium">Invoice</Text>
        <TextInput mode="outlined" label="Reference no" value={form.referenceNo} onChangeText={(value) => setValue('referenceNo', value)} />
        <DatePickerField label={isReturn ? 'Return date' : 'Purchase date'} value={form.purchaseDate} onChange={(value) => setValue('purchaseDate', value)} />
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
          const unitOptions = productOptionsForFamily(product, units);
          const selectedUnit = unitOptions.find((unit) => unit.id === line.unitId);
          const lineRequiresBatch = isBatchProduct(product);
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
                detailFor={(item) => `Cost ${money(baseUnitCostForProduct(item))} | Qty ${money(numberValue(item.qty ?? item.quantity))}`}
                onSelect={(item) => {
                  setProducts((current) => upsertById(current, item));
                  selectProduct(line.key, item);
                }}
              />
              <View style={styles.formRow}>
                <TextInput mode="outlined" label="Qty" keyboardType="numeric" value={line.qty} onChangeText={(value) => updateLine(line.key, 'qty', value)} style={styles.formField} />
                {showReceived ? <TextInput mode="outlined" label="Received" keyboardType="numeric" value={line.received} onChangeText={(value) => updateLine(line.key, 'received', value)} style={styles.formField} /> : null}
                {product ? (
                  <SelectField
                    label="Unit"
                    valueLabel={selectedUnit ? `${selectedUnit.unit_name} (${selectedUnit.unit_code})` : 'Select unit'}
                    options={unitOptions}
                    keyFor={(unit) => unit.id}
                    labelFor={(unit) => `${unit.unit_name} (${unit.unit_code})`}
                    onSelect={(unit) => selectLineUnit(line.key, unit.id)}
                    style={styles.formField}
                  />
                ) : null}
                <TextInput mode="outlined" label="Unit cost" keyboardType="numeric" value={line.cost} onChangeText={(value) => updateLine(line.key, 'cost', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Discount" keyboardType="numeric" value={line.discount} onChangeText={(value) => updateLine(line.key, 'discount', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Tax %" keyboardType="numeric" value={line.taxRate} onChangeText={(value) => updateLine(line.key, 'taxRate', value)} style={styles.formField} />
                {lineRequiresBatch ? (
                  <>
                    <TextInput mode="outlined" label="Batch no *" value={line.batchNo} onChangeText={(value) => updateLine(line.key, 'batchNo', value)} style={styles.formField} />
                    <DatePickerField label="Expiry *" value={line.expiredDate} onChange={(value) => updateLine(line.key, 'expiredDate', value)} style={styles.formField} />
                  </>
                ) : null}
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

function PurchaseInvoiceDetails({ invoice, kind }: { invoice: Record<string, any>; kind: PurchaseScreenKind }) {
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
    <View style={styles.mobileDetailStack}>
      <View style={styles.mobileInvoiceCard}>
        <View style={styles.mobileInvoiceTop}>
          <View style={styles.invoiceIconCircle}>
            <MaterialCommunityIcons name={isReturn ? 'file-undo-outline' : 'file-document-outline'} size={28} color="#ffffff" />
          </View>
          <View style={styles.invoiceTitleBlock}>
            <Text variant="bodyMedium" style={styles.mobileMuted}>Invoice No</Text>
            <Text variant="titleLarge" style={styles.invoiceNumber}>{String(invoice.reference_no ?? '-')}</Text>
          </View>
          <View style={[styles.mobilePaidBadge, invoice.approval_status === 'pending' && styles.mobilePendingBadge]}>
            <MaterialCommunityIcons name={invoice.approval_status === 'pending' ? 'clock-outline' : 'check-circle'} size={18} color={invoice.approval_status === 'pending' ? '#92400e' : '#079641'} />
            <Text style={[styles.mobilePaidText, invoice.approval_status === 'pending' && styles.mobilePendingText]}>{invoice.approval_status === 'pending' ? 'Pending' : 'Approved'}</Text>
          </View>
        </View>

        <View style={styles.mobileInvoiceDivider} />

        <View style={styles.mobileMetaGrid}>
          <View style={styles.mobileMetaColumn}>
            <MobileMeta icon="account-outline" label="Supplier" value={String(invoice.supplier?.name ?? '-')} />
            <MobileMeta icon="phone-outline" label="Phone" value={String(invoice.supplier?.phone_number ?? '-')} />
            <MobileMeta icon="account-group-outline" label={isReturn ? 'Created By' : 'Purchase Status'} value={String(isReturn ? invoice.user?.name ?? '-' : invoice.purchase_status?.label ?? invoice.status ?? '-')} />
          </View>
          <View style={styles.mobileMetaSeparator} />
          <View style={styles.mobileMetaColumn}>
            <MobileMeta icon="calendar-month-outline" label={isReturn ? 'Return Date' : 'Purchase Date'} value={invoiceDate} />
            <MobileMeta icon="clock-outline" label="Time" value={invoiceTime ?? '-'} />
            <MobileMeta icon="warehouse" label="Warehouse" value={String(invoice.warehouse?.name ?? '-')} />
          </View>
        </View>
      </View>

      <Text variant="titleMedium" style={styles.mobileSectionTitle}>{isReturn ? 'Purchase Return Items' : 'Purchase Items'}</Text>
      <View style={styles.mobileItemsStack}>
        {lines.map((line, index) => (
          <View key={line.id ?? index} style={styles.mobileItemCard}>
            <View style={styles.mobileItemIndex}><Text style={styles.mobileItemIndexText}>{index + 1}</Text></View>
            <ProductThumb line={line} />
            <View style={styles.mobileItemBody}>
              <Text variant="titleSmall" style={styles.mobileItemName} numberOfLines={2}>{invoiceLineProductName(line)}</Text>
              <View style={styles.mobilePillRow}>
                <Text style={styles.variantPill}>{line.variant?.name ?? line.batch?.batch_no ?? '-'}</Text>
                <Text style={styles.skuPill}>SKU: {line.variant?.item_code ?? line.product?.sku ?? line.product?.code ?? '-'}</Text>
              </View>
              <View style={styles.mobileItemFacts}>
                <MobileFact label="Qty" value={money(numberValue(line.qty))} />
                {!isReturn ? <MobileFact label="Received" value={money(numberValue(line.received))} /> : null}
                <MobileFact label="Unit" value={detailLineUnit(line)} />
                <MobileFact label="Unit Cost" value={takaMoney(numberValue(line.net_unit_cost ?? line.net_unit_price ?? line.cost))} />
              </View>
            </View>
            <View style={styles.mobileLineTotal}>
              <Text style={styles.mobileLineTotalLabel}>Line Total</Text>
              <Text style={styles.mobileLineTotalValue}>{takaMoney(numberValue(line.total))}</Text>
              <Text style={styles.mobileLineProfit}>Discount: {takaMoney(numberValue(line.discount))}</Text>
            </View>
          </View>
        ))}
        {!lines.length ? <Text style={styles.muted}>No products found.</Text> : null}
      </View>

      <View style={styles.mobileTwoColumn}>
        <View style={[styles.mobileCard, styles.mobileHalfCard]}>
          <View style={styles.mobileCardTitleRow}>
            <MaterialCommunityIcons name="wallet-outline" size={22} color="#0d6bdf" />
            <Text variant="titleSmall" style={styles.mobileCardTitle}>Payment Information</Text>
          </View>
          <View style={styles.mobileInvoiceDivider} />
          <MobileInfoRow label="Method" value={paymentMethodLabel(payment?.paying_method)} />
          <MobileInfoRow label="Paid Amount" value={isReturn ? '-' : takaMoney(paidAmount)} />
          <MobileInfoRow label="Due Amount" value={isReturn ? '-' : takaMoney(dueAmount)} />
          <MobileInfoRow label="Payment Note" value={String(payment?.payment_note ?? '-')} />
        </View>

        <View style={[styles.mobileCard, styles.mobileHalfCard]}>
          <MobileTotalRow icon="chart-pie" label="Subtotal" value={takaMoney(subtotal)} />
          <MobileTotalRow label="Discount" value={takaMoney(orderDiscount)} />
          <MobileTotalRow label={`VAT (${money(numberValue(invoice.order_tax_rate))}%)`} value={takaMoney(orderTax)} />
          {!isReturn && shippingCost > 0 ? <MobileTotalRow label="Shipping Cost" value={takaMoney(shippingCost)} /> : null}
          <View style={styles.mobileInvoiceDivider} />
          <MobileTotalRow label="Grand Total" value={takaMoney(grandTotal)} strong blue />
          {!isReturn ? <MobileTotalRow label="Paid Amount" value={takaMoney(paidAmount)} /> : null}
          {!isReturn ? <MobileTotalRow label="Due Amount" value={takaMoney(dueAmount)} strong green={dueAmount <= 0} /> : null}
        </View>
      </View>

      <View style={styles.mobileNoteCard}>
        <View style={styles.mobileNoteLeft}>
          <MaterialCommunityIcons name="note-text-outline" size={24} color="#8b45d6" />
          <View>
            <Text style={styles.mobileMuted}>Note</Text>
            <Text variant="titleSmall">{note}</Text>
          </View>
        </View>
        <View style={styles.mobileProfitStatus}>
          <Text style={styles.mobileMuted}>Approval</Text>
          <View style={styles.mobileProfitBadge}>
            <MaterialCommunityIcons name={invoice.approval_status === 'pending' ? 'clock-outline' : 'check-circle'} size={18} color="#079641" />
            <Text style={styles.mobileProfitBadgeText}>{String(invoice.approval_status ?? 'approved')}</Text>
          </View>
        </View>
      </View>

      <ActivityLogTimeline logs={invoice.activity_logs ?? []} />
    </View>
  );
}

function ApprovalBadge({ status }: { status: unknown }) {
  const pending = status === 'pending';

  return (
    <View style={[styles.listBadge, pending ? styles.listApprovalPendingBadge : styles.listApprovalApprovedBadge]}>
      <Text style={[styles.listBadgeText, pending ? styles.listApprovalPendingText : styles.listApprovalApprovedText]}>{pending ? 'Pending' : 'Approved'}</Text>
    </View>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function PurchaseStatusBadge({ status }: { status: unknown }) {
  const normalized = String(status ?? '').toLowerCase();
  const badgeStyle = normalized.includes('received')
    ? styles.listPurchaseReceivedBadge
    : normalized.includes('partial')
      ? styles.listPurchasePartialBadge
      : normalized.includes('pending')
        ? styles.listPurchasePendingBadge
        : styles.listPurchaseDefaultBadge;
  const textStyle = normalized.includes('received')
    ? styles.listPurchaseReceivedText
    : normalized.includes('partial')
      ? styles.listPurchasePartialText
      : normalized.includes('pending')
        ? styles.listPurchasePendingText
        : styles.listPurchaseDefaultText;

  return (
    <View style={[styles.listBadge, badgeStyle]}>
      <Text style={[styles.listBadgeText, textStyle]}>{String(status ?? '-')}</Text>
    </View>
  );
}

function MobileMeta({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.mobileMetaRow}>
      <MaterialCommunityIcons name={icon} size={24} color="#23304f" />
      <View style={styles.mobileMetaText}>
        <Text style={styles.mobileMuted}>{label}</Text>
        <Text variant="titleSmall" numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function ProductThumb({ line }: { line: Record<string, any> }) {
  const imageUrl = line.product?.image_url;
  return (
    <View style={styles.productThumb}>
      {imageUrl ? <Image source={{ uri: String(imageUrl) }} style={styles.productThumbImage} resizeMode="cover" /> : <MaterialCommunityIcons name="package-variant-closed" size={36} color="#8a94a6" />}
    </View>
  );
}

function MobileFact({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.mobileFactText}>
      <Text style={styles.mobileMuted}>{label}: </Text>{value}
    </Text>
  );
}

function MobileInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mobileInfoRow}>
      <Text style={styles.mobileMuted}>{label}</Text>
      <Text style={styles.mobileInfoValue}>{value}</Text>
    </View>
  );
}

function MobileTotalRow({ icon, label, value, strong, blue, green }: { icon?: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; strong?: boolean; blue?: boolean; green?: boolean }) {
  return (
    <View style={styles.mobileTotalRow}>
      <View style={styles.mobileTotalLabelWrap}>
        {icon ? <MaterialCommunityIcons name={icon} size={22} color="#0d6bdf" /> : null}
        <Text style={[styles.mobileTotalLabel, strong && styles.mobileTotalStrongLabel, blue && styles.blueText, green && styles.greenText]}>{label}</Text>
      </View>
      <Text style={[styles.mobileTotalValue, strong && styles.mobileTotalStrongValue, blue && styles.blueText, green && styles.greenText]}>{value}</Text>
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

function buildPayload(form: typeof initialForm, lines: InvoiceLine[], products: Product[], totals: ReturnType<typeof calculateTotals>, kind: PurchaseScreenKind): PurchaseInvoicePayload | PurchaseReturnPayload | null {
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
  if (form.purchaseStatusId === PURCHASE_STATUS_PARTIAL && invoiceLines.some((item) => item.values.received < 0 || item.values.received >= item.values.qty)) {
    Alert.alert('Invalid received quantity', 'For partial purchases, received quantity must be less than ordered quantity.');
    return null;
  }
  if (invoiceLines.some((item) => isBatchProduct(item.product) && (!item.line.batchNo.trim() || (kind === 'purchase' && !item.line.expiredDate.trim())))) {
    Alert.alert('Missing batch details', kind === 'return' ? 'Batch no is required for batch products.' : 'Batch no and expiry date are required for batch products.');
    return null;
  }

  const common = {
    reference_no: form.referenceNo.trim(),
    supplier_id: form.supplierId,
    warehouse_id: form.warehouseId,
    lines: invoiceLines.map(({ line, product, values }) => ({
      product_id: product?.id as number,
      product_code: product?.code ?? null,
      qty: values.qty,
      received: normalizedReceived(form.purchaseStatusId, line),
      batch_no: isBatchProduct(product) ? nullableText(line.batchNo) : null,
      expired_date: isBatchProduct(product) ? nullableText(line.expiredDate) : null,
      purchase_unit: line.unitId,
      net_unit_cost: values.cost,
      discount: values.discount,
      tax_rate: values.taxRate,
      tax: values.tax,
      subtotal: values.subtotal,
    })),
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
    status: form.purchaseStatusId,
    purchase_status_id: form.purchaseStatusId,
    payment_status: paymentStatus(form.paymentMode),
    order_discount: numberValue(form.orderDiscount),
    shipping_cost: numberValue(form.shippingCost),
    paid_by_id: form.paymentMode === 'unpaid' ? null : 1,
    paying_amount: paidAmount,
    paid_amount: paidAmount,
    payment_note: nullableText(form.paymentNote),
  };
}

function calculateTotals(lines: InvoiceLine[], form: typeof initialForm) {
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

function calculateLine(line: InvoiceLine, purchaseStatusId: number) {
  const qty = numberValue(line.qty);
  const received = normalizedReceived(purchaseStatusId, line);
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

function isBatchProduct(product?: Product | null) {
  return product?.is_batch === true || String(product?.is_batch) === '1';
}

function isInvoiceProductSupported(product: Product) {
  return !product.is_variant && product.type !== 'digital';
}

function normalizeId(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
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

function upsertById<T extends { id: number }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
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

function DatePickerField({ label, value, onChange, style }: { label: string; value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle> }) {
  const [visible, setVisible] = useState(false);
  const selectedDate = parseDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const days = calendarDays(visibleMonth);

  function openPicker() {
    setVisibleMonth(startOfMonth(selectedDate ?? new Date()));
    setVisible(true);
  }

  function selectDate(date: Date) {
    onChange(formatDate(date));
    setVisible(false);
  }

  return (
    <View style={style}>
      <TextInput
        dense
        mode="outlined"
        label={label}
        value={value}
        placeholder="YYYY-MM-DD"
        editable={false}
        right={<TextInput.Icon icon="calendar" onPress={openPicker} />}
        onPressIn={openPicker}
      />
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.datePickerModal}>
          <View style={styles.datePickerHeader}>
            <Button compact mode="text" onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))}>Prev</Button>
            <Text variant="titleMedium">{visibleMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <Button compact mode="text" onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))}>Next</Button>
          </View>
          <View style={styles.datePickerWeekdays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} variant="labelSmall" style={styles.datePickerWeekday}>{day}</Text>
            ))}
          </View>
          <View style={styles.datePickerGrid}>
            {days.map((date) => {
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = selectedDate ? formatDate(date) === formatDate(selectedDate) : false;

              return (
                <Pressable key={date.toISOString()} onPress={() => selectDate(date)} style={[styles.datePickerDay, isSelected && styles.datePickerDaySelected]}>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.datePickerDayText,
                      !isCurrentMonth && styles.datePickerDayMuted,
                      isSelected && styles.datePickerDayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Modal>
      </Portal>
    </View>
  );
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

function invoiceLineProductName(line: Record<string, any>) {
  const productName = line.product?.name ?? `#${line.product_id}`;
  return line.variant?.name ? `${productName} - ${line.variant.name}` : productName;
}

function takaMoney(value: number) {
  return `৳${money(value)}`;
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

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayDate() {
  return formatDate(new Date());
}

function dateOnly(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(month: Date) {
  const start = startOfMonth(month);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function generateReference() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `pr-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  header: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  muted: { color: '#666666' },
  pending: { color: '#92400e', fontWeight: '700' },
  approved: { color: '#047857', fontWeight: '700' },
  panel: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', gap: 10, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e5e5e5', backgroundColor: '#ffffff' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  invoiceListHeader: { alignItems: 'stretch', gap: 10 },
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
  listBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  listBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  listBadgeText: { fontSize: 12, fontWeight: '700' },
  listApprovalPendingBadge: { backgroundColor: '#fef3c7' },
  listApprovalPendingText: { color: '#92400e' },
  listApprovalApprovedBadge: { backgroundColor: '#d1fae5' },
  listApprovalApprovedText: { color: '#047857' },
  listPurchaseReceivedBadge: { backgroundColor: '#d1fae5' },
  listPurchaseReceivedText: { color: '#047857' },
  listPurchasePartialBadge: { backgroundColor: '#e0f2fe' },
  listPurchasePartialText: { color: '#075985' },
  listPurchasePendingBadge: { backgroundColor: '#fef3c7' },
  listPurchasePendingText: { color: '#92400e' },
  listPurchaseDefaultBadge: { backgroundColor: '#f3f4f6' },
  listPurchaseDefaultText: { color: '#374151' },
  detailBox: { gap: 6, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eeeeee', backgroundColor: '#fafafa' },
  detailStack: { gap: 12 },
  mobileDetailStack: { gap: 14 },
  mobileInvoiceCard: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e7f0',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  mobileInvoiceTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  invoiceIconCircle: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: '#1670e8' },
  invoiceTitleBlock: { flex: 1, minWidth: 0 },
  invoiceNumber: { color: '#0b66d8', fontWeight: '800' },
  mobilePaidBadge: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#d7f6df' },
  mobilePendingBadge: { backgroundColor: '#fef3c7' },
  mobilePaidText: { color: '#087338', fontSize: 15, fontWeight: '800' },
  mobilePendingText: { color: '#92400e' },
  mobileInvoiceDivider: { height: 1, backgroundColor: '#e7ebf2' },
  mobileMetaGrid: { flexDirection: 'row', gap: 12 },
  mobileMetaColumn: { flex: 1, gap: 14 },
  mobileMetaSeparator: { width: 1, backgroundColor: '#e7ebf2' },
  mobileMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  mobileMetaText: { flex: 1, minWidth: 0 },
  mobileMuted: { color: '#667085', fontSize: 13 },
  mobileSectionTitle: { color: '#071126', fontWeight: '800' },
  mobileItemsStack: { gap: 8 },
  mobileItemCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5eaf2',
    backgroundColor: '#ffffff',
  },
  mobileItemIndex: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#e8f1ff' },
  mobileItemIndexText: { color: '#0b66d8', fontSize: 12, fontWeight: '800' },
  productThumb: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12, backgroundColor: '#f1f4f8' },
  productThumbImage: { width: '100%', height: '100%' },
  mobileItemBody: { flex: 1, minWidth: 0, gap: 6 },
  mobileItemName: { color: '#111827', fontWeight: '800' },
  mobilePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  variantPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#eef2ff', color: '#364ab7', fontSize: 12, fontWeight: '700' },
  skuPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f3f4f6', color: '#4b5563', fontSize: 12, fontWeight: '700' },
  mobileItemFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mobileFactText: { color: '#111827', fontSize: 13, fontWeight: '600' },
  mobileLineTotal: { alignItems: 'flex-end', minWidth: 86 },
  mobileLineTotalLabel: { color: '#667085', fontSize: 12 },
  mobileLineTotalValue: { color: '#0b66d8', fontSize: 16, fontWeight: '800' },
  mobileLineProfit: { color: '#667085', fontSize: 12 },
  mobileTwoColumn: { gap: 10 },
  mobileCard: { gap: 10, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: '#e1e7f0', backgroundColor: '#ffffff' },
  mobileHalfCard: { width: '100%' },
  mobileCardTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  mobileCardTitle: { color: '#071126', fontWeight: '800' },
  mobileInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  mobileInfoValue: { flex: 1, color: '#111827', fontWeight: '700', textAlign: 'right' },
  mobileTotalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  mobileTotalLabelWrap: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  mobileTotalLabel: { color: '#374151', fontWeight: '700' },
  mobileTotalValue: { color: '#111827', fontWeight: '800' },
  mobileTotalStrongLabel: { fontSize: 16 },
  mobileTotalStrongValue: { fontSize: 18 },
  blueText: { color: '#0b66d8' },
  greenText: { color: '#079641' },
  mobileNoteCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: '#e9d5ff', backgroundColor: '#fbf7ff' },
  mobileNoteLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileProfitStatus: { alignItems: 'flex-end', gap: 5 },
  mobileProfitBadge: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#dcfce7' },
  mobileProfitBadgeText: { color: '#087338', fontWeight: '800' },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10, width: '100%', maxWidth: '100%' },
  formField: { minWidth: 0, flexBasis: '46%', flexGrow: 1, flexShrink: 1 },
  datePickerModal: { alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 8, padding: 14, width: '92%', maxWidth: 360 },
  datePickerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  datePickerWeekdays: { flexDirection: 'row', marginBottom: 6 },
  datePickerWeekday: { flex: 1, textAlign: 'center', color: '#666666' },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  datePickerDay: { alignItems: 'center', aspectRatio: 1, flexBasis: '14.2857%', justifyContent: 'center', borderRadius: 6 },
  datePickerDaySelected: { backgroundColor: '#111111' },
  datePickerDayText: { color: '#222222' },
  datePickerDayMuted: { color: '#aaaaaa' },
  datePickerDayTextSelected: { color: '#ffffff' },
  lineTotal: { textAlign: 'right', color: '#333333' },
  summaryTable: { minWidth: 360, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 10 },
});
