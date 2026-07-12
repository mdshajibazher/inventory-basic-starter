import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Button, DataTable, Menu, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { ActivityLogTimeline } from '@/src/components/ActivityLogTimeline';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type ReturnInvoicePayload, type SalesInvoicePayload } from '@/src/lib/api';
import type { Customer, Product, ProductVariant, Tax, Unit, Warehouse } from '@/src/types';

type ProductOptions = {
  taxes?: Tax[];
  units?: Unit[];
};

type InvoiceLine = {
  key: string;
  productId: number | null;
  variantId: number | null;
  unitId: number | null;
  batchNo: string;
  qty: string;
  price: string;
  discount: string;
  taxRate: string;
};

type PaymentMode = 'unpaid' | 'partial' | 'paid';

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

const emptyLine = (): InvoiceLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: null,
  variantId: null,
  unitId: null,
  batchNo: '',
  qty: '1',
  price: '0',
  discount: '0',
  taxRate: '0',
});

type InvoiceScreenMode = 'index' | 'create' | 'details' | 'edit';
type InvoiceKind = 'sales' | 'returns';

const initialForm = (kind: InvoiceKind = 'sales') => ({
  referenceNo: generateReference(kind),
  invoiceDate: todayDate(),
  customerId: null as number | null,
  warehouseId: null as number | null,
  orderTaxRate: '0',
  orderDiscount: '0',
  shippingCost: '0',
  paymentMode: 'unpaid' as PaymentMode,
  paidAmount: '0',
  paymentNote: '',
  saleNote: '',
  staffNote: '',
});
type FormState = ReturnType<typeof initialForm>;

