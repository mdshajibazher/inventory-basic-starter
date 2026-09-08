'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Building2, CalendarDays, CheckCircle2, ChevronDown, Eye, FileText, Filter, Hash, Landmark, Pencil, Plus, ReceiptText, RotateCcw, Save, Search, Smartphone, TrendingUp, UserRound, WalletCards } from 'lucide-react';
import { Pagination } from '@/components/resource-shell';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { api, type PaymentPayload } from '@/lib/api';
import type { Account, Customer, InvoiceOption, PaginatedResponse, PaginationMeta, Payment, PaymentDirection, PaymentType, Supplier } from '@/lib/types';
import { clsx } from '@/lib/utils';
import { canChoosePaymentType, canEditPaymentType, initialPaymentType, selectablePaymentTypes } from './payment-entry-policy';
import { defaultPaymentListFilters, filterPayments } from './payment-list-display';

type PartyKind = 'customer' | 'supplier';
type PaymentPageMode = 'customer-payments' | 'supplier-payments';

type PaymentForm = {
  partyKind: PartyKind;
  customer: Customer | null;
  supplier: Supplier | null;
  account: Account | null;
  paymentType: PaymentType;
  invoice: InvoiceOption | null;
  amount: string;
  discountAmount: string;
  cashReceived: string;
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

const customerPaymentTypes: PaymentType[] = ['sale_payment', 'customer_advance', 'sale_return_refund'];
const supplierPaymentTypes: PaymentType[] = ['purchase_payment', 'supplier_advance', 'purchase_return_refund'];
const methods = ['Cash', 'Cheque', 'Credit Card', 'Gift Card', 'Paypal', 'Bank Transfer', 'Deposit'];

function initialFormFor(mode: PaymentPageMode): PaymentForm {
  const supplierMode = mode === 'supplier-payments';
  return {
    partyKind: supplierMode ? 'supplier' : 'customer',
    customer: null,
    supplier: null,
    account: null,
    paymentType: initialPaymentType(supplierMode ? 'supplier' : 'customer'),
    invoice: null,
    amount: '',
    discountAmount: '0',
    cashReceived: '',
    change: '0',
    payingMethod: 'Cash',
    paymentReference: '',
    paymentNote: '',
  };
}

export function PaymentsPage({ mode }: { mode: PaymentPageMode }) {
  const { hasPermission, user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null);
  const [ledgerType, setLedgerType] = useState<PaymentType | 'all'>('all');
  const [ledgerDirection, setLedgerDirection] = useState<PaymentDirection | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState(defaultPaymentListFilters.searchTerm);
  const [dateFrom, setDateFrom] = useState(defaultPaymentListFilters.dateFrom);
  const [dateTo, setDateTo] = useState(defaultPaymentListFilters.dateTo);
  const [form, setForm] = useState<PaymentForm>(() => initialFormFor(mode));

  const canCreate = hasPermission(['sales-add', 'purchases-add', 'accounts-index']);
  const direction = directionFor(form.paymentType);
  const cashSalePayment = form.paymentType === 'sale_payment' && form.payingMethod === 'Cash';
  const supplierMode = mode === 'supplier-payments';
  const pageTitle = supplierMode ? 'Supplier Payments' : 'Customer Payments';
  const pagePaymentTypes = supplierMode ? supplierPaymentTypes : customerPaymentTypes;
  const maxDiscount = form.paymentType === 'customer_advance'
    ? Math.max(roundMoney(Number(form.amount || 0)), 0)
    : form.paymentType === 'sale_payment' && form.invoice
      ? Math.max(roundMoney(invoiceDue(form.invoice) - Number(form.amount || 0)), 0)
      : 0;
  const discountError = paymentDiscountError(form.paymentType, form.invoice, form.amount, form.discountAmount, maxDiscount);

  const loadPayments = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const response: PaginatedResponse<Payment> = await api.payments({
        page: nextPage,
        perPage,
        customerId: supplierMode ? null : ledgerCustomer?.id,
        supplierId: supplierMode ? ledgerSupplier?.id : null,
        accountId: ledgerAccount?.id,
        paymentType: ledgerType,
        paymentTypes: ledgerType === 'all' ? pagePaymentTypes : undefined,
        direction: ledgerDirection,
      });

      setPayments(response.data);
      setPagination(response.meta ?? null);
      setPage(nextPage);
    } catch (error) {
      toast.error('Unable to load payments', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [ledgerAccount?.id, ledgerCustomer?.id, ledgerDirection, ledgerSupplier?.id, ledgerType, pagePaymentTypes, perPage, supplierMode]);

  useEffect(() => {
    setForm(initialFormFor(mode));
    setLedgerCustomer(null);
    setLedgerSupplier(null);
    setLedgerAccount(null);
    setLedgerType('all');
    setLedgerDirection('all');
    setPage(1);
  }, [mode]);

  useEffect(() => {
    void loadPayments(1);
  }, [loadPayments]);

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

    if (form.paymentType === 'purchase_return_refund') {
      const response = await api.purchaseReturnInvoiceOptions({ search: query, supplierId: form.supplier?.id, approvedOnly: true });
      return response.data;
    }

    return [];
  }, [form.customer?.id, form.paymentType, form.supplier?.id]);

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(form.amount);
    const discountAmount = form.paymentType === 'sale_payment' || form.paymentType === 'customer_advance' ? Number(form.discountAmount || 0) : 0;
    const change = cashSalePayment ? Number(form.change || 0) : 0;

    if (!form.account || !amount || amount <= 0) {
      toast.error('Missing payment fields', { description: 'Account and an amount greater than 0 are required.' });
      return;
    }

    if (discountError) {
      toast.error('Invalid discount', { description: discountError });
      return;
    }

    if (form.partyKind === 'customer' && !form.customer) {
      toast.error('Missing customer');
      return;
    }

    if (form.partyKind === 'supplier' && !form.supplier) {
      toast.error('Missing supplier');
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
      purchase_return_id: form.paymentType === 'purchase_return_refund' ? form.invoice?.id ?? null : null,
    };

    setSaving(true);
    try {
      if (editingPayment) {
        await api.updatePayment(editingPayment.id, payload);
      } else {
        await api.createPayment(payload);
      }
      toast.success(editingPayment ? 'Payment updated' : 'Payment recorded');
      setModalOpen(false);
      setEditingPayment(null);
      setForm(initialFormFor(mode));
      void loadPayments(editingPayment ? page : 1);
    } catch (error) {
      toast.error(editingPayment ? 'Unable to update payment' : 'Unable to record payment', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function openCreatePayment() {
    setEditingPayment(null);
    setForm(initialFormFor(mode));
    setModalOpen(true);
  }

  function openEditPayment(payment: Payment) {
    const invoice = paymentInvoice(payment);
    const amount = String(payment.amount ?? '');
    const change = String(payment.change ?? 0);

    setEditingPayment(payment);
    setForm({
      partyKind: supplierMode ? 'supplier' : 'customer',
      customer: supplierMode ? null : (payment.customer as Customer | null | undefined) ?? null,
      supplier: supplierMode ? (payment.supplier as Supplier | null | undefined) ?? null : null,
      account: (payment.account as Account | null | undefined) ?? null,
      paymentType: payment.payment_type,
      invoice,
      amount,
      discountAmount: String(payment.discount_amount ?? 0),
      cashReceived: payment.payment_type === 'sale_payment' && payment.paying_method === 'Cash'
        ? String(roundMoney(Number(amount) + Number(change)))
        : '',
      change,
      payingMethod: payment.paying_method,
      paymentReference: payment.payment_reference ?? '',
      paymentNote: payment.payment_note ?? '',
    });
    setModalOpen(true);
  }

  function changeModalOpen(open: boolean) {
    setModalOpen(open);
    if (!open) {
      setEditingPayment(null);
      setForm(initialFormFor(mode));
    }
  }

  async function approvePayment(id: number) {
    setSaving(true);
    try {
      await api.approvePayment(id);
      toast.success('Payment approved');
      void loadPayments(page);
    } catch (error) {
      toast.error('Approval failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function updatePaymentType(type: PaymentType) {
    setForm((current) => ({
      ...current,
      partyKind: supplierMode ? 'supplier' : 'customer',
      customer: supplierMode ? null : current.customer,
      supplier: supplierMode ? current.supplier : null,
      paymentType: type,
      invoice: null,
      cashReceived: '',
      discountAmount: '0',
      change: '0',
    }));
  }

  function selectInvoice(invoice: InvoiceOption) {
    const due = invoiceDue(invoice);
    setForm((current) => ({
      ...current,
      invoice,
      amount: isInvoicePayment(current.paymentType) && due > 0 ? String(due) : current.amount,
      discountAmount: '0',
      cashReceived: '',
      change: '0',
    }));
  }

  function updateAmount(amount: string) {
    setForm((current) => ({
      ...current,
      amount,
      change: current.paymentType === 'sale_payment' && current.payingMethod === 'Cash' ? calculatedChange(current.cashReceived, amount) : '0',
    }));
  }

  function updateCashReceived(cashReceived: string) {
    setForm((current) => ({
      ...current,
      cashReceived,
      change: current.paymentType === 'sale_payment' && current.payingMethod === 'Cash' ? calculatedChange(cashReceived, current.amount) : '0',
    }));
  }

  const typeOptions = useMemo(
    () => selectablePaymentTypes(supplierMode ? 'supplier' : 'customer').map((type) => ({ value: type, label: paymentTypeLabels[type] })),
    [supplierMode]
  );
  const displayedPayments = useMemo(
    () => filterPayments(payments, { searchTerm, dateFrom, dateTo }),
    [dateFrom, dateTo, payments, searchTerm]
  );
  const totals = useMemo(() => paymentTotals(displayedPayments), [displayedPayments]);
  const branchLabel = user?.current_biller?.name ?? 'Head Office';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{pageTitle}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <span>Home</span>
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-slate-400" />
            <span>Payments</span>
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-slate-400" />
            <span className="font-medium text-slate-700">{pageTitle}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="secondary" className="h-11 min-w-40 justify-between border-slate-200 bg-white text-slate-900">
            <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" />{branchLabel}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <div className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900">
            <CalendarDays className="h-4 w-4 text-slate-700" />
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 w-32 border-0 px-0 focus:border-0" />
            <span className="text-slate-400">-</span>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 w-32 border-0 px-0 focus:border-0" />
          </div>
          {canCreate ? (
            <Button onClick={openCreatePayment} className="h-11 bg-emerald-600 px-5 hover:bg-emerald-700">
              <Plus className="h-4 w-4" />
              New {supplierMode ? 'Supplier' : 'Customer'} Payment
            </Button>
          ) : null}
        </div>
      </div>

      <PaymentStats totals={totals} mode={mode} />

      <Filters
        mode={mode}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
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
        searchCustomers={searchCustomers}
        searchSuppliers={searchSuppliers}
        searchAccounts={searchAccounts}
      />

      {displayedPayments.length ? <PaymentTable payments={displayedPayments} loading={loading} saving={saving} canEdit={(payment) => Boolean(payment.can_edit) && canEditPaymentType(supplierMode ? 'supplier' : 'customer', payment.payment_type)} onApprove={(id) => void approvePayment(id)} onEdit={openEditPayment} /> : <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{loading ? 'Loading payments...' : 'No payments found.'}</div>}
      <Pagination meta={pagination} loading={loading} onPage={(nextPage) => void loadPayments(nextPage)} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />
      <PaymentTotals totals={totals} mode={mode} />

      <Modal title={editingPayment ? 'Edit Payment' : 'Record Payment'} description={modalDescription(form.paymentType)} open={modalOpen} onOpenChange={changeModalOpen} contentClassName="max-w-5xl p-0">
        <form onSubmit={submitPayment} className="grid gap-5 p-5 pt-0">
          <p className="-mt-3 text-sm text-neutral-500">{modalDescription(form.paymentType)}</p>
          {canChoosePaymentType(form.partyKind) ? <PaymentTypeTabs value={form.paymentType} options={typeOptions} onChange={(type) => updatePaymentType(type)} /> : null}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                {supplierMode ? (
                  <SearchableSelect
                    label="Supplier *"
                    valueLabel={form.supplier?.name ?? 'Select supplier'}
                    placeholder="Search suppliers"
                    search={searchSuppliers}
                    keyFor={(supplier) => supplier.id}
                    labelFor={(supplier) => supplier.name}
                    detailFor={(supplier) => supplier.phone_number}
                    onSelect={(supplier) => setForm((current) => ({ ...current, partyKind: 'supplier', supplier, customer: null, invoice: null }))}
                    icon={<UserRound className="h-4 w-4" />}
                  />
                ) : (
                  <SearchableSelect
                    label="Customer *"
                    valueLabel={form.customer?.name ?? 'Select customer'}
                    placeholder="Search customers"
                    search={searchCustomers}
                    keyFor={(customer) => customer.id}
                    labelFor={(customer) => customer.name}
                    detailFor={(customer) => customer.phone_number}
                    onSelect={(customer) => setForm((current) => ({ ...current, partyKind: 'customer', customer, supplier: null, invoice: null }))}
                    icon={<UserRound className="h-4 w-4" />}
                  />
                )}
                {requiresInvoice(form.paymentType) ? (
                  <SearchableSelect
                    label={invoiceSelectLabel(form.paymentType)}
                    valueLabel={form.invoice?.reference_no ?? invoiceSelectPlaceholder(form.paymentType)}
                    placeholder="Search by reference no"
                    search={searchInvoices}
                    keyFor={(invoice) => invoice.id}
                    labelFor={(invoice) => invoice.reference_no}
                    detailFor={(invoice) => invoiceDetail(invoice)}
                    onSelect={selectInvoice}
                    disabled={supplierMode ? !form.supplier : !form.customer}
                    icon={<FileText className="h-4 w-4" />}
                  />
                ) : (
                  <Field label="Payment Date *">
                    <IconInput icon={<CalendarDays className="h-4 w-4" />}><Input value={new Date().toISOString().slice(0, 10)} readOnly /></IconInput>
                  </Field>
                )}
                {requiresInvoice(form.paymentType) ? (
                  <Field label="Payment Date *">
                    <IconInput icon={<CalendarDays className="h-4 w-4" />}><Input value={new Date().toISOString().slice(0, 10)} readOnly /></IconInput>
                  </Field>
                ) : null}
                <Field label={form.paymentType.includes('refund') ? 'Refund Method *' : 'Payment Method *'}>
                  <IconInput icon={<Banknote className="h-4 w-4" />}>
                    <Select
                      value={form.payingMethod}
                      onValueChange={(value) => setForm((current) => ({ ...current, payingMethod: value, cashReceived: value === 'Cash' ? current.cashReceived : '', change: '0' }))}
                      options={methods.map((method) => ({ value: method, label: method }))}
                    />
                  </IconInput>
                </Field>
                <SearchableSelect
                  label="Account *"
                  valueLabel={form.account ? `${form.account.name}${form.account.account_no ? ` (${form.account.account_no})` : ''}` : 'Select account'}
                  placeholder="Search accounts"
                  search={searchAccounts}
                  keyFor={(account) => account.id}
                  labelFor={(account) => account.name}
                  detailFor={(account) => account.account_no}
                  onSelect={(account) => setForm((current) => ({ ...current, account }))}
                  icon={<Landmark className="h-4 w-4" />}
                />
                <Field label={`${amountLabel(form.paymentType)} *`}>
                  <IconInput icon={<span className="text-sm font-semibold">৳</span>}><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateAmount(event.target.value)} required /></IconInput>
                </Field>
                {form.paymentType === 'sale_payment' || form.paymentType === 'customer_advance' ? (
                  <Field label={form.paymentType === 'customer_advance' ? 'Discount / Charge' : 'Discount Amount'}>
                    <IconInput icon={<span className="text-sm font-semibold">৳</span>}><Input type="number" min="0" step="0.01" max={maxDiscount} value={form.discountAmount} onChange={(event) => setForm((current) => ({ ...current, discountAmount: event.target.value }))} aria-invalid={Boolean(discountError)} className={discountError ? 'border-red-500 focus-visible:ring-red-500' : undefined} /></IconInput>
                    <p className={discountError ? 'mt-1 text-xs text-red-600' : 'mt-1 text-xs text-neutral-500'}>
                      {discountError ?? `Maximum available discount: ${bdt(maxDiscount)}`}
                    </p>
                  </Field>
                ) : null}
                {cashSalePayment ? (
                  <>
                    <Field label="Cash Received *">
                      <IconInput icon={<span className="text-sm font-semibold">৳</span>}><Input type="number" min="0" step="0.01" value={form.cashReceived} onChange={(event) => updateCashReceived(event.target.value)} /></IconInput>
                    </Field>
                    <Field label="Change Amount">
                      <IconInput icon={<span className="text-sm font-semibold">৳</span>}><Input type="number" min="0" step="0.01" value={form.change} readOnly className="bg-neutral-50" /></IconInput>
                    </Field>
                  </>
                ) : null}
              </div>
              <Field label="Transaction ID / Reference">
                <IconInput icon={<Hash className="h-4 w-4" />}><Input value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="Auto generated if empty" /></IconInput>
              </Field>
              <Field label={form.paymentType === 'customer_advance' || form.paymentType === 'supplier_advance' ? 'Purpose / Note' : 'Payment Note'}>
                <Textarea value={form.paymentNote} onChange={(event) => setForm((current) => ({ ...current, paymentNote: event.target.value }))} maxLength={200} className="min-h-16" />
              </Field>
              <p className="text-xs text-neutral-500">Fields marked with <span className="text-red-500">*</span> are required</p>
            </div>
            <PaymentSummary form={form} />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => changeModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || Boolean(discountError)} className="bg-green-700 hover:bg-green-800">
              <Save className="h-4 w-4" />{saving ? 'Saving...' : editingPayment ? 'Update Payment' : saveLabel(form.paymentType)}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function PaymentTypeTabs({ value, options, onChange }: { value: PaymentType; options: { value: string; label: string }[]; onChange: (type: PaymentType) => void }) {
  const meta: Record<string, { icon: React.ReactNode; subtitle: string }> = {
    sale_payment: { icon: <ReceiptText className="h-5 w-5" />, subtitle: 'Payment against sales invoice' },
    customer_advance: { icon: <UserRound className="h-5 w-5" />, subtitle: 'Advance from customer' },
    purchase_payment: { icon: <WalletCards className="h-5 w-5" />, subtitle: 'Payment against purchase invoice' },
    supplier_advance: { icon: <UserRound className="h-5 w-5" />, subtitle: 'Advance paid to supplier' },
    sale_return_refund: { icon: <RotateCcw className="h-5 w-5" />, subtitle: 'Refund for returned items' },
    purchase_return_refund: { icon: <RotateCcw className="h-5 w-5" />, subtitle: 'Refund received for purchase return' },
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={clsx(
              'flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left transition',
              selected ? 'border-green-600 bg-green-50 text-green-800 shadow-sm' : 'border-neutral-200 bg-white text-neutral-700 hover:border-green-200 hover:bg-green-50/40'
            )}
            onClick={() => onChange(option.value as PaymentType)}
          >
            <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-md', selected ? 'bg-white text-green-700' : 'bg-neutral-50 text-neutral-500')}>{meta[option.value]?.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="block truncate text-xs text-neutral-500">{meta[option.value]?.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PaymentSummary({ form }: { form: PaymentForm }) {
  const supplierPayment = form.partyKind === 'supplier';
  const partyLabel = supplierPayment ? 'Supplier' : 'Customer';
  const partyName = supplierPayment ? form.supplier?.name : form.customer?.name;

  if (form.paymentType === 'customer_advance' || form.paymentType === 'supplier_advance') {
    const currentAdvance = Number(form.customer?.deposit ?? 0);
    const newAdvance = Number(form.amount || 0);
    const adjustment = Number(form.discountAmount || 0);
    const netAdvance = Math.max(roundMoney(newAdvance - adjustment), 0);
    return (
      <SummaryPanel title="Advance Summary" notice="This advance will remain available for future invoice adjustment.">
        <SummaryRow label={partyLabel} value={partyName ?? '-'} />
        {form.paymentType === 'customer_advance' ? (
          <>
            <SummaryRow label="Current Advance Balance" value={bdt(currentAdvance)} />
            <SummaryDivider />
          </>
        ) : null}
        <SummaryRow label="New Advance" value={bdt(newAdvance)} strong success />
        <SummaryRow label="Discount / Charge" value={bdt(adjustment)} />
        <SummaryRow label="Net Advance Credit" value={bdt(netAdvance)} strong success />
        {form.paymentType === 'customer_advance' ? (
          <>
            <SummaryDivider />
            <SummaryRow label="Updated Advance Balance" value={bdt(currentAdvance + netAdvance)} strong success />
          </>
        ) : null}
      </SummaryPanel>
    );
  }

  if (form.paymentType === 'sale_return_refund' || form.paymentType === 'purchase_return_refund') {
    const total = Number(form.invoice?.grand_total ?? 0);
    const refunded = Number(form.invoice?.paid_amount ?? 0);
    const due = invoiceDue(form.invoice);
    const refundAmount = Number(form.amount || 0);
    const documentLabel = form.paymentType === 'purchase_return_refund' ? 'Purchase Return' : 'Sales Return';
    return (
      <SummaryPanel title="Refund Summary" notice={`This refund will be recorded against the selected ${documentLabel.toLowerCase()}.`}>
        <SummaryRow label={partyLabel} value={partyName ?? '-'} />
        <SummaryRow label={documentLabel} value={form.invoice?.reference_no ?? '-'} />
        <SummaryDivider />
        <SummaryRow label="Return Total" value={bdt(total)} />
        <SummaryRow label="Previously Refunded" value={bdt(refunded)} />
        <SummaryRow label="Refund Due" value={bdt(due)} danger />
        <SummaryDivider />
        <SummaryRow label="Refund Amount" value={bdt(refundAmount)} strong success />
        <SummaryRow label="Remaining Refund" value={bdt(Math.max(roundMoney(due - refundAmount), 0))} strong success />
      </SummaryPanel>
    );
  }

  const total = Number(form.invoice?.grand_total ?? 0);
  const paid = Number(form.invoice?.paid_amount ?? 0);
  const due = invoiceDue(form.invoice);
  const paymentAmount = Number(form.amount || 0);
  const discountAmount = form.paymentType === 'sale_payment' ? Number(form.discountAmount || 0) : 0;
  const settledAmount = roundMoney(paymentAmount + discountAmount);
  const remainingDue = Math.max(roundMoney(due - settledAmount), 0);
  const documentName = form.paymentType === 'purchase_payment' ? 'Purchase Invoice' : 'Sales Invoice';
  return (
    <SummaryPanel title="Payment Summary" notice="This payment will be recorded against the selected invoice.">
      <SummaryRow label={partyLabel} value={partyName ?? '-'} />
      <SummaryRow label={documentName} value={form.invoice?.reference_no ?? '-'} />
      <SummaryDivider />
      <SummaryRow label="Invoice Total" value={bdt(total)} />
      <SummaryRow label="Previously Paid" value={bdt(paid)} />
      <SummaryRow label="Current Due" value={bdt(due)} danger />
      <SummaryDivider />
      <SummaryRow label="Payment Amount" value={bdt(paymentAmount)} strong success />
      {form.paymentType === 'sale_payment' ? <SummaryRow label="Discount" value={bdt(discountAmount)} /> : null}
      {form.paymentType === 'sale_payment' ? <SummaryRow label="Total Settled" value={bdt(settledAmount)} strong success /> : null}
      {form.payingMethod === 'Cash' ? (
        <>
          <SummaryRow label="Cash Received" value={bdt(Number(form.cashReceived || 0))} />
          <SummaryRow label="Change Amount" value={bdt(Number(form.change || 0))} />
        </>
      ) : null}
      <SummaryDivider />
      <SummaryRow label="Remaining Due" value={bdt(remainingDue)} strong success />
    </SummaryPanel>
  );
}

function SummaryPanel({ title, notice, children }: { title: string; notice: string; children: React.ReactNode }) {
  return (
    <aside className="grid content-start gap-4">
      <div className="rounded-lg border border-green-100 bg-green-50/40 p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-green-700"><TrendingUp className="h-5 w-5" /></span>
          <h3 className="font-semibold text-neutral-900">{title}</h3>
        </div>
        <div className="grid gap-3 text-sm">{children}</div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-800">
        <CheckCircle2 className="h-5 w-5 shrink-0 fill-green-700 text-white" />
        <span>{notice}</span>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, strong, success, danger }: { label: string; value: string; strong?: boolean; success?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-neutral-600">{label}</span>
      <span className={clsx('text-right text-neutral-900', strong && 'font-semibold', success && 'text-green-700', danger && 'text-orange-600')}>{value}</span>
    </div>
  );
}

function SummaryDivider() {
  return <div className="h-px bg-green-100" />;
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 grid h-5 w-5 -translate-y-1/2 place-items-center text-green-700">{icon}</span>
      <div className="[&>button]:pl-10 [&>input]:pl-10">{children}</div>
    </div>
  );
}

function PaymentStats({ totals, mode }: { totals: PaymentTotalsValue; mode: PaymentPageMode }) {
  const supplierMode = mode === 'supplier-payments';
  const cards = supplierMode ? [
    { label: 'Purchase Payments', value: totals.paid, status: 'Paid', color: 'blue', icon: <WalletCards className="h-6 w-6" /> },
    { label: 'Supplier Advances', value: totals.advance, status: 'Paid', color: 'emerald', icon: <Banknote className="h-6 w-6" /> },
    { label: 'Purchase Return Refunds', value: totals.refund, status: 'Received', color: 'orange', icon: <ReceiptText className="h-6 w-6" /> },
    { label: 'Net Supplier Cash Flow', value: totals.net, status: totals.net >= 0 ? 'Inflow' : 'Outflow', color: 'violet', icon: <TrendingUp className="h-6 w-6" /> },
  ] : [
    { label: 'Sales Payments', value: totals.received, status: 'Received', color: 'emerald', icon: <Banknote className="h-6 w-6" /> },
    { label: 'Customer Advances', value: totals.advance, status: 'Received', color: 'blue', icon: <WalletCards className="h-6 w-6" /> },
    { label: 'Sales Return Refunds', value: totals.refund, status: 'Refunded', color: 'orange', icon: <ReceiptText className="h-6 w-6" /> },
    { label: 'Net Cash Flow', value: totals.net, status: totals.net >= 0 ? 'Inflow' : 'Outflow', color: 'violet', icon: <TrendingUp className="h-6 w-6" /> },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="flex min-h-32 items-center gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <span
            className={clsx(
              'grid h-16 w-16 shrink-0 place-items-center rounded-full',
              card.color === 'emerald' && 'bg-emerald-100 text-emerald-700',
              card.color === 'blue' && 'bg-blue-100 text-blue-700',
              card.color === 'orange' && 'bg-orange-100 text-orange-600',
              card.color === 'violet' && 'bg-violet-100 text-violet-700'
            )}
          >
            {card.icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{bdt(card.value)}</div>
            <div
              className={clsx(
                'mt-2 text-sm font-semibold',
                card.color === 'emerald' && 'text-emerald-700',
                card.color === 'blue' && 'text-blue-700',
                card.color === 'orange' && 'text-orange-600',
                card.color === 'violet' && 'text-violet-700'
              )}
            >
              {card.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Filters(props: {
  mode: PaymentPageMode;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
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
  searchCustomers: (query: string) => Promise<Customer[]>;
  searchSuppliers: (query: string) => Promise<Supplier[]>;
  searchAccounts: (query: string) => Promise<Account[]>;
}) {
  const supplierMode = props.mode === 'supplier-payments';
  const typeOptions = supplierMode ? supplierPaymentTypes : customerPaymentTypes;

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:grid-cols-[minmax(18rem,2fr)_repeat(5,minmax(10rem,1fr))]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={props.searchTerm}
          onChange={(event) => props.setSearchTerm(event.target.value)}
          placeholder="Search by reference, customer/supplier"
          className="h-12 border-slate-200 pl-11 text-slate-700 placeholder:text-slate-500"
        />
      </div>
      {supplierMode ? (
        <SearchableSelect hideLabel label="Supplier" valueLabel={props.ledgerSupplier?.name ?? 'All Suppliers'} placeholder="Search suppliers" search={props.searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerSupplier} buttonClassName="h-12 border-slate-200" />
      ) : (
        <SearchableSelect hideLabel label="Customer" valueLabel={props.ledgerCustomer?.name ?? 'All Customers'} placeholder="Search customers" search={props.searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerCustomer} buttonClassName="h-12 border-slate-200" />
      )}
      <SearchableSelect hideLabel label="Account" valueLabel={props.ledgerAccount ? `${props.ledgerAccount.name} (${props.ledgerAccount.account_no})` : 'All Accounts'} placeholder="Search accounts" search={props.searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={props.setLedgerAccount} buttonClassName="h-12 border-slate-200" />
      <div className="[&>button]:h-12 [&>button]:border-slate-200">
        <Select value={props.ledgerType} onValueChange={(value) => props.setLedgerType(value as PaymentType | 'all')} options={[{ value: 'all', label: 'All types' }, ...typeOptions.map((value) => ({ value, label: paymentTypeLabels[value] }))]} />
      </div>
      <div className="[&>button]:h-12 [&>button]:border-slate-200">
        <Select value={props.ledgerDirection} onValueChange={(value) => props.setLedgerDirection(value as PaymentDirection | 'all')} options={[{ value: 'all', label: 'All directions' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} />
      </div>
      <Button type="button" variant="secondary" className="h-12 justify-center border-slate-200 text-slate-800">
        <Filter className="h-4 w-4" />
        More Filters
      </Button>
    </div>
  );
}

function PaymentTable({ payments, loading, saving, canEdit, onApprove, onEdit }: { payments: Payment[]; loading: boolean; saving: boolean; canEdit: (payment: Payment) => boolean; onApprove: (id: number) => void; onEdit: (payment: Payment) => void }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-700">
          <tr>
            <th className="whitespace-nowrap px-5 py-4">Date</th>
            <th className="whitespace-nowrap px-5 py-4">Type</th>
            <th className="whitespace-nowrap px-5 py-4">Party</th>
            <th className="whitespace-nowrap px-5 py-4">Reference / Invoice</th>
            <th className="whitespace-nowrap px-5 py-4">Payment Method</th>
            <th className="whitespace-nowrap px-5 py-4">Account</th>
            <th className="whitespace-nowrap px-5 py-4 text-right">Amount</th>
            <th className="whitespace-nowrap px-5 py-4 text-right">Discount</th>
            <th className="whitespace-nowrap px-5 py-4 text-right">Settled</th>
            <th className="whitespace-nowrap px-5 py-4">Status</th>
            <th className="whitespace-nowrap px-5 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id} className="border-t border-slate-100 text-slate-950 hover:bg-slate-50/50">
              <td className="whitespace-nowrap px-5 py-4">{formatDate(paymentDateValue(payment))}</td>
              <td className="whitespace-nowrap px-5 py-4"><PaymentTypeBadge type={payment.payment_type} /></td>
              <td className="whitespace-nowrap px-5 py-4 font-medium">{payment.customer?.name ?? payment.supplier?.name ?? '-'}</td>
              <td className="whitespace-nowrap px-5 py-4">{documentLabel(payment) || payment.payment_reference}</td>
              <td className="whitespace-nowrap px-5 py-4">
                <span className="inline-flex items-center gap-2">
                  <PaymentMethodIcon method={payment.paying_method} />
                  {payment.paying_method}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-4">{payment.account?.name ?? '-'}</td>
              <td className={payment.direction === 'in' ? 'whitespace-nowrap px-5 py-4 text-right font-semibold text-emerald-600' : 'whitespace-nowrap px-5 py-4 text-right font-semibold text-red-600'}>
                {bdt(payment.amount)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-amber-700">{bdt(payment.discount_amount ?? 0)}</td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-semibold">{bdt(payment.settled_amount ?? (payment.payment_type === 'customer_advance' ? Number(payment.amount) - Number(payment.discount_amount ?? 0) : Number(payment.amount) + Number(payment.discount_amount ?? 0)))}</td>
              <td className="whitespace-nowrap px-5 py-4"><ApprovalBadge status={payment.approval_status} /></td>
              <td className="whitespace-nowrap px-5 py-4 text-right">
                <Link className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100" href={`/payments/${payment.id}`} aria-label="View payment" title="View payment"><Eye className="h-4 w-4" /></Link>
                {canEdit(payment) ? <Button type="button" variant="secondary" className="mr-2 h-9 w-9 px-0 text-amber-600" disabled={saving} onClick={() => onEdit(payment)} aria-label="Edit payment" title="Edit payment"><Pencil className="h-4 w-4" /></Button> : null}
                {payment.can_approve ? <Button type="button" variant="secondary" className="h-9" disabled={saving} onClick={() => onApprove(payment.id)}>Approve</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? <div className="absolute inset-0 z-10 flex min-h-28 items-center justify-center bg-white/75" role="status" aria-label="Loading table data"><span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" /></div> : null}
    </div>
  );
}

function ApprovalBadge({ status }: { status: unknown }) {
  const pending = status === 'pending';
  return (
    <span className={pending ? 'inline-flex rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800' : 'inline-flex rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'}>
      {pending ? 'Pending' : 'Completed'}
    </span>
  );
}

function PaymentTypeBadge({ type }: { type: PaymentType }) {
  const sale = type === 'sale_payment' || type === 'customer_advance';
  const refund = type.includes('refund');
  return (
    <span
      className={clsx(
        'inline-flex rounded-md px-2.5 py-1 text-xs font-semibold',
        sale && 'bg-emerald-100 text-emerald-700',
        type === 'purchase_payment' || type === 'supplier_advance' ? 'bg-blue-100 text-blue-700' : null,
        refund && 'bg-orange-100 text-orange-600'
      )}
    >
      {paymentTypeLabels[type] ?? type}
    </span>
  );
}

function PaymentMethodIcon({ method }: { method: string }) {
  const normalized = method.toLowerCase();
  const Icon = normalized.includes('bank') ? Landmark : normalized.includes('bkash') || normalized.includes('mobile') ? Smartphone : Banknote;
  return (
    <span className={clsx(
      'grid h-6 w-6 place-items-center rounded-md',
      normalized.includes('bank') ? 'bg-blue-50 text-blue-600' : normalized.includes('bkash') || normalized.includes('mobile') ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
    )}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

type PaymentTotalsValue = {
  received: number;
  advance: number;
  paid: number;
  refund: number;
  net: number;
  discount: number;
};

function PaymentTotals({ totals, mode }: { totals: PaymentTotalsValue; mode: PaymentPageMode }) {
  const supplierMode = mode === 'supplier-payments';
  return (
    <div className={clsx('grid gap-0 rounded-lg border border-slate-200 bg-white shadow-sm sm:grid-cols-2', supplierMode ? 'lg:grid-cols-4' : 'lg:grid-cols-5')}>
      <FooterTotal label={supplierMode ? 'Purchase Payments' : 'Sales Payments'} value={supplierMode ? totals.paid : totals.received} color={supplierMode ? 'text-red-600' : 'text-emerald-600'} />
      <FooterTotal label={supplierMode ? 'Supplier Advances' : 'Customer Advances'} value={totals.advance} color={supplierMode ? 'text-red-600' : 'text-emerald-600'} />
      <FooterTotal label={supplierMode ? 'Purchase Return Refunds' : 'Sales Return Refunds'} value={totals.refund} color={supplierMode ? 'text-emerald-600' : 'text-red-600'} />
      {!supplierMode ? <FooterTotal label="Payment Discounts" value={totals.discount} color="text-amber-600" /> : null}
      <FooterTotal label={supplierMode ? 'Net Supplier Cash Flow' : 'Net Cash Flow'} value={totals.net} color={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'} />
    </div>
  );
}

function FooterTotal({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border-slate-200 p-6 sm:[&:nth-child(even)]:border-l lg:border-l lg:first:border-l-0">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className={clsx('mt-3 text-xl font-semibold', color)}>{bdt(value)}</div>
    </div>
  );
}

type SearchableSelectProps<T> = {
  label: string;
  valueLabel: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  keyFor: (item: T) => string | number;
  labelFor: (item: T) => string;
  detailFor?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  hideLabel?: boolean;
  buttonClassName?: string;
};

function SearchableSelect<T>({ label, valueLabel, placeholder, search, keyFor, labelFor, detailFor, onSelect, disabled, icon, hideLabel, buttonClassName }: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    void search(debouncedQuery)
      .then((nextOptions) => {
        if (requestId.current === currentRequest) setOptions(nextOptions);
      })
      .catch((error) => {
        if (requestId.current === currentRequest) toast.error('Search failed', { description: errorMessage(error) });
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [debouncedQuery, open, search]);

  function openSearch() {
    if (disabled) return;
    setQuery('');
    setDebouncedQuery('');
    setOpen(true);
  }

  return (
    <div className="grid gap-1.5 text-sm">
      <span className={clsx('font-medium text-neutral-900', hideLabel && 'sr-only')}>{label}</span>
      <Button type="button" variant="secondary" className={clsx('h-10 w-full overflow-hidden px-3 text-left font-normal', icon ? 'justify-start' : 'justify-between', buttonClassName)} disabled={disabled} onClick={openSearch}>
        {icon ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-green-50 text-green-700">{icon}</span> : null}
        <span className="truncate">{valueLabel}</span>
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/30 p-4" onPointerDown={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl" onPointerDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-medium">{label}</div>
              <Button type="button" variant="ghost" className="h-8 px-2" onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)}>Close</Button>
            </div>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus />
            <div className="mt-2 max-h-80 overflow-y-auto">
              {loading ? <div className="px-3 py-4 text-sm text-neutral-500">Searching...</div> : null}
              {!loading && !options.length ? <div className="px-3 py-4 text-sm text-neutral-500">No matches found.</div> : null}
              {options.map((option) => {
                const detail = detailFor?.(option);
                return (
                  <button
                    key={keyFor(option)}
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <span className="block font-medium">{labelFor(option)}</span>
                    {detail ? <span className="block text-xs text-neutral-500">{detail}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function directionFor(type: PaymentType): PaymentDirection {
  return ['sale_payment', 'customer_advance', 'purchase_return_refund'].includes(type) ? 'in' : 'out';
}

function requiresInvoice(type: PaymentType): boolean {
  return ['sale_payment', 'purchase_payment', 'sale_return_refund', 'purchase_return_refund'].includes(type);
}

function isInvoicePayment(type: PaymentType): boolean {
  return ['sale_payment', 'purchase_payment'].includes(type);
}

function modalDescription(type: PaymentType): string {
  if (type === 'customer_advance') return 'Receive and track customer advance payment';
  if (type === 'supplier_advance') return 'Record an advance payment to a supplier';
  if (type === 'sale_return_refund') return 'Refund payment against a sales return';
  if (type === 'purchase_return_refund') return 'Receive a refund against a purchase return';
  if (type === 'purchase_payment') return 'Record payment against a purchase invoice';
  return 'Receive payment against a sales invoice';
}

function amountLabel(type: PaymentType): string {
  if (type === 'customer_advance' || type === 'supplier_advance') return 'Advance Amount';
  if (type === 'sale_return_refund' || type === 'purchase_return_refund') return 'Refund Amount';
  return 'Payment Amount';
}

function saveLabel(type: PaymentType): string {
  if (type === 'customer_advance' || type === 'supplier_advance') return 'Save Advance';
  if (type === 'sale_return_refund' || type === 'purchase_return_refund') return 'Save Refund';
  return 'Save Payment';
}

function invoiceSelectLabel(type: PaymentType): string {
  if (type === 'sale_return_refund') return 'Sales Return *';
  if (type === 'purchase_return_refund') return 'Purchase Return *';
  if (type === 'purchase_payment') return 'Purchase Invoice *';
  return 'Sales Invoice *';
}

function invoiceSelectPlaceholder(type: PaymentType): string {
  if (type === 'sale_return_refund') return 'Select sales return';
  if (type === 'purchase_return_refund') return 'Select purchase return';
  if (type === 'purchase_payment') return 'Select purchase invoice';
  return 'Select sales invoice';
}

function documentLabel(payment: Payment): string {
  return payment.reference_document?.reference_no || payment.sale?.reference_no || payment.purchase?.reference_no || payment.sale_return?.reference_no || payment.purchase_return?.reference_no || paymentTypeLabels[payment.payment_type] || '-';
}

function paymentInvoice(payment: Payment): InvoiceOption | null {
  if (payment.payment_type === 'sale_payment') return payment.sale ?? null;
  if (payment.payment_type === 'purchase_payment') return payment.purchase ?? null;
  if (payment.payment_type === 'sale_return_refund') return payment.sale_return ?? null;
  if (payment.payment_type === 'purchase_return_refund') return payment.purchase_return ?? null;
  return null;
}

function paymentDateValue(payment: Payment): string {
  return String(payment.created_at ?? payment.updated_at ?? '').slice(0, 10);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function paymentTotals(payments: Payment[]): PaymentTotalsValue {
  return payments.reduce<PaymentTotalsValue>((totals, payment) => {
    const amount = Number(payment.amount ?? 0);
    totals.discount += Number(payment.discount_amount ?? 0);
    if (payment.payment_type === 'sale_payment') totals.received += amount;
    if (payment.payment_type === 'customer_advance' || payment.payment_type === 'supplier_advance') totals.advance += amount;
    if (payment.payment_type === 'purchase_payment') totals.paid += amount;
    if (payment.payment_type === 'sale_return_refund' || payment.payment_type === 'purchase_return_refund') totals.refund += amount;
    totals.net += payment.direction === 'in' ? amount : -amount;
    return totals;
  }, { received: 0, advance: 0, paid: 0, refund: 0, net: 0, discount: 0 });
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
  if (type === 'customer_advance' && roundMoney(discount) > maxDiscount) return `Discount / charge cannot exceed ${bdt(maxDiscount)}.`;
  if (type === 'sale_payment' && discount > 0 && !invoice) return 'Select a sales invoice before applying a discount.';
  if (invoice && Number.isFinite(amount) && roundMoney(amount) > invoiceDue(invoice)) return 'Payment amount already exceeds the current invoice due.';
  if (roundMoney(discount) > maxDiscount) return `Discount cannot exceed ${bdt(maxDiscount)}.`;
  return null;
}

function invoiceDue(invoice: InvoiceOption | null): number {
  if (!invoice) return 0;
  const due = invoice.due_amount ?? Number(invoice.grand_total ?? 0) - Number(invoice.paid_amount ?? 0);
  return Math.max(roundMoney(Number(due)), 0);
}

function calculatedChange(cashReceived: string, paymentAmount: string): string {
  return String(Math.max(roundMoney(Number(cashReceived || 0) - Number(paymentAmount || 0)), 0));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function bdt(value: number | string | null | undefined): string {
  return `৳${money(value)}`;
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Try again.';
}
