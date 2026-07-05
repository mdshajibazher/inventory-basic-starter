'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Pagination, TableWrap } from '@/components/resource-shell';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { api, type PaymentPayload } from '@/lib/api';
import type { Account, Customer, InvoiceOption, PaginatedResponse, PaginationMeta, Payment, PaymentDirection, PaymentType, Supplier } from '@/lib/types';

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
  change: '0',
  payingMethod: 'Cash',
  paymentReference: '',
  paymentNote: '',
};

export function PaymentsPage() {
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

  const canCreate = hasPermission(['sales-add', 'purchases-add', 'accounts-index']);
  const direction = directionFor(form.paymentType);
  const invoicePayment = isInvoicePayment(form.paymentType);

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
      toast.error('Unable to load payments', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [ledgerAccount?.id, ledgerCustomer?.id, ledgerDirection, ledgerPartyKind, ledgerSupplier?.id, ledgerType, statementAccount, statementCustomer, statementSupplier, view]);

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

    return [];
  }, [form.customer?.id, form.paymentType, form.supplier?.id]);

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(form.amount);
    const change = invoicePayment ? Number(form.change || 0) : 0;

    if (!form.account || !amount || amount <= 0) {
      toast.error('Missing payment fields', { description: 'Account and an amount greater than 0 are required.' });
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
      toast.success('Payment recorded');
      setModalOpen(false);
      setForm(initialForm);
      void loadPayments(1);
    } catch (error) {
      toast.error('Unable to record payment', { description: errorMessage(error) });
    } finally {
      setSaving(false);
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

  function updatePartyKind(kind: PartyKind) {
    setForm((current) => ({
      ...current,
      partyKind: kind,
      customer: kind === 'customer' ? current.customer : null,
      supplier: kind === 'supplier' ? current.supplier : null,
      paymentType: kind === 'customer' ? 'customer_advance' : 'supplier_advance',
      invoice: null,
      change: '0',
    }));
  }

  function updatePaymentType(type: PaymentType) {
    setForm((current) => ({ ...current, paymentType: type, invoice: null, change: '0' }));
  }

  function selectInvoice(invoice: InvoiceOption) {
    const due = invoiceDue(invoice);
    setForm((current) => ({
      ...current,
      invoice,
      amount: isInvoicePayment(current.paymentType) && due > 0 ? String(due) : current.amount,
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

  const typeOptions = useMemo(
    () => (form.partyKind === 'customer' ? customerTypes : supplierTypes).map((type) => ({ value: type, label: paymentTypeLabels[type] })),
    [form.partyKind]
  );

  return (
    <div>
      <PageHeader title="Payments" subtitle={`${pagination?.total ?? payments.length} payment records`} actionLabel="Record Payment" canAdd={canCreate} onAdd={() => setModalOpen(true)} />

      <div className="mb-4 flex flex-wrap gap-2">
        {(['ledger', 'customer', 'supplier', 'account'] as ViewMode[]).map((mode) => (
          <Button key={mode} variant={view === mode ? 'primary' : 'secondary'} onClick={() => { setView(mode); setPage(1); }}>
            {mode === 'ledger' ? 'All Payments' : `${capitalize(mode)} Statement`}
          </Button>
        ))}
      </div>

      <Filters
        view={view}
        ledgerPartyKind={ledgerPartyKind}
        setLedgerPartyKind={setLedgerPartyKind}
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

      {payments.length ? <PaymentTable payments={payments} saving={saving} onApprove={(id) => void approvePayment(id)} /> : <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">{loading ? 'Loading payments...' : 'No payments found.'}</div>}
      <Pagination meta={pagination} loading={loading} onPage={(nextPage) => void loadPayments(nextPage)} />

      <Modal title="Record Payment" open={modalOpen} onOpenChange={setModalOpen}>
        <form onSubmit={submitPayment} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Party Type">
              <Select
                value={form.partyKind}
                onValueChange={(value) => updatePartyKind(value as PartyKind)}
                options={[
                  { value: 'customer', label: 'Customer' },
                  { value: 'supplier', label: 'Supplier' },
                ]}
              />
            </Field>
            <Field label="Payment Type">
              <Select value={form.paymentType} onValueChange={(value) => updatePaymentType(value as PaymentType)} options={typeOptions} />
            </Field>
            {form.partyKind === 'customer' ? (
              <SearchableSelect
                label="Customer"
                valueLabel={form.customer?.name ?? 'Select customer'}
                placeholder="Search customers"
                search={searchCustomers}
                keyFor={(customer) => customer.id}
                labelFor={(customer) => customer.name}
                detailFor={(customer) => customer.phone_number}
                onSelect={(customer) => setForm((current) => ({ ...current, customer, invoice: null }))}
              />
            ) : (
              <SearchableSelect
                label="Supplier"
                valueLabel={form.supplier?.name ?? 'Select supplier'}
                placeholder="Search suppliers"
                search={searchSuppliers}
                keyFor={(supplier) => supplier.id}
                labelFor={(supplier) => supplier.name}
                detailFor={(supplier) => supplier.phone_number}
                onSelect={(supplier) => setForm((current) => ({ ...current, supplier, invoice: null }))}
              />
            )}
            <SearchableSelect
              label="Account"
              valueLabel={form.account ? `${form.account.name} (${form.account.account_no})` : 'Select account'}
              placeholder="Search accounts"
              search={searchAccounts}
              keyFor={(account) => account.id}
              labelFor={(account) => account.name}
              detailFor={(account) => account.account_no}
              onSelect={(account) => setForm((current) => ({ ...current, account }))}
            />
            {requiresInvoice(form.paymentType) ? (
              <SearchableSelect
                label="Reference Document"
                valueLabel={form.invoice?.reference_no ?? 'Optional invoice/return'}
                placeholder="Search by reference no"
                search={searchInvoices}
                keyFor={(invoice) => invoice.id}
                labelFor={(invoice) => invoice.reference_no}
                detailFor={(invoice) => invoiceDetail(invoice)}
                onSelect={selectInvoice}
                disabled={(form.paymentType === 'purchase_payment' && !form.supplier) || (form.paymentType !== 'purchase_payment' && !form.customer)}
              />
            ) : null}
            <Field label="Direction">
              <Input value={direction} readOnly />
            </Field>
            <Field label="Amount">
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateAmount(event.target.value)} required />
            </Field>
            {invoicePayment ? (
              <Field label="Change">
                <Input type="number" min="0" step="0.01" value={form.change} readOnly />
              </Field>
            ) : null}
            <Field label="Paying Method">
              <Select value={form.payingMethod} onValueChange={(value) => setForm((current) => ({ ...current, payingMethod: value }))} options={methods.map((method) => ({ value: method, label: method }))} />
            </Field>
            <Field label="Payment Reference">
              <Input value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="Auto generated if empty" />
            </Field>
          </div>
          <Field label="Payment Note">
            <Textarea value={form.paymentNote} onChange={(event) => setForm((current) => ({ ...current, paymentNote: event.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Filters(props: {
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
  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-3">
      {props.view === 'ledger' ? (
        <>
          <Field label="Party Filter">
            <Select
              value={props.ledgerPartyKind}
              onValueChange={(value) => {
                props.setLedgerPartyKind(value as 'all' | PartyKind);
                props.setLedgerCustomer(null);
                props.setLedgerSupplier(null);
              }}
              options={[
                { value: 'all', label: 'All parties' },
                { value: 'customer', label: 'Customer' },
                { value: 'supplier', label: 'Supplier' },
              ]}
            />
          </Field>
          {props.ledgerPartyKind === 'customer' ? (
            <SearchableSelect label="Customer" valueLabel={props.ledgerCustomer?.name ?? 'Any customer'} placeholder="Search customers" search={props.searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerCustomer} />
          ) : null}
          {props.ledgerPartyKind === 'supplier' ? (
            <SearchableSelect label="Supplier" valueLabel={props.ledgerSupplier?.name ?? 'Any supplier'} placeholder="Search suppliers" search={props.searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setLedgerSupplier} />
          ) : null}
          <SearchableSelect label="Account" valueLabel={props.ledgerAccount ? `${props.ledgerAccount.name} (${props.ledgerAccount.account_no})` : 'Any account'} placeholder="Search accounts" search={props.searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={props.setLedgerAccount} />
          <Field label="Payment Type">
            <Select value={props.ledgerType} onValueChange={(value) => props.setLedgerType(value as PaymentType | 'all')} options={[{ value: 'all', label: 'All types' }, ...Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))]} />
          </Field>
          <Field label="Direction">
            <Select value={props.ledgerDirection} onValueChange={(value) => props.setLedgerDirection(value as PaymentDirection | 'all')} options={[{ value: 'all', label: 'All directions' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} />
          </Field>
        </>
      ) : null}
      {props.view === 'customer' ? (
        <SearchableSelect label="Customer Statement" valueLabel={props.statementCustomer?.name ?? 'Select customer'} placeholder="Search customers" search={props.searchCustomers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setStatementCustomer} />
      ) : null}
      {props.view === 'supplier' ? (
        <SearchableSelect label="Supplier Statement" valueLabel={props.statementSupplier?.name ?? 'Select supplier'} placeholder="Search suppliers" search={props.searchSuppliers} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.phone_number} onSelect={props.setStatementSupplier} />
      ) : null}
      {props.view === 'account' ? (
        <SearchableSelect label="Account Statement" valueLabel={props.statementAccount ? `${props.statementAccount.name} (${props.statementAccount.account_no})` : 'Select account'} placeholder="Search accounts" search={props.searchAccounts} keyFor={(item) => item.id} labelFor={(item) => item.name} detailFor={(item) => item.account_no} onSelect={props.setStatementAccount} />
      ) : null}
    </div>
  );
}

function PaymentTable({ payments, saving, onApprove }: { payments: Payment[]; saving: boolean; onApprove: (id: number) => void }) {
  return (
    <TableWrap>
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Party</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Approval</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id} className="border-t border-neutral-100">
              <td className="px-4 py-3 font-medium">{payment.payment_reference}</td>
              <td className="px-4 py-3">{paymentTypeLabels[payment.payment_type] ?? payment.payment_type}</td>
              <td className="px-4 py-3">{payment.customer?.name ?? payment.supplier?.name ?? '-'}</td>
              <td className="px-4 py-3">{payment.account?.name ?? '-'}</td>
              <td className="px-4 py-3">{documentLabel(payment)}</td>
              <td className="px-4 py-3">{payment.paying_method}</td>
              <td className="px-4 py-3"><ApprovalBadge status={payment.approval_status} /></td>
              <td className={payment.direction === 'in' ? 'px-4 py-3 text-right font-medium text-green-700' : 'px-4 py-3 text-right font-medium text-red-700'}>
                {payment.direction === 'in' ? '+' : '-'}{money(payment.amount)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link className="mr-2 inline-flex h-10 items-center rounded-md px-3 text-sm font-medium hover:bg-neutral-100" href={`/payments/${payment.id}`}>Details</Link>
                {payment.can_approve ? <Button type="button" variant="secondary" disabled={saving} onClick={() => onApprove(payment.id)}>Approve</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function ApprovalBadge({ status }: { status: unknown }) {
  const pending = status === 'pending';
  return (
    <span className={pending ? 'inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800' : 'inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800'}>
      {pending ? 'Pending' : 'Approved'}
    </span>
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
};

function SearchableSelect<T>({ label, valueLabel, placeholder, search, keyFor, labelFor, detailFor, onSelect, disabled }: SearchableSelectProps<T>) {
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
      <span className="font-medium text-neutral-900">{label}</span>
      <Button type="button" variant="secondary" className="h-10 w-full justify-between overflow-hidden px-3 text-left font-normal" disabled={disabled} onClick={openSearch}>
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
  return ['sale_payment', 'purchase_payment', 'sale_return_refund'].includes(type);
}

function isInvoicePayment(type: PaymentType): boolean {
  return ['sale_payment', 'purchase_payment'].includes(type);
}

function documentLabel(payment: Payment): string {
  return payment.reference_document?.reference_no || payment.sale?.reference_no || payment.purchase?.reference_no || payment.sale_return?.reference_no || payment.purchase_return?.reference_no || paymentTypeLabels[payment.payment_type] || '-';
}

function invoiceDetail(invoice: InvoiceOption): string {
  return `Total ${money(invoice.grand_total ?? 0)}, paid ${money(invoice.paid_amount ?? 0)}, due ${money(invoiceDue(invoice))}`;
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Try again.';
}
