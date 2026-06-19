import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Button, DataTable, Menu, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type ReturnInvoicePayload, type SalesInvoicePayload } from '@/src/lib/api';
import type { Branch, Customer, Product, Tax, Unit, Warehouse } from '@/src/types';

type ProductOptions = {
  taxes?: Tax[];
  units?: Unit[];
};

type InvoiceLine = {
  key: string;
  productId: number | null;
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
  billerId: null as number | null,
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
  const { hasPermission } = useAuth();
  const labels = invoiceLabels(kind);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [billers, setBillers] = useState<Branch[]>([]);
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
  const selectedBiller = billers.find((biller) => biller.id === form.billerId);
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
      const [customerResponse, warehouseResponse, billerResponse, productResponse, productOptionsResponse] =
        await Promise.all([
          api.customers({ perPage: 100 }),
          api.warehouses({ perPage: 100, activeOnly: true }),
          api.branches({ perPage: 100, activeOnly: true }),
          api.products({ perPage: 100 }),
          api.productOptions(),
        ]);

      const nextCustomers = customerResponse.data as Customer[];
      const nextWarehouses = warehouseResponse.data as Warehouse[];
      const nextBillers = billerResponse.data as Branch[];
      const nextProducts = (productResponse.data as Product[]).filter(isInvoiceProductSupported);
      const productOptions = productOptionsResponse.data as ProductOptions;

      setCustomers(nextCustomers);
      setWarehouses(nextWarehouses);
      setBillers(nextBillers);
      setProducts(nextProducts);
      setTaxes(productOptions.taxes ?? []);
      setUnits(productOptions.units ?? []);
      setForm((current) => ({
        ...current,
        customerId: current.customerId ?? nextCustomers[0]?.id ?? null,
        warehouseId: current.warehouseId ?? nextWarehouses[0]?.id ?? null,
        billerId: current.billerId ?? nextBillers[0]?.id ?? null,
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
    setWarehouses((current) => upsertById(current, warehouse));
    setForm((current) => ({ ...current, warehouseId: warehouse.id }));
    if (kind === 'returns') return;

    setLines((current) => current.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      const unitId = line.unitId ?? defaultProductUnit(product, productOptionsForFamily(product, units), 'sale');
      return product ? { ...line, price: String(unitPriceForProductUnit(product, unitId, units)) } : line;
    }));
  }

  function selectProduct(lineKey: string, product: Product) {
    if (!form.warehouseId) {
      Alert.alert('Select warehouse first', 'Choose a warehouse before selecting products.');
      return;
    }

    const availableQty = warehouseStockForProduct(product, form.warehouseId);
    if (kind === 'sales' && availableQty <= 0) {
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
          unitId,
          batchNo: isBatchProduct(product) ? firstBatchNoForProduct(product, form.warehouseId) ?? '' : '',
          price: kind === 'sales' ? String(unitPriceForProductUnit(product, unitId, units)) : line.price,
          taxRate: String(product.tax?.rate ?? taxForProduct(product, taxes)),
        };
      })
    );
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
      billerId: billers[0]?.id ?? null,
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

  function fillFormFromInvoice(invoice: Record<string, any>) {
    setEditingId(Number(invoice.id));
    setForm({
      referenceNo: String(invoice.reference_no ?? ''),
      invoiceDate: String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? todayDate()),
      customerId: Number(invoice.customer_id),
      warehouseId: Number(invoice.warehouse_id),
      billerId: Number(invoice.biller_id),
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
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">{editingId ? `Edit ${labels.title}` : labels.title}</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {editingId ? 'Update invoice fields and line items' : labels.description}
          </Text>
        </View>
        <Button mode="outlined" loading={loading} disabled={loading} onPress={() => void loadOptions()}>
          Refresh
        </Button>
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
            </View>
            <Button compact onPress={() => router.push({ pathname: labels.detailRoute, params: { id: String(invoice.id) } })}>Details</Button>
            <Button compact onPress={() => router.push({ pathname: labels.editRoute, params: { id: String(invoice.id) } })}>Edit</Button>
          </View>
        ))}
        {!invoices.length ? <Text style={styles.muted}>No invoices found.</Text> : null}
      </View> : null}
      {mode === 'details' ? (
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium">{labels.title} details</Text>
            <Button mode="outlined" onPress={() => router.push(labels.indexRoute)}>Back</Button>
          </View>
          {selectedInvoice ? <InvoiceDetails invoice={selectedInvoice} kind={kind} /> : <Text style={styles.muted}>Loading invoice...</Text>}
        </View>
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
        <SelectField
          label="Branch"
          valueLabel={selectedBiller?.name ?? 'Select branch'}
          options={billers}
          keyFor={(biller) => biller.id}
          labelFor={(biller) => biller.name}
          onSelect={(biller) => setValue('billerId', biller.id)}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium">Products</Text>
          <Button mode="contained-tonal" onPress={addLine}>Add line</Button>
        </View>
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId);
          const unitOptions = productOptionsForFamily(product, units);
          const selectedUnit = unitOptions.find((unit) => unit.id === line.unitId);
          const lineRequiresBatch = isBatchProduct(product);
          const lineTotal = calculateLine(line).subtotal;
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
                valueLabel={product ? `${product.name} (${product.code})` : 'Select product'}
                placeholder="Search products"
                search={searchProducts}
                keyFor={(item) => item.id}
                labelFor={(item) => `${item.name} (${item.code})`}
                detailFor={(item) => `Base price ${money(baseUnitPriceForProduct(item))} | Qty ${money(warehouseStockForProduct(item, form.warehouseId))}`}
                onSelect={(item) => {
                  selectProduct(line.key, item);
                }}
              />
              <View style={styles.formRow}>
                <TextInput mode="outlined" label="Qty" keyboardType="numeric" value={line.qty} onChangeText={(value) => updateLine(line.key, 'qty', value)} style={styles.formField} />
                {lineRequiresBatch ? <TextInput mode="outlined" label="Batch no *" value={line.batchNo} onChangeText={(value) => updateLine(line.key, 'batchNo', value)} style={styles.formField} /> : null}
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

function InvoiceDetails({ invoice, kind }: { invoice: Record<string, any>; kind: InvoiceKind }) {
  return (
    <View style={styles.detailBox}>
      <Text variant="titleSmall">{invoice.reference_no}</Text>
      <Text>{kind === 'returns' ? 'Return date' : 'Sale date'}: {String((kind === 'returns' ? invoice.return_date : invoice.sale_date) ?? dateOnly(invoice.created_at) ?? '-')}</Text>
      <Text style={styles.muted}>{invoice.customer?.name ?? '-'}</Text>
      <Text>Grand total: {money(numberValue(invoice.grand_total))}</Text>
      {kind === 'sales' ? <Text>Paid: {money(numberValue(invoice.paid_amount))}</Text> : null}
      {(invoice.products ?? []).map((line: Record<string, any>) => (
        <Text key={line.id} style={styles.muted}>{line.product?.name ?? `#${line.product_id}`} | Qty {money(numberValue(line.qty))} | {money(numberValue(line.total))}</Text>
      ))}
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
  if (!form.customerId || !form.warehouseId || !form.billerId) {
    Alert.alert('Missing invoice fields', 'Customer, warehouse, and branch are required.');
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

  const paidAmount = paymentPaidAmount(form.paymentMode, form.paidAmount, totals.grandTotal);

  const basePayload = {
    reference_no: form.referenceNo.trim(),
    sale_date: kind === 'sales' ? form.invoiceDate : undefined,
    customer_id: form.customerId,
    warehouse_id: form.warehouseId,
    biller_id: form.billerId,
    lines: invoiceLines.map(({ line, product, values }) => ({
      product_id: product?.id as number,
      product_code: product?.code ?? null,
      product_batch_id: null,
      batch_no: isBatchProduct(product) ? nullableText(line.batchNo) : null,
      qty: values.qty,
      sale_unit: product?.type === 'combo' ? 'n/a' : line.unitId,
      net_unit_price: values.price,
      discount: values.discount,
      tax_rate: values.taxRate,
      tax: values.tax,
      subtotal: values.subtotal,
    })),
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
  return !product.is_variant && product.type !== 'digital';
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

function unitPriceForProductUnit(product: Product, unitId: number | null | undefined, units: Unit[]) {
  const basePrice = baseUnitPriceForProduct(product);
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

function warehouseStockForProduct(product: Product, warehouseId?: number | null) {
  const warehouseStocks = warehouseId
    ? product.warehouse_prices?.filter((item) => Number(item.warehouse_id) === warehouseId)
    : [];

  if (warehouseStocks?.length) {
    return warehouseStocks.reduce((sum, item) => sum + numberValue(item.qty), 0);
  }

  if (warehouseId) {
    return 0;
  }

  return numberValue(product.qty ?? product.quantity);
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
