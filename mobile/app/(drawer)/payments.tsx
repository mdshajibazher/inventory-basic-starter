import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Button, Card, Modal, Portal, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { api, type PaymentPayload } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import type { Account, Customer, InvoiceOption, PaginatedResponse, PaginationMeta, Payment, PaymentDirection, PaymentType, Supplier } from '@/src/types';

type PartyKind = 'customer' | 'supplier';
type ViewMode = 'ledger' | 'customer' | 'supplier' | 'account';

type PaymentForm = {
  partyKind: PartyKind;
  customer: Customer | null;
  supplier: Supplier | null;
  account: Account | null;
  paymentType: PaymentType;
  invoice: InvoiceOption | null;
  amount: string;
  discountAmount: string;
  change: string;
  payingMethod: string;
  paymentReference: string;
  paymentNote: string;
};

const paymentTypeLabels: Record<PaymentType, string> = {
  sale_payment: 'Sale payment',
  customer_advance: 'Customer advance',
  purchase_payment: 'Purchase payment',
  supplier_advance: 'Supplier advance',
  sale_return_refund: 'Sale return refund',
  purchase_return_refund: 'Purchase return refund',
};

const customerTypes: PaymentType[] = ['sale_payment', 'customer_advance', 'sale_return_refund'];
const supplierTypes: PaymentType[] = ['purchase_payment', 'supplier_advance', 'purchase_return_refund'];
const methods = ['Cash', 'Cheque', 'Credit Card', 'Gift Card', 'Paypal', 'Bank Transfer', 'Deposit'];

const initialForm: PaymentForm = {
  partyKind: 'customer',
  customer: null,
  supplier: null,
  account: null,
  paymentType: 'customer_advance',
  invoice: null,
  amount: '',
  discountAmount: '0',
  change: '0',
  payingMethod: 'Cash',
  paymentReference: '',
  paymentNote: '',
};