export function SalesInvoicesScreen({ mode = 'index', invoiceId, kind = 'sales' }: { mode?: InvoiceScreenMode; invoiceId?: number; kind?: InvoiceKind }) {
  const { hasPermission, user } = useAuth();
  const labels = invoiceLabels(kind);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState(() => initialForm(kind));
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoices, setInvoices] = useState<Record<string, any>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === form.warehouseId);
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
      const [customerResponse, warehouseResponse, productResponse, productOptionsResponse] =
        await Promise.all([
          api.customers({ perPage: 100 }),
          api.warehouses({ perPage: 100, activeOnly: true }),
          api.products({ perPage: 100 }),
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
        customerId: current.customerId ?? nextCustomers[0]?.id ?? null,
        warehouseId: current.warehouseId ?? nextWarehouses[0]?.id ?? null,
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
      const response = kind === 'returns'
        ? await api.returnInvoices({ perPage: 20 })
        : await api.salesInvoices({ perPage: 20 });
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
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function selectLineUnit(lineKey: string, unitId: number) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => item.id === line.productId);
      if (kind === 'returns' || !product) return { ...line, unitId };

      return {
        ...line,
        unitId,
        price: String(unitPriceForProductUnit(product, unitId, units)),
      };
    }));
  }

  function selectWarehouse(warehouse: Warehouse) {
    const warehouseChanged = form.warehouseId !== warehouse.id;

    setWarehouses((current) => upsertById(current, warehouse));
    setForm((current) => ({ ...current, warehouseId: warehouse.id }));
    if (kind === 'returns') return;

    if (warehouseChanged) {
      setLines([emptyLine()]);
    }
  }

  function selectProduct(lineKey: string, product: Product) {
    if (!form.warehouseId) {
      Alert.alert('Select warehouse first', 'Choose a warehouse before selecting products.');
      return;
    }

    const availableQty = warehouseStockForProduct(product, form.warehouseId);
    if (kind === 'sales' && !isVariantProduct(product) && availableQty <= 0) {
      Alert.alert('No stock available', `${product.name} has no stock in ${selectedWarehouse?.name ?? 'the selected warehouse'}.`);
      return;
    }

    setProducts((current) => upsertById(current, product));
    setLines((current) =>
      current.map((line) => {
        if (line.key !== lineKey) return line;

        const unitId = normalizeId(product.sale_unit_id) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');

        return {
          ...line,
          productId: product.id,
          variantId: null,
          unitId,
          batchNo: isBatchProduct(product) ? firstBatchNoForProduct(product, form.warehouseId) ?? '' : '',
          price: kind === 'sales' ? String(unitPriceForProductUnit(product, unitId, units)) : line.price,
          taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
        };
      })
    );
  }

  function selectVariant(lineKey: string, variantId: number) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;

      const product = products.find((item) => item.id === line.productId);
      const variant = productVariantById(product, variantId);
      const unitId = line.unitId ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');

      if (product && variant && kind === 'sales' && warehouseStockForProduct(product, form.warehouseId, variant.variant_id) <= 0) {
        Alert.alert('No stock available', `${product.name} - ${variant.name} has no stock in ${selectedWarehouse?.name ?? 'the selected warehouse'}.`);
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
      ...initialForm(kind),
      invoiceDate: todayDate(),
      customerId: customers[0]?.id ?? null,
      warehouseId: warehouses[0]?.id ?? null,
    });
    setLines([emptyLine()]);
  }

  async function saveInvoice() {
    const payload = buildPayload(form, lines, products, totals, kind);
    if (!payload) return;

    setSaving(true);
    try {
      const batchError = kind === 'sales'
        ? await fillBatchIds(payload.lines, products, payload.warehouse_id)
        : null;
      if (batchError) {
        Alert.alert('Invalid batch no', batchError);
        return;
      }

      const response = kind === 'returns'
        ? editingId
          ? await api.updateReturnInvoice(editingId, payload as ReturnInvoicePayload)
          : await api.createReturnInvoice(payload as ReturnInvoicePayload)
        : editingId
          ? await api.updateSalesInvoice(editingId, payload as SalesInvoicePayload)
          : await api.createSalesInvoice(payload as SalesInvoicePayload);
      Alert.alert(editingId ? 'Invoice updated' : 'Invoice created', response.message);
      setEditingId(null);
      resetForm();
      void loadInvoices();
      router.push(labels.indexRoute);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Invoice load failed', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function approveInvoice(id: number) {
    setSaving(true);
    try {
      const response = kind === 'returns' ? await api.approveReturnInvoice(id) : await api.approveSalesInvoice(id);
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
      `Approve this ${kind === 'returns' ? 'return invoice' : 'sales invoice'}? This will apply its inventory and financial effects.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void approveInvoice(id) },
      ]
    );
  }

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      invoiceDate: String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? todayDate()),
      customerId: Number(invoice.customer_id),
      warehouseId: Number(invoice.warehouse_id),
      orderTaxRate: String(invoice.order_tax_rate ?? '0'),
      orderDiscount: String(invoice.order_discount ?? '0'),
      shippingCost: String(invoice.shipping_cost ?? '0'),
      paymentMode: paymentModeFromStatus(Number(invoice.payment_status), Number(invoice.paid_amount)),
      paidAmount: String(invoice.paid_amount ?? '0'),
      paymentNote: invoice.payments?.[0]?.payment_note ?? '',
      saleNote: invoice.return_note ?? invoice.sale_note ?? '',
      staffNote: invoice.staff_note ?? '',
    });
    const nextLines = (invoice.products ?? []).map((line: Record<string, any>) => {
      const product = line.product as Product | undefined;
      if (product) setProducts((current) => upsertById(current, product));
      return {
        key: String(line.id ?? `${Date.now()}-${Math.random()}`),
        productId: Number(line.product_id ?? product?.id ?? 0) || null,
        variantId: normalizeId(line.variant_id ?? line.variant?.id),
        unitId: normalizeId(line.sale_unit_id ?? line.unit?.id) ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale'),
        qty: String(line.qty ?? '1'),
        batchNo: line.batch?.batch_no ?? '',
        price: String(line.net_unit_price ?? '0'),
        discount: String(line.discount ?? '0'),
        taxRate: String(line.tax_rate ?? '0'),
      };
    });
    setLines(nextLines.length ? nextLines : [emptyLine()]);
  }

  const allowed = kind === 'returns'
    ? (mode === 'create' && hasPermission('returns-add')) ||
      (mode === 'edit' && hasPermission('returns-edit')) ||
      ((mode === 'index' || mode === 'details') && (hasPermission('returns-index') || hasPermission('returns-add') || hasPermission('returns-edit') || hasPermission('returns-show')))
    : hasPermission('sales-add');

  if (!allowed) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={mode === 'details' ? styles.mobileDetailHeader : styles.header}>
        <View>
          <Text variant={mode === 'details' ? 'headlineMedium' : 'headlineSmall'} style={mode === 'details' ? styles.mobileDetailTitle : undefined}>
            {mode === 'details' ? `${kind === 'returns' ? 'Return' : 'Sales'} Details` : editingId ? `Edit ${labels.title}` : labels.title}
          </Text>
          {mode !== 'details' ? (
            <Text variant="bodyMedium" style={styles.muted}>
              {editingId ? 'Update invoice fields and line items' : labels.description}
            </Text>
          ) : null}
        </View>
        {mode === 'details' ? (
          <Button compact mode="text" icon="arrow-left" onPress={() => router.push(labels.indexRoute)}>Back</Button>
        ) : (
          <Button mode="outlined" loading={loading} disabled={loading} onPress={() => void loadOptions()}>
            Refresh
          </Button>
        )}
      </View>

      {mode === 'index' ? <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium">{labels.plural}</Text>
          <View style={styles.rowActions}>
            <Button mode="contained" onPress={() => router.push(labels.createRoute)}>Create</Button>
            <Button mode="outlined" loading={listLoading} disabled={listLoading} onPress={() => void loadInvoices()}>Refresh</Button>
          </View>
        </View>
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.listItem}>
            <View style={styles.listItemText}>
              <Text variant="titleSmall">{invoice.reference_no}</Text>
              <Text variant="bodySmall" style={styles.muted}>{kind === 'returns' ? 'Return date' : 'Sale date'}: {String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-')}</Text>
              <Text variant="bodySmall" style={styles.muted}>{invoice.customer?.name ?? '-'} | {money(numberValue(invoice.grand_total))}</Text>
              <Text variant="bodySmall" style={invoice.approval_status === 'pending' ? styles.pending : styles.approved}>{invoice.approval_status === 'pending' ? 'Pending approval' : 'Approved'}</Text>
            </View>
            {invoice.can_approve ? <Button compact disabled={saving} onPress={() => requestApproval(Number(invoice.id))}>Approve</Button> : null}
            <Button compact onPress={() => router.push({ pathname: labels.detailRoute, params: { id: String(invoice.id) } })}>Details</Button>
            <Button compact onPress={() => router.push({ pathname: labels.editRoute, params: { id: String(invoice.id) } })}>Edit</Button>
          </View>
        ))}
        {!invoices.length ? <Text style={styles.muted}>No invoices found.</Text> : null}
      </View> : null}
      {mode === 'details' ? (
        selectedInvoice ? (
          <InvoiceDetails invoice={selectedInvoice} kind={kind} canEditCost={hasPermission('sales-edit')} onInvoiceUpdated={setSelectedInvoice} />
        ) : (
          <View style={styles.mobileCard}><Text style={styles.muted}>Loading invoice...</Text></View>
        )
      ) : null}

      {mode !== 'index' && mode !== 'details' ? <>
      <View style={styles.topActions}>
        <Button mode="outlined" disabled={saving} onPress={() => router.push(labels.indexRoute)}>Back</Button>
        <Button mode="outlined" disabled={saving} onPress={resetForm}>Reset</Button>
      </View>
      <View style={styles.panel}>
        <Text variant="titleMedium">Invoice</Text>
        <TextInput mode="outlined" label="Reference no" value={form.referenceNo} onChangeText={(value) => setValue('referenceNo', value)} />
        <DatePickerField label={kind === 'returns' ? 'Return date' : 'Sale date'} value={form.invoiceDate} onChange={(value) => setValue('invoiceDate', value)} />
        <SearchableSelectField
          label="Customer"
          valueLabel={selectedCustomer?.name ?? 'Select customer'}
          placeholder="Search customers"
          search={searchCustomers}
          keyFor={(customer) => customer.id}
          labelFor={(customer) => customer.name}
          detailFor={(customer) => customer.phone_number || customer.email || customer.city}
          onSelect={(customer) => {
            setCustomers((current) => upsertById(current, customer));
            setValue('customerId', customer.id);
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
          onSelect={selectWarehouse}
        />
        <TextInput mode="outlined" label="Branch" value={currentBranchLabel} editable={false} />
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium">Products</Text>
          <Button mode="contained-tonal" onPress={addLine}>Add line</Button>
        </View>
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId);
          const selectedVariant = productVariantById(product, line.variantId);
          const unitOptions = productOptionsForFamily(product, units);
          const selectedUnit = unitOptions.find((unit) => unit.id === line.unitId);
          const lineRequiresBatch = isBatchProduct(product);
          const lineTotal = calculateLine(line).subtotal;
          const currentStock = product && (!isVariantProduct(product) || selectedVariant)
            ? currentStockLabel(product, form.warehouseId, selectedVariant?.variant_id)
            : null;
          return (
            <View key={line.key} style={styles.lineCard}>
              <View style={styles.sectionHeader}>
                <Text variant="titleSmall">Line {index + 1}</Text>
                <Button compact mode="text" disabled={lines.length === 1} onPress={() => removeLine(line.key)}>
                  Remove
                </Button>
              </View>
              <SearchableSelectField
                label="Product"
                valueLabel={productLabel(product, selectedVariant)}
                placeholder="Search products"
                search={searchProducts}
                keyFor={(item) => item.id}
                labelFor={(item) => `${item.name} (${item.code})`}
                detailFor={(item) => (
                  isVariantProduct(item)
                    ? `Base price ${money(baseUnitPriceForProduct(item))} | Select variant for stock`
                    : `Base price ${money(baseUnitPriceForProduct(item))} | Qty ${money(warehouseStockForProduct(item, form.warehouseId))}`
                )}
                onSelect={(item) => {
                  selectProduct(line.key, item);
                }}
              />
              {currentStock && !isVariantProduct(product) ? (
                <Text variant="bodySmall" style={styles.muted}>
                  Current stock: {currentStock}
                </Text>
              ) : null}
              <View style={styles.formRow}>
                <TextInput mode="outlined" label="Qty" keyboardType="numeric" value={line.qty} onChangeText={(value) => updateLine(line.key, 'qty', value)} style={styles.formField} />
                {lineRequiresBatch ? <TextInput mode="outlined" label="Batch no *" value={line.batchNo} onChangeText={(value) => updateLine(line.key, 'batchNo', value)} style={styles.formField} /> : null}
                {isVariantProduct(product) ? (
                  <SelectField
                    label="Variant"
                    valueLabel={selectedVariant ? `${selectedVariant.name} (${selectedVariant.item_code})` : 'Select variant'}
                    options={product?.variants ?? []}
                    keyFor={(variant) => variant.variant_id}
                    labelFor={(variant) => `${variant.name} (${variant.item_code})`}
                    onSelect={(variant) => selectVariant(line.key, variant.variant_id)}
                    style={styles.formField}
                  />
                ) : null}
                {currentStock && isVariantProduct(product) ? (
                  <Text variant="bodySmall" style={[styles.muted, styles.formField]}>
                    Current stock: {currentStock}
                  </Text>
                ) : null}
                {product && product.type !== 'combo' ? (
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
                <TextInput mode="outlined" label="Unit price" keyboardType="numeric" value={line.price} onChangeText={(value) => updateLine(line.key, 'price', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Discount" keyboardType="numeric" value={line.discount} onChangeText={(value) => updateLine(line.key, 'discount', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Tax %" keyboardType="numeric" value={line.taxRate} onChangeText={(value) => updateLine(line.key, 'taxRate', value)} style={styles.formField} />
              </View>
              <Text variant="bodyMedium" style={styles.lineTotal}>Line total: {money(lineTotal)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text variant="titleMedium">{kind === 'returns' ? 'Adjustments' : 'Adjustments'}</Text>
        <View style={styles.formRow}>
          <TextInput mode="outlined" label="Order tax %" keyboardType="numeric" value={form.orderTaxRate} onChangeText={(value) => setValue('orderTaxRate', value)} style={styles.formField} />
          {kind === 'sales' ? <TextInput mode="outlined" label="Order discount" keyboardType="numeric" value={form.orderDiscount} onChangeText={(value) => setValue('orderDiscount', value)} style={styles.formField} /> : null}
          {kind === 'sales' ? <TextInput mode="outlined" label="Shipping cost" keyboardType="numeric" value={form.shippingCost} onChangeText={(value) => setValue('shippingCost', value)} style={styles.formField} /> : null}
        </View>
      </View>

      {kind === 'sales' ? <View style={styles.panel}>
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
      </View> : null}

      <View style={styles.panel}>
        <Text variant="titleMedium">Notes</Text>
        <TextInput mode="outlined" label={kind === 'returns' ? 'Return note' : 'Sale note'} multiline value={form.saleNote} onChangeText={(value) => setValue('saleNote', value)} />
        <TextInput mode="outlined" label="Staff note" multiline value={form.staffNote} onChangeText={(value) => setValue('staffNote', value)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.summaryTable}>
          <DataTable.Row>
            <DataTable.Cell>Total qty</DataTable.Cell>
            <DataTable.Cell numeric>{money(totals.totalQty)}</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row>
            <DataTable.Cell>Items subtotal</DataTable.Cell>
            <DataTable.Cell numeric>{money(totals.totalPrice)}</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row>
            <DataTable.Cell>Discount</DataTable.Cell>
            <DataTable.Cell numeric>{money(totals.totalDiscount)}</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row>
            <DataTable.Cell>Order tax</DataTable.Cell>
            <DataTable.Cell numeric>{money(totals.orderTax)}</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row>
            <DataTable.Cell>Grand total</DataTable.Cell>
            <DataTable.Cell numeric>{money(totals.grandTotal)}</DataTable.Cell>
          </DataTable.Row>
        </DataTable>
      </ScrollView>

      <View style={styles.actions}>
        <Button mode="contained" loading={saving} disabled={saving || loading} onPress={saveInvoice}>{editingId ? 'Update invoice' : 'Create invoice'}</Button>
      </View>
      </> : null}
    </Screen>
  );
}

export default function SalesInvoicesIndexScreen() {
  return <SalesInvoicesScreen mode="index" />;
}

function InvoiceDetails({ invoice, kind, canEditCost, onInvoiceUpdated }: { invoice: Record<string, any>; kind: InvoiceKind; canEditCost: boolean; onInvoiceUpdated: (invoice: Record<string, any>) => void }) {
  const [costLine, setCostLine] = useState<Record<string, any> | null>(null);
  const [costValue, setCostValue] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const lines = (invoice.products ?? []) as Record<string, any>[];
  const subtotal = numberValue(invoice.total_price);
  const orderDiscount = numberValue(invoice.order_discount) + numberValue(invoice.coupon_discount);
  const orderTax = numberValue(invoice.order_tax);
  const grandTotal = numberValue(invoice.grand_total);
  const paidAmount = numberValue(invoice.paid_amount);
  const changeAmount = Math.max(paidAmount - grandTotal, 0);
  const totalCost = round2(lines.reduce((sum, line) => sum + detailLineCost(line), 0));
  const totalProfit = round2(grandTotal - totalCost);
  const showProfit = kind === 'sales' && totalCost > 0;
  const payment = invoice.payments?.[0] ?? null;
  const note = String((kind === 'returns' ? invoice.return_note : invoice.sale_note) ?? '-');
  const invoiceDate = String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-');
  const invoiceTime = timeOnly(invoice.created_at);

  function openCostEditor(line: Record<string, any>) {
    setCostLine(line);
    setCostValue(String(detailLineUnitCost(line)));
  }

  async function saveCost() {
    if (!costLine?.id || !invoice.id) return;
    const unitCost = numberValue(costValue);
    if (unitCost < 0) {
      Alert.alert('Invalid cost', 'Cost must be zero or greater.');
      return;
    }

    setSavingCost(true);
    try {
      const response = await api.updateSalesInvoiceLineCost(Number(invoice.id), Number(costLine.id), unitCost);
      onInvoiceUpdated(response.data as Record<string, any>);
      setCostLine(null);
    } catch (error) {
      Alert.alert('Cost update failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSavingCost(false);
    }
  }

  return (
    <View style={styles.mobileDetailStack}>
      <View style={styles.mobileInvoiceCard}>
        <View style={styles.mobileInvoiceTop}>
          <View style={styles.invoiceIconCircle}>
            <MaterialCommunityIcons name="file-document-outline" size={28} color="#ffffff" />
          </View>
          <View style={styles.invoiceTitleBlock}>
            <Text variant="bodyMedium" style={styles.mobileMuted}>Invoice No</Text>
            <Text variant="titleLarge" style={styles.invoiceNumber}>{String(invoice.reference_no ?? '-')}</Text>
          </View>
          <View style={styles.mobilePaidBadge}>
            <MaterialCommunityIcons name="check-circle" size={18} color="#079641" />
            <Text style={styles.mobilePaidText}>{kind === 'sales' ? paymentStatusLabel(invoice.payment_status, paidAmount, grandTotal) : String(invoice.approval_status ?? 'Approved')}</Text>
          </View>
        </View>

        <View style={styles.mobileInvoiceDivider} />

        <View style={styles.mobileMetaGrid}>
          <View style={styles.mobileMetaColumn}>
            <MobileMeta icon="account-outline" label="Customer" value={String(invoice.customer?.name ?? '-')} />
            <MobileMeta icon="phone-outline" label="Phone" value={String(invoice.customer?.phone_number ?? '-')} />
            <MobileMeta icon="account-group-outline" label={kind === 'returns' ? 'Returned By' : 'Sales Person'} value={String(invoice.user?.name ?? '-')} />
          </View>
          <View style={styles.mobileMetaSeparator} />
          <View style={styles.mobileMetaColumn}>
            <MobileMeta icon="calendar-month-outline" label="Date" value={invoiceDate} />
            <MobileMeta icon="clock-outline" label="Time" value={invoiceTime ?? '-'} />
            <MobileMeta icon="map-marker-outline" label={kind === 'returns' ? 'Return Location' : 'Sales Location'} value={String(invoice.warehouse?.name ?? invoice.biller?.name ?? '-')} />
          </View>
        </View>
      </View>

      <Text variant="titleMedium" style={styles.mobileSectionTitle}>{kind === 'returns' ? 'Return Items' : 'Sales Items'}</Text>
      <View style={styles.mobileItemsStack}>
        {lines.map((line, index) => {
          const lineCost = detailLineCost(line);
          const lineProfit = round2(numberValue(line.total) - lineCost);
          return (
            <View key={line.id ?? index} style={styles.mobileItemCard}>
              <View style={styles.mobileItemIndex}><Text style={styles.mobileItemIndexText}>{index + 1}</Text></View>
              <ProductThumb line={line} />
              <View style={styles.mobileItemBody}>
                <Text variant="titleSmall" style={styles.mobileItemName} numberOfLines={2}>
                  {invoiceLineProductName(line)}
                </Text>
                <View style={styles.mobilePillRow}>
                  <Text style={styles.variantPill}>{line.variant?.name ?? line.batch?.batch_no ?? '-'}</Text>
                  <Text style={styles.skuPill}>SKU: {line.variant?.item_code ?? line.product?.sku ?? line.product?.code ?? '-'}</Text>
                </View>
                <View style={styles.mobileItemFacts}>
                  <MobileFact label="Qty" value={money(numberValue(line.qty))} />
                  <MobileFact label="Unit" value={detailLineUnit(line)} />
                  <MobileFact label="Unit Price" value={takaMoney(numberValue(line.net_unit_price))} />
                  <View style={styles.costFact}>
                    <MobileFact label="Cost Price" value={takaMoney(detailLineUnitCost(line))} />
                    {kind === 'sales' && canEditCost ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit cost for ${invoiceLineProductName(line)}`} onPress={() => openCostEditor(line)} style={styles.costEditButton}><MaterialCommunityIcons name="pencil-outline" size={16} color="#0d6bdf" /></Pressable> : null}
                  </View>
                </View>
              </View>
              <View style={styles.mobileLineTotal}>
                <Text style={styles.mobileLineTotalLabel}>Line Total</Text>
                <Text style={styles.mobileLineTotalValue}>{takaMoney(numberValue(line.total))}</Text>
                <Text style={styles.mobileLineProfit}>Profit: {lineCost > 0 ? takaMoney(lineProfit) : '-'}</Text>
              </View>
            </View>
          );
        })}
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
          <MobileInfoRow label="Paid Amount" value={kind === 'sales' ? takaMoney(paidAmount) : '-'} />
          <MobileInfoRow label="Change Amount" value={kind === 'sales' ? takaMoney(changeAmount) : '-'} />
          <MobileInfoRow label="Payment Note" value={String(payment?.payment_note ?? '-')} />
        </View>

        <View style={[styles.mobileCard, styles.mobileHalfCard]}>
          <MobileTotalRow icon="chart-pie" label="Subtotal" value={takaMoney(subtotal)} />
          <MobileTotalRow label="Discount" value={takaMoney(orderDiscount)} />
          <MobileTotalRow label={`VAT (${money(numberValue(invoice.order_tax_rate))}%)`} value={takaMoney(orderTax)} />
          <View style={styles.mobileInvoiceDivider} />
          <MobileTotalRow label="Grand Total" value={takaMoney(grandTotal)} strong blue />
          <MobileTotalRow label="Total Cost" value={showProfit ? takaMoney(totalCost) : '-'} />
          <MobileTotalRow label="Total Profit" value={showProfit ? takaMoney(totalProfit) : '-'} strong green />
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
          <Text style={styles.mobileMuted}>Profit Status</Text>
          <View style={styles.mobileProfitBadge}>
            <MaterialCommunityIcons name="trending-up" size={18} color="#079641" />
            <Text style={styles.mobileProfitBadgeText}>{showProfit ? (totalProfit >= 0 ? 'Profitable' : 'Loss') : '-'}</Text>
          </View>
        </View>
      </View>

      <ActivityLogTimeline logs={invoice.activity_logs ?? []} />
      <Portal>
        <Modal visible={costLine !== null} onDismiss={() => !savingCost && setCostLine(null)} contentContainerStyle={styles.costModal}>
          <View style={styles.costModalContent}>
            <Text variant="titleMedium">Edit Sale Cost</Text>
            <Text style={styles.costWarning}>This changes the saved cost for this sale only. Product default cost and stock are unchanged.</Text>
            <Text style={styles.mobileMuted}>{costLine ? `${invoiceLineProductName(costLine)} · ${detailLineUnit(costLine)}` : ''}</Text>
            <TextInput mode="outlined" label="Cost per sales unit" keyboardType="numeric" value={costValue} onChangeText={setCostValue} />
            <View style={styles.costModalActions}><Button mode="outlined" disabled={savingCost} onPress={() => setCostLine(null)}>Cancel</Button><Button mode="contained" loading={savingCost} disabled={savingCost} onPress={saveCost}>Save cost</Button></View>
          </View>
        </Modal>
      </Portal>
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
      {imageUrl ? (
        <Image source={{ uri: String(imageUrl) }} style={styles.productThumbImage} resizeMode="cover" />
      ) : (
        <MaterialCommunityIcons name="package-variant-closed" size={36} color="#8a94a6" />
      )}
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

