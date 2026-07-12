'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';
import { ActionButton, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { api, type ExpensePayload } from '@/lib/api';
import type { Account, Expense, ExpenseCategory, PaginationMeta, Warehouse } from '@/lib/types';
import { errorMessage, toNumber } from '@/lib/utils';

const defaultPerPage = 15;
const noneValue = '__none__';

type ExpenseForm = {
  referenceNo: string;
  expenseCategoryId: string;
  warehouseId: string;
  accountId: string;
  amount: string;
  expenseDate: string;
  note: string;
};

const emptyForm: ExpenseForm = {
  referenceNo: '',
  expenseCategoryId: noneValue,
  warehouseId: noneValue,
  accountId: noneValue,
  amount: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  note: '',
};

export function ExpensesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const canAdd = hasPermission('expenses-add');
  const canEdit = hasPermission('expenses-edit');
  const canDelete = hasPermission('expenses-delete');

  const categoryOptions = useMemo(() => selectOptions(categories, 'Select category'), [categories]);
  const warehouseOptions = useMemo(() => selectOptions(warehouses, 'Select warehouse'), [warehouses]);
  const accountOptions = useMemo(() => [
    { value: noneValue, label: 'Select account' },
    ...accounts.map((account) => ({ value: String(account.id), label: `${account.name} (${account.account_no})` })),
  ], [accounts]);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.expenses({ page: nextPage, perPage, search: debouncedSearch });
      setExpenses(response.data);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, perPage]);

  useEffect(() => {
    if (!hasPermission('expenses-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    Promise.all([
      api.expenseCategories({ perPage: 100, activeOnly: true }),
      api.warehouses({ perPage: 100, activeOnly: true }),
      api.accounts({ perPage: 100, activeOnly: true }),
    ])
      .then(([categoryResponse, warehouseResponse, accountResponse]) => {
        setCategories(categoryResponse.data as ExpenseCategory[]);
        setWarehouses(warehouseResponse.data as Warehouse[]);
        setAccounts(accountResponse.data as Account[]);
      })
      .catch((error) => toast.error('Options failed', { description: errorMessage(error) }));
  }, []);

  function setValue<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditingExpense(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setForm({
      referenceNo: expense.reference_no,
      expenseCategoryId: String(expense.expense_category_id),
      warehouseId: String(expense.warehouse_id),
      accountId: String(expense.account_id),
      amount: String(expense.amount),
      expenseDate: expense.expense_date ?? String(expense.created_at ?? '').slice(0, 10),
      note: expense.note ?? '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingExpense(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = toNumber(form.amount);

    if (!form.referenceNo.trim() || form.expenseCategoryId === noneValue || form.warehouseId === noneValue || form.accountId === noneValue || amount <= 0) {
      toast.error('Missing expense fields', { description: 'Reference, category, warehouse, account, and amount are required.' });
      return;
    }

    const payload: ExpensePayload = {
      reference_no: form.referenceNo.trim(),
      expense_category_id: Number(form.expenseCategoryId),
      warehouse_id: Number(form.warehouseId),
      account_id: Number(form.accountId),
      amount,
      expense_date: form.expenseDate || null,
      note: nullableText(form.note),
    };

    setSaving(true);
    try {
      if (editingExpense) await api.updateExpense(editingExpense.id, payload);
      else await api.createExpense(payload);

      closeModal();
      toast.success(`Expense ${editingExpense ? 'updated' : 'created'}`);
      if (editingExpense || page === 1) await load(editingExpense ? page : 1);
      else setPage(1);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(expense: Expense) {
    if (!window.confirm(`Delete expense ${expense.reference_no}?`)) return;

    setSaving(true);
    try {
      await api.deleteExpense(expense.id);
      toast.success('Expense deleted');
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${expenses.length} shown from ${pagination?.total ?? expenses.length}`} actionLabel="Add Expense" canAdd={canAdd} onAdd={openCreate} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search reference, category, warehouse, account, note" />
      {expenses.length ? (
        <TableWrap loading={loading}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">{expense.expense_date ?? '-'}</td>
                  <td className="px-4 py-3 font-medium">{expense.reference_no}</td>
                  <td className="px-4 py-3">{expense.category_name ?? '-'}</td>
                  <td className="px-4 py-3">{expense.warehouse_name ?? '-'}</td>
                  <td className="px-4 py-3">{expense.account_name ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(expense.amount)}</td>
                  <td className="max-w-xs truncate px-4 py-3">{expense.note ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit ? (
                        <ActionButton
                          icon={Pencil}
                          text="Edit expense"
                          color="text-amber-600 hover:text-amber-700"
                          bgColor="bg-amber-50 hover:border-amber-100 hover:bg-amber-100"
                          onClick={() => openEdit(expense)}
                        />
                      ) : null}
                      {canDelete ? (
                        <ActionButton
                          icon={Trash2}
                          text="Delete expense"
                          color="text-red-500 hover:text-red-600"
                          bgColor="bg-red-50 hover:border-red-100 hover:bg-red-100"
                          disabled={saving}
                          onClick={() => void remove(expense)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">{loading ? 'Loading expenses...' : 'No expenses found.'}</div>
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />

      <Modal title={`${editingExpense ? 'Edit' : 'Add'} Expense`} open={modalOpen} onOpenChange={setModalOpen}>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference"><Input value={form.referenceNo} onChange={(event) => setValue('referenceNo', event.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={form.expenseDate} onChange={(event) => setValue('expenseDate', event.target.value)} /></Field>
            <Field label="Category"><Select value={form.expenseCategoryId} onValueChange={(value) => setValue('expenseCategoryId', value)} options={categoryOptions} /></Field>
            <Field label="Warehouse"><Select value={form.warehouseId} onValueChange={(value) => setValue('warehouseId', value)} options={warehouseOptions} /></Field>
            <Field label="Account"><Select value={form.accountId} onValueChange={(value) => setValue('accountId', value)} options={accountOptions} /></Field>
            <Field label="Amount"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setValue('amount', event.target.value)} /></Field>
          </div>
          <Field label="Note"><Textarea value={form.note} onChange={(event) => setValue('note', event.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Expense'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function selectOptions(items: Array<{ id: number; name: string }>, placeholder: string) {
  return [{ value: noneValue, label: placeholder }, ...items.map((item) => ({ value: String(item.id), label: item.name }))];
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