export default function PaymentsScreen() {
  const { hasPermission } = useAuth();
  const [view, setView] = useState<ViewMode>('ledger');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>(initialForm);
  const [ledgerPartyKind, setLedgerPartyKind] = useState<'all' | PartyKind>('all');
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null);
  const [ledgerType, setLedgerType] = useState<PaymentType | 'all'>('all');
  const [ledgerDirection, setLedgerDirection] = useState<PaymentDirection | 'all'>('all');
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [statementAccount, setStatementAccount] = useState<Account | null>(null);

  const canOpen = hasPermission(['accounts-index', 'sales-index', 'purchases-index']);
  const canCreate = hasPermission(['sales-add', 'purchases-add', 'accounts-index']);
  const direction = directionFor(form.paymentType);
  const invoicePayment = isInvoicePayment(form.paymentType);
  const discountTotal = useMemo(() => payments.reduce((total, payment) => total + Number(payment.discount_amount ?? 0), 0), [payments]);
  const maxDiscount = form.paymentType === 'customer_advance'
    ? Math.max(roundMoney(Number(form.amount || 0)), 0)
    : form.paymentType === 'sale_payment' && form.invoice
      ? Math.max(roundMoney(invoiceDue(form.invoice) - Number(form.amount || 0)), 0)
      : 0;
  const discountError = paymentDiscountError(form.paymentType, form.invoice, form.amount, form.discountAmount, maxDiscount);

  const loadPayments = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      let response: PaginatedResponse<Payment>;

      if (view === 'customer' && statementCustomer) {
        response = await api.customerStatement(statementCustomer.id, { page: nextPage, perPage: 15 });
      } else if (view === 'supplier' && statementSupplier) {
        response = await api.supplierStatement(statementSupplier.id, { page: nextPage, perPage: 15 });
      } else if (view === 'account' && statementAccount) {
        response = await api.accountStatement(statementAccount.id, { page: nextPage, perPage: 15 });
      } else if (view === 'ledger') {
        response = await api.payments({
          page: nextPage,
          perPage: 15,
          customerId: ledgerPartyKind === 'customer' ? ledgerCustomer?.id : null,
          supplierId: ledgerPartyKind === 'supplier' ? ledgerSupplier?.id : null,
          accountId: ledgerAccount?.id,
          paymentType: ledgerType,
          direction: ledgerDirection,
        });
      } else {
        setPayments([]);
        setPagination(null);
        return;
      }

      setPayments(response.data);
      setPagination(response.meta ?? null);
      setPage(nextPage);
    } catch (error) {
      Alert.alert('Unable to load payments', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [ledgerAccount?.id, ledgerCustomer?.id, ledgerDirection, ledgerPartyKind, ledgerSupplier?.id, ledgerType, statementAccount, statementCustomer, statementSupplier, view]);

  useEffect(() => {
    if (canOpen) void loadPayments(1);
  }, [canOpen, loadPayments]);

  const searchCustomers = useCallback(async (query: string) => {
    const response = await api.customers({ perPage: 30, search: query });
    return response.data as Customer[];
  }, []);

  const searchSuppliers = useCallback(async (query: string) => {
    const response = await api.suppliers({ perPage: 30, search: query, activeOnly: true });
    return response.data as Supplier[];
  }, []);

  const searchAccounts = useCallback(async (query: string) => {
    const response = await api.accounts({ perPage: 30, search: query, activeOnly: true });
    return response.data as Account[];
  }, []);

  const searchInvoices = useCallback(async (query: string) => {
    if (form.paymentType === 'sale_payment') {
      const response = await api.saleInvoiceOptions({ search: query, customerId: form.customer?.id, outstandingOnly: true, approvedOnly: true });
      return response.data;
    }
    if (form.paymentType === 'purchase_payment') {
      const response = await api.purchaseInvoiceOptions({ search: query, supplierId: form.supplier?.id, outstandingOnly: true, approvedOnly: true });
      return response.data;
    }
    if (form.paymentType === 'sale_return_refund') {
      const response = await api.returnInvoiceOptions({ search: query, customerId: form.customer?.id, approvedOnly: true });
      return response.data;
    }
    return [];
  }, [form.customer?.id, form.paymentType, form.supplier?.id]);

  const typeOptions = useMemo(
    () => (form.partyKind === 'customer' ? customerTypes : supplierTypes).map((type) => ({ value: type, label: paymentTypeLabels[type] })),
    [form.partyKind]
  );

  if (!canOpen) {
    return (
      <View style={styles.center}>
        <Text variant="bodyMedium">You do not have access to payments.</Text>
      </View>
    );
  }

  async function submitPayment() {
    const amount = Number(form.amount);
    const discountAmount = form.paymentType === 'sale_payment' || form.paymentType === 'customer_advance' ? Number(form.discountAmount || 0) : 0;
    const change = invoicePayment ? Number(form.change || 0) : 0;

    if (!form.account || !amount || amount <= 0) {
      Alert.alert('Missing payment fields', 'Account and an amount greater than 0 are required.');
      return;
    }
    if (discountError) {
      Alert.alert('Invalid discount', discountError);
      return;
    }
    if (form.partyKind === 'customer' && !form.customer) {
      Alert.alert('Missing customer');
      return;
    }
    if (form.partyKind === 'supplier' && !form.supplier) {
      Alert.alert('Missing supplier');
      return;
    }

    const payload: PaymentPayload = {
      account_id: form.account.id,
      customer_id: form.partyKind === 'customer' ? form.customer?.id : null,
      supplier_id: form.partyKind === 'supplier' ? form.supplier?.id : null,
      payment_type: form.paymentType,
      direction,
      amount,
      discount_amount: discountAmount,
      change,
      paying_method: form.payingMethod,
      payment_reference: nullableText(form.paymentReference),
      payment_note: nullableText(form.paymentNote),
      sale_id: form.paymentType === 'sale_payment' ? form.invoice?.id ?? null : null,
      purchase_id: form.paymentType === 'purchase_payment' ? form.invoice?.id ?? null : null,
      sale_return_id: form.paymentType === 'sale_return_refund' ? form.invoice?.id ?? null : null,
      purchase_return_id: null,
    };

    setSaving(true);
    try {
      await api.createPayment(payload);
      setModalOpen(false);
      setForm(initialForm);
      void loadPayments(1);
    } catch (error) {
      Alert.alert('Unable to record payment', errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function approvePayment(id: number) {
    setSaving(true);
    try {
      await api.approvePayment(id);
      void loadPayments(page);
    } catch (error) {
      Alert.alert('Approval failed', errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function updatePartyKind(kind: PartyKind) {
    setForm((current) => ({
      ...current,
      partyKind: kind,
      customer: kind === 'customer' ? current.customer : null,
      supplier: kind === 'supplier' ? current.supplier : null,
      paymentType: kind === 'customer' ? 'customer_advance' : 'supplier_advance',
      invoice: null,
      discountAmount: '0',
      change: '0',
    }));
  }

  function updatePaymentType(type: PaymentType) {
    setForm((current) => ({ ...current, paymentType: type, invoice: null, discountAmount: '0', change: '0' }));
  }

  function selectInvoice(invoice: InvoiceOption) {
    const due = invoiceDue(invoice);
    setForm((current) => ({
      ...current,
      invoice,
      amount: isInvoicePayment(current.paymentType) && due > 0 ? String(due) : current.amount,
      discountAmount: '0',
      change: '0',
    }));
  }

  function updateAmount(amount: string) {
    setForm((current) => ({
      ...current,
      amount,
      change: isInvoicePayment(current.paymentType) ? calculatedChange(amount, invoiceDue(current.invoice)) : '0',
    }));
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Payments</Text>
          <Text variant="bodyMedium" style={styles.muted}>{pagination?.total ?? payments.length} payment records</Text>
          {discountTotal > 0 ? <Text variant="bodySmall" style={styles.muted}>Discounts: {money(discountTotal)}</Text> : null}
        </View>
        {canCreate ? <Button mode="contained" onPress={() => setModalOpen(true)}>Record</Button> : null}
      </View>

      <SegmentedButtons
        value={view}
        onValueChange={(value) => {
          setView(value as ViewMode);
          setPage(1);
        }}
        buttons={[
          { value: 'ledger', label: 'All' },
          { value: 'customer', label: 'Customer' },
          { value: 'supplier', label: 'Supplier' },
          { value: 'account', label: 'Account' },
        ]}
        style={styles.segment}
      />

      <FilterPanel
        view={view}
        ledgerPartyKind={ledgerPartyKind}
        setLedgerPartyKind={(value) => {
          setLedgerPartyKind(value);
          setLedgerCustomer(null);
          setLedgerSupplier(null);
        }}
        ledgerCustomer={ledgerCustomer}
        setLedgerCustomer={setLedgerCustomer}
        ledgerSupplier={ledgerSupplier}
        setLedgerSupplier={setLedgerSupplier}
        ledgerAccount={ledgerAccount}
        setLedgerAccount={setLedgerAccount}
        ledgerType={ledgerType}
        setLedgerType={setLedgerType}
        ledgerDirection={ledgerDirection}
        setLedgerDirection={setLedgerDirection}
        statementCustomer={statementCustomer}
        setStatementCustomer={setStatementCustomer}
        statementSupplier={statementSupplier}
        setStatementSupplier={setStatementSupplier}
        statementAccount={statementAccount}
        setStatementAccount={setStatementAccount}
        searchCustomers={searchCustomers}
        searchSuppliers={searchSuppliers}
        searchAccounts={searchAccounts}
      />

      {loading ? <ActivityIndicator style={styles.loading} /> : null}
      <FlatList
        data={payments}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No payments found.</Text> : null}
        renderItem={({ item }) => <PaymentCard payment={item} saving={saving} onApprove={approvePayment} />}
      />
      <View style={styles.pagination}>
        <Button mode="outlined" disabled={loading || page <= 1} onPress={() => void loadPayments(Math.max(1, page - 1))}>Previous</Button>
        <Text style={styles.muted}>Page {pagination?.current_page ?? page} of {pagination?.last_page ?? 1}</Text>
        <Button mode="outlined" disabled={loading || !pagination || page >= pagination.last_page} onPress={() => void loadPayments(page + 1)}>Next</Button>
      </View>

      <Portal>
        <Modal visible={modalOpen} onDismiss={() => setModalOpen(false)} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text variant="titleLarge">Record Payment</Text>
            <SelectButtons
              label="Party Type"
              value={form.partyKind}
              options={[
                { value: 'customer', label: 'Customer' },
                { value: 'supplier', label: 'Supplier' },
              ]}
              onSelect={(value) => updatePartyKind(value as PartyKind)}
            />
            <SelectButtons label="Payment Type" value={form.paymentType} options={typeOptions} onSelect={(value) => updatePaymentType(value as PaymentType)} />
            {form.partyKind === 'customer' ? (
              <SearchableSelectField label="Customer" valueLabel={form.customer?.name ?? 'Select customer'} placeholder="Search customers" search={searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={(customer) => setForm((current) => ({ ...current, customer, invoice: null }))} />
            ) : (
              <SearchableSelectField label="Supplier" valueLabel={form.supplier?.name ?? 'Select supplier'} placeholder="Search suppliers" search={searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={(supplier) => setForm((current) => ({ ...current, supplier, invoice: null }))} />
            )}
            <SearchableSelectField label="Account" valueLabel={form.account ? `${form.account.name} (${form.account.account_no})` : 'Select account'} placeholder="Search accounts" search={searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={(account) => setForm((current) => ({ ...current, account }))} />
            {requiresInvoice(form.paymentType) ? (
              <SearchableSelectField label="Reference Document" valueLabel={form.invoice?.reference_no ?? 'Optional invoice/return'} placeholder="Search by reference no" search={searchInvoices} keyFor={(item) => item.id} labelFor={(item) => item.reference_no} detailFor={invoiceDetail} onSelect={selectInvoice} disabled={(form.paymentType === 'purchase_payment' && !form.supplier) || (form.paymentType !== 'purchase_payment' && !form.customer)} />
            ) : null}
            <TextInput mode="outlined" label="Direction" value={direction} editable={false} />
            <TextInput mode="outlined" label="Amount" keyboardType="decimal-pad" value={form.amount} onChangeText={updateAmount} />
            {form.paymentType === 'sale_payment' || form.paymentType === 'customer_advance' ? (
              <View>
                <TextInput mode="outlined" label={form.paymentType === 'customer_advance' ? 'Discount / Charge' : 'Discount Amount'} keyboardType="decimal-pad" value={form.discountAmount} onChangeText={(discountAmount) => setForm((current) => ({ ...current, discountAmount }))} error={Boolean(discountError)} />
                <Text variant="bodySmall" style={discountError ? styles.errorText : styles.muted}>
                  {discountError ?? `Maximum available discount: ${money(maxDiscount)}`}
                </Text>
              </View>
            ) : null}
            {form.paymentType === 'sale_payment' && form.invoice ? (
              <Text variant="bodySmall" style={styles.muted}>
                Settled {money(Number(form.amount || 0) + Number(form.discountAmount || 0))} · Remaining {money(Math.max(roundMoney(invoiceDue(form.invoice) - Number(form.amount || 0) - Number(form.discountAmount || 0)), 0))}
              </Text>
            ) : null}
            {form.paymentType === 'customer_advance' ? (
              <Text variant="bodySmall" style={styles.muted}>Net advance credit: {money(Math.max(roundMoney(Number(form.amount || 0) - Number(form.discountAmount || 0)), 0))}</Text>
            ) : null}
            {invoicePayment ? <TextInput mode="outlined" label="Change" keyboardType="decimal-pad" value={form.change} editable={false} /> : null}
            <SelectButtons label="Paying Method" value={form.payingMethod} options={methods.map((method) => ({ value: method, label: method }))} onSelect={(payingMethod) => setForm((current) => ({ ...current, payingMethod }))} />
            <TextInput mode="outlined" label="Payment Reference" value={form.paymentReference} onChangeText={(paymentReference) => setForm((current) => ({ ...current, paymentReference }))} placeholder="Auto generated if empty" />
            <TextInput mode="outlined" label="Payment Note" multiline value={form.paymentNote} onChangeText={(paymentNote) => setForm((current) => ({ ...current, paymentNote }))} />
            <View style={styles.actions}>
              <Button mode="outlined" disabled={saving} onPress={() => setModalOpen(false)}>Cancel</Button>
              <Button mode="contained" loading={saving} disabled={saving || Boolean(discountError)} onPress={submitPayment}>Save Payment</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

function FilterPanel(props: {
  view: ViewMode;
  ledgerPartyKind: 'all' | PartyKind;
  setLedgerPartyKind: (value: 'all' | PartyKind) => void;
  ledgerCustomer: Customer | null;
  setLedgerCustomer: (value: Customer | null) => void;
  ledgerSupplier: Supplier | null;
  setLedgerSupplier: (value: Supplier | null) => void;
  ledgerAccount: Account | null;
  setLedgerAccount: (value: Account | null) => void;
  ledgerType: PaymentType | 'all';
  setLedgerType: (value: PaymentType | 'all') => void;
  ledgerDirection: PaymentDirection | 'all';
  setLedgerDirection: (value: PaymentDirection | 'all') => void;
  statementCustomer: Customer | null;
  setStatementCustomer: (value: Customer | null) => void;
  statementSupplier: Supplier | null;
  setStatementSupplier: (value: Supplier | null) => void;
  statementAccount: Account | null;
  setStatementAccount: (value: Account | null) => void;
  searchCustomers: (query: string) => Promise<Customer[]>;
  searchSuppliers: (query: string) => Promise<Supplier[]>;
  searchAccounts: (query: string) => Promise<Account[]>;
}) {
  if (props.view === 'customer') {
    return <SearchableSelectField label="Customer Statement" valueLabel={props.statementCustomer?.name ?? 'Select customer'} placeholder="Search customers" search={props.searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setStatementCustomer} />;
  }

  if (props.view === 'supplier') {
    return <SearchableSelectField label="Supplier Statement" valueLabel={props.statementSupplier?.name ?? 'Select supplier'} placeholder="Search suppliers" search={props.searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setStatementSupplier} />;
  }

  if (props.view === 'account') {
    return <SearchableSelectField label="Account Statement" valueLabel={props.statementAccount ? `${props.statementAccount.name} (${props.statementAccount.account_no})` : 'Select account'} placeholder="Search accounts" search={props.searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={props.setStatementAccount} />;
  }

  return (
    <Card style={styles.filterCard}>
      <Card.Content style={styles.filterContent}>
        <SelectButtons label="Party Filter" value={props.ledgerPartyKind} options={[{ value: 'all', label: 'All' }, { value: 'customer', label: 'Customer' }, { value: 'supplier', label: 'Supplier' }]} onSelect={(value) => props.setLedgerPartyKind(value as 'all' | PartyKind)} />
        {props.ledgerPartyKind === 'customer' ? <SearchableSelectField label="Customer" valueLabel={props.ledgerCustomer?.name ?? 'Any customer'} placeholder="Search customers" search={props.searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerCustomer} /> : null}
        {props.ledgerPartyKind === 'supplier' ? <SearchableSelectField label="Supplier" valueLabel={props.ledgerSupplier?.name ?? 'Any supplier'} placeholder="Search suppliers" search={props.searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerSupplier} /> : null}
        <SearchableSelectField label="Account" valueLabel={props.ledgerAccount ? `${props.ledgerAccount.name} (${props.ledgerAccount.account_no})` : 'Any account'} placeholder="Search accounts" search={props.searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={props.setLedgerAccount} />
        <SelectButtons label="Payment Type" value={props.ledgerType} options={[{ value: 'all', label: 'All types' }, ...Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))]} onSelect={(value) => props.setLedgerType(value as PaymentType | 'all')} />
        <SelectButtons label="Direction" value={props.ledgerDirection} options={[{ value: 'all', label: 'All' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} onSelect={(value) => props.setLedgerDirection(value as PaymentDirection | 'all')} />
      </Card.Content>
    </Card>
  );
}

function PaymentCard({ payment, saving, onApprove }: { payment: Payment; saving: boolean; onApprove: (id: number) => void }) {
  const incoming = payment.direction === 'in';
  return (
    <Card style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="titleSmall">{payment.payment_reference}</Text>
            <Text variant="bodySmall" style={styles.muted}>{paymentTypeLabels[payment.payment_type] ?? payment.payment_type}</Text>
          </View>
          <Text style={incoming ? styles.inAmount : styles.outAmount}>{incoming ? '+' : '-'}{money(payment.amount)}</Text>
        </View>
        <Text variant="bodyMedium">{payment.customer?.name ?? payment.supplier?.name ?? '-'}</Text>
        <Text variant="bodySmall" style={styles.muted}>Account: {payment.account?.name ?? '-'}</Text>
        <Text variant="bodySmall" style={styles.muted}>Document: {documentLabel(payment)}</Text>
        <Text variant="bodySmall" style={styles.muted}>Method: {payment.paying_method}</Text>
        {Number(payment.discount_amount ?? 0) > 0 ? <Text variant="bodySmall" style={styles.muted}>Discount: {money(payment.discount_amount)} · Settled: {money(payment.settled_amount ?? (payment.payment_type === 'customer_advance' ? Number(payment.amount) - Number(payment.discount_amount ?? 0) : Number(payment.amount) + Number(payment.discount_amount ?? 0)))}</Text> : null}
        <Text variant="bodySmall" style={payment.approval_status === 'pending' ? styles.pending : styles.approved}>
          {payment.approval_status === 'pending' ? 'Pending approval' : 'Approved'}
        </Text>
        <Button mode="text" onPress={() => router.push({ pathname: '/(drawer)/payments-detail', params: { id: String(payment.id) } })}>
          Details
        </Button>
        {payment.can_approve ? (
          <Button mode="outlined" disabled={saving} onPress={() => onApprove(payment.id)}>
            Approve
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function SelectButtons({ label, value, options, onSelect }: { label: string; value: string; options: { value: string; label: string }[]; onSelect: (value: string) => void }) {
  return (
    <View style={styles.selectBlock}>
      <Text variant="labelMedium" style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((option) => (
          <Button key={option.value} mode={value === option.value ? 'contained' : 'outlined'} compact onPress={() => onSelect(option.value)}>{option.label}</Button>
        ))}
      </ScrollView>
    </View>
  );
}

type SearchableSelectFieldProps<T> = {
  label: string;
  valueLabel: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  keyFor: (item: T) => string | number;
  labelFor: (item: T) => string;
  detailFor?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  disabled?: boolean;
};

function SearchableSelectField<T>({ label, valueLabel, placeholder, search, keyFor, labelFor, detailFor, onSelect, disabled }: SearchableSelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timeout);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    search(debouncedQuery)
      .then((nextOptions) => {
        if (requestId.current === currentRequest) setOptions(nextOptions);
      })
      .catch((error) => {
        if (requestId.current === currentRequest) Alert.alert('Search failed', errorMessage(error));
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [debouncedQuery, search, visible]);

  function open() {
    if (disabled) return;
    setQuery('');
    setDebouncedQuery('');
    setVisible(true);
  }

  return (
    <View style={styles.selectBlock}>
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

function directionFor(type: PaymentType): PaymentDirection {
  return ['sale_payment', 'customer_advance', 'purchase_return_refund'].includes(type) ? 'in' : 'out';
}

function requiresInvoice(type: PaymentType): boolean {
  return ['sale_payment', 'purchase_payment', 'sale_return_refund'].includes(type);
}

function isInvoicePayment(type: PaymentType): boolean {
  return ['sale_payment', 'purchase_payment'].includes(type);
}

function documentLabel(payment: Payment): string {
  return payment.reference_document?.reference_no || payment.sale?.reference_no || payment.purchase?.reference_no || payment.sale_return?.reference_no || payment.purchase_return?.reference_no || paymentTypeLabels[payment.payment_type] || '-';
}

function invoiceDetail(invoice: InvoiceOption): string {
  return `Total ${money(invoice.grand_total ?? 0)}, settled ${money(invoice.paid_amount ?? 0)}, due ${money(invoiceDue(invoice))}`;
}

function paymentDiscountError(type: PaymentType, invoice: InvoiceOption | null, rawAmount: string, rawDiscount: string, maxDiscount: number): string | null {
  if (type !== 'sale_payment' && type !== 'customer_advance') return null;
  const amount = Number(rawAmount || 0);
  const discount = Number(rawDiscount || 0);
  if (!Number.isFinite(discount)) return 'Enter a valid discount amount.';
  if (discount < 0) return 'Discount amount cannot be negative.';
  if (type === 'customer_advance' && roundMoney(discount) > maxDiscount) return `Discount / charge cannot exceed ${money(maxDiscount)}.`;
  if (type === 'sale_payment' && discount > 0 && !invoice) return 'Select a sales invoice before applying a discount.';
  if (invoice && Number.isFinite(amount) && roundMoney(amount) > invoiceDue(invoice)) return 'Payment amount already exceeds the current invoice due.';
  if (roundMoney(discount) > maxDiscount) return `Discount cannot exceed ${money(maxDiscount)}.`;
  return null;
}

function invoiceDue(invoice: InvoiceOption | null): number {
  if (!invoice) return 0;
  const due = invoice.due_amount ?? Number(invoice.grand_total ?? 0) - Number(invoice.paid_amount ?? 0);
  return Math.max(roundMoney(Number(due)), 0);
}

function calculatedChange(amount: string, due: number): string {
  if (due <= 0) return '0';
  return String(Math.max(roundMoney(Number(amount || 0) - due), 0));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#f7f7f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  muted: { color: '#666666' },
  pending: { color: '#92400e', fontWeight: '700' },
  approved: { color: '#047857', fontWeight: '700' },
  segment: { marginBottom: 12 },
  filterCard: { marginBottom: 12, backgroundColor: '#ffffff' },
  filterContent: { gap: 10 },
  loading: { marginVertical: 12 },
  list: { gap: 10, paddingBottom: 16 },
  empty: { textAlign: 'center', color: '#666666', padding: 24 },
  card: { backgroundColor: '#ffffff' },
  cardContent: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  inAmount: { color: '#15803d', fontWeight: '700' },
  outAmount: { color: '#b91c1c', fontWeight: '700' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 8 },
  modal: { maxHeight: '92%', margin: 16, borderRadius: 8, backgroundColor: '#ffffff' },
  modalContent: { gap: 12, padding: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  errorText: { color: '#b91c1c', marginTop: 4 },
  selectBlock: { gap: 6 },
  fieldLabel: { color: '#222222' },
  chipRow: { gap: 8, paddingRight: 8 },
  selectButton: { justifyContent: 'flex-start', minHeight: 44 },
  searchModal: { maxHeight: '86%', margin: 18, borderRadius: 8, backgroundColor: '#ffffff' },
  searchModalContent: { gap: 12, padding: 16 },
  searchbar: { height: 44, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.24)', backgroundColor: '#ffffff' },
  searchbarInput: { minHeight: 0, paddingVertical: 0 },
  searchLoading: { paddingVertical: 8 },
  searchList: { maxHeight: 360 },
  searchResultButton: { minHeight: 56, justifyContent: 'flex-start', alignItems: 'center', paddingVertical: 8 },
  searchResultLabel: { width: '100%', textAlign: 'left', lineHeight: 20 },
  emptySearch: { color: '#666666', paddingVertical: 16, textAlign: 'center' },
});