function MobileTotalRow({
  icon,
  label,
  value,
  strong,
  blue,
  green,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  strong?: boolean;
  blue?: boolean;
  green?: boolean;
}) {
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
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <Button mode="outlined" disabled={disabled} contentStyle={styles.selectButton} onPress={() => setVisible(true)}>
            {valueLabel}
          </Button>
        }
      >
        {options.map((option) => (
          <Menu.Item
            key={keyFor(option)}
            title={labelFor(option)}
            onPress={() => {
              onSelect(option);
              setVisible(false);
            }}
          />
        ))}
      </Menu>
    </View>
  );
}

function SearchableSelectField<T>({
  label,
  valueLabel,
  disabled,
  style,
  placeholder,
  search,
  keyFor,
  labelFor,
  detailFor,
  onSelect,
}: SearchableSelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const timeout = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);

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
        if (!cancelled) {
          Alert.alert('Search failed', error instanceof Error ? error.message : 'Try again.');
        }
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

  function close() {
    setVisible(false);
  }

  return (
    <View style={[styles.selectField, style]}>
      <Text variant="labelMedium" style={styles.fieldLabel}>{label}</Text>
      <Button mode="outlined" disabled={disabled} contentStyle={styles.selectButton} onPress={open}>
        {valueLabel}
      </Button>
      <Portal>
        <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.searchModal}>
          <View style={styles.searchModalContent}>
            <Text variant="titleMedium">{label}</Text>
            <Searchbar
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              loading={loading}
              style={styles.searchbar}
              inputStyle={styles.searchbarInput}
            />
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
                  <Button
                    mode="text"
                    contentStyle={styles.searchResultButton}
                    labelStyle={styles.searchResultLabel}
                    onPress={() => {
                      onSelect(item);
                      close();
                    }}
                  >
                    {detail ? `${labelFor(item)}\n${detail}` : labelFor(item)}
                  </Button>
                );
              }}
            />
            <Button mode="outlined" onPress={close}>Close</Button>
          </View>
        </Modal>
      </Portal>
    </View>
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
    Alert.alert('Missing reference', 'Reference no is required.');
    return null;
  }
  if (!form.customerId || !form.warehouseId) {
    Alert.alert('Missing invoice fields', 'Customer and warehouse are required.');
    return null;
  }

  const invoiceLines = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const values = calculateLine(line);
    return { line, product, values };
  });

  if (invoiceLines.some((item) => !item.product)) {
    Alert.alert('Missing product', 'Every invoice line must have a product.');
    return null;
  }
  if (invoiceLines.some((item) => item.values.qty <= 0)) {
    Alert.alert('Invalid quantity', 'Line quantities must be greater than zero.');
    return null;
  }
  if (invoiceLines.some((item) => isBatchProduct(item.product) && !item.line.batchNo.trim())) {
    Alert.alert('Missing batch no', 'Batch no is required for batch products.');
    return null;
  }
  if (invoiceLines.some((item) => isVariantProduct(item.product) && !productVariantById(item.product, item.line.variantId))) {
    Alert.alert('Missing variant', 'Variant is required for variant products.');
    return null;
  }

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);

  const basePayload = {
    reference_no: form.referenceNo.trim(),
    sale_date: kind === 'sales' ? form.invoiceDate : undefined,
    customer_id: form.customerId,
    warehouse_id: form.warehouseId,
    lines: invoiceLines.map(({ line, product, values }) => {
      const variant = productVariantById(product, line.variantId);

      return {
        product_id: product?.id as number,
        product_code: variant?.item_code ?? product?.code ?? null,
        variant_id: variant?.variant_id ?? null,
        product_batch_id: null,
        batch_no: isBatchProduct(product) ? nullableText(line.batchNo) : null,
        qty: values.qty,
        sale_unit: product?.type === 'combo' ? 'n/a' : line.unitId,
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

function paymentLabel(mode: PaymentMode) {
  if (mode === 'paid') return 'Paid cash';
  if (mode === 'partial') return 'Partial cash';
  return 'Unpaid';
}

function taxForProduct(product: Product, taxes: Tax[]) {
  return taxes.find((tax) => tax.id === product.tax_id)?.rate ?? 0;
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

function productLabel(product: Product | undefined, variant?: ProductVariant | null) {
  if (!product) return 'Select product';
  return variant ? `${product.name} - ${variant.name} (${variant.item_code})` : `${product.name} (${product.code})`;
}

function invoiceLineProductName(line: Record<string, any>) {
  const productName = line.product?.name ?? `#${line.product_id}`;
  return line.variant?.name ? `${productName} / ${line.variant.name}` : productName;
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

function upsertById<T extends { id: number }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function DatePickerField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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
    <View>
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

function takaMoney(value: number) {
  return `৳${money(value)}`;
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

function invoiceLabels(kind: InvoiceKind) {
  if (kind === 'returns') {
    return {
      title: 'Return Invoice',
      plural: 'Return invoices',
      description: 'Record returned sold products and add quantities back to stock',
      indexRoute: '/(drawer)/return-invoices' as const,
      createRoute: '/(drawer)/return-invoices-create' as const,
      detailRoute: '/(drawer)/return-invoices-detail' as const,
      editRoute: '/(drawer)/return-invoices-edit' as const,
    };
  }

  return {
    title: 'Sales Invoice',
    plural: 'Sales invoices',
    description: 'Create a completed sale with optional cash payment',
    indexRoute: '/(drawer)/sales-invoices' as const,
    createRoute: '/(drawer)/sales-invoices-create' as const,
    detailRoute: '/(drawer)/sales-invoices-detail' as const,
    editRoute: '/(drawer)/sales-invoices-edit' as const,
  };
}

function generateReference(kind: InvoiceKind = 'sales') {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const prefix = kind === 'returns' ? 'rr' : 'sr';
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  muted: {
    color: '#666666',
  },
  panel: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectField: {
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
  },
  fieldLabel: {
    marginBottom: 4,
    color: '#333333',
  },
  selectButton: {
    justifyContent: 'flex-start',
    width: '100%',
  },
  searchModal: {
    maxHeight: '86%',
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  searchModalContent: {
    gap: 12,
    padding: 16,
  },
  searchbar: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.24)',
    backgroundColor: '#ffffff',
  },
  searchbarInput: {
    minHeight: 0,
    paddingVertical: 0,
  },
  searchLoading: {
    paddingVertical: 8,
  },
  searchList: {
    maxHeight: 360,
  },
  searchResultButton: {
    minHeight: 56,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 8,
  },
  searchResultLabel: {
    width: '100%',
    textAlign: 'left',
    lineHeight: 20,
  },
  emptySearch: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#666666',
  },
  lineCard: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eeeeee',
    backgroundColor: '#fafafa',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  listItemText: {
    flex: 1,
    minWidth: 0,
  },
  detailBox: {
    gap: 6,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eeeeee',
    backgroundColor: '#fafafa',
  },
  detailStack: {
    gap: 12,
  },
  mobileDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 12,
  },
  mobileDetailTitle: {
    color: '#071126',
    fontWeight: '800',
  },
  mobileDetailStack: {
    gap: 14,
  },
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
  mobileInvoiceTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  invoiceIconCircle: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#1670e8',
  },
  invoiceTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  invoiceNumber: {
    color: '#0b66d8',
    fontWeight: '800',
  },
  mobilePaidBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#d7f6df',
  },
  mobilePaidText: {
    color: '#087338',
    fontSize: 15,
    fontWeight: '800',
  },
  mobileInvoiceDivider: {
    height: 1,
    backgroundColor: '#e7ebf2',
  },
  mobileMetaGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  mobileMetaColumn: {
    flex: 1,
    gap: 14,
  },
  mobileMetaSeparator: {
    width: 1,
    backgroundColor: '#e7ebf2',
  },
  mobileMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  mobileMetaText: {
    flex: 1,
    minWidth: 0,
  },
  mobileMuted: {
    color: '#667085',
    fontSize: 13,
  },
  mobileSectionTitle: {
    color: '#071126',
    fontWeight: '800',
  },
  mobileItemsStack: {
    gap: 8,
  },
  mobileItemCard: {
    position: 'relative',
    flexDirection: 'row',
    gap: 10,
    minHeight: 122,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e3e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mobileItemIndex: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#1670e8',
  },
  mobileItemIndexText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  productThumb: {
    width: 86,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#f4f6f8',
  },
  productThumbImage: {
    width: '100%',
    height: '100%',
  },
  mobileItemBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  mobileItemName: {
    color: '#071126',
    fontWeight: '800',
  },
  mobilePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  variantPill: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#ddebff',
    color: '#075fc4',
    fontWeight: '700',
  },
  skuPill: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#eef0f3',
    color: '#46505f',
  },
  mobileItemFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 5,
  },
  mobileFactText: {
    minWidth: '42%',
    color: '#111827',
    fontSize: 13,
  },
  costFact: {
    minWidth: '42%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  costEditButton: {
    marginLeft: 2,
    padding: 4,
  },
  costModal: {
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  costModalContent: {
    gap: 14,
    padding: 16,
  },
  costWarning: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff7e6',
    color: '#8a4b00',
    lineHeight: 20,
  },
  costModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  mobileLineTotal: {
    width: 104,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#edf0f5',
  },
  mobileLineTotalLabel: {
    color: '#667085',
    fontSize: 14,
  },
  mobileLineTotalValue: {
    color: '#0a0f1d',
    fontSize: 19,
    fontWeight: '900',
  },
  mobileLineProfit: {
    color: '#099141',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  mobileTwoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  mobileCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e3e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mobileHalfCard: {
    flex: 1,
    minWidth: 0,
    gap: 9,
  },
  mobileCardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mobileCardTitle: {
    color: '#071126',
    fontWeight: '800',
  },
  mobileInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  mobileInfoValue: {
    flex: 1,
    color: '#111827',
    fontWeight: '700',
    textAlign: 'right',
  },
  mobileTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  mobileTotalLabelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  mobileTotalLabel: {
    color: '#5f6877',
    fontSize: 14,
  },
  mobileTotalValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  mobileTotalStrongLabel: {
    fontWeight: '900',
  },
  mobileTotalStrongValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  blueText: {
    color: '#0b66d8',
  },
  greenText: {
    color: '#079641',
  },
  mobileNoteCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e3e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mobileNoteLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  mobileProfitStatus: {
    alignItems: 'flex-end',
    gap: 6,
  },
  mobileProfitBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#d7f6df',
  },
  mobileProfitBadgeText: {
    color: '#087338',
    fontWeight: '900',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
  },
  formField: {
    minWidth: 0,
    flexBasis: '46%',
    flexGrow: 1,
    flexShrink: 1,
  },
  datePickerModal: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    width: '92%',
    maxWidth: 360,
  },
  datePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  datePickerWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  datePickerWeekday: {
    flex: 1,
    textAlign: 'center',
    color: '#666666',
  },
  datePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  datePickerDay: {
    alignItems: 'center',
    aspectRatio: 1,
    flexBasis: '14.2857%',
    justifyContent: 'center',
    borderRadius: 6,
  },
  datePickerDaySelected: {
    backgroundColor: '#111111',
  },
  datePickerDayText: {
    color: '#222222',
  },
  datePickerDayMuted: {
    color: '#aaaaaa',
  },
  datePickerDayTextSelected: {
    color: '#ffffff',
  },
  lineTotal: {
    textAlign: 'right',
    color: '#333333',
  },
  pending: {
    color: '#92400e',
    fontWeight: '700',
  },
  approved: {
    color: '#047857',
    fontWeight: '700',
  },
  summaryTable: {
    minWidth: 360,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
});
