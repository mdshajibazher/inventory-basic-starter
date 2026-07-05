import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Button, DataTable, Menu, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type ExpensePayload } from '@/src/lib/api';
import type { Account, Expense, ExpenseCategory, PaginationMeta, Warehouse } from '@/src/types';

type ExpenseForm = {
  referenceNo: string;
  expenseCategoryId: number | null;
  warehouseId: number | null;
  accountId: number | null;
  amount: string;
  expenseDate: string;
  note: string;
};

type RouteParams = {
  refreshKey?: number;
};

const perPage = 15;

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (): ExpenseForm => ({
  referenceNo: '',
  expenseCategoryId: null,
  warehouseId: null,
  accountId: null,
  amount: '',
  expenseDate: today(),
  note: '',
});

function expenseToForm(expense: Expense): ExpenseForm {
  return {
    referenceNo: expense.reference_no,
    expenseCategoryId: expense.expense_category_id,
    warehouseId: expense.warehouse_id,
    accountId: expense.account_id,
    amount: String(expense.amount),
    expenseDate: expense.expense_date ?? String(expense.created_at ?? '').slice(0, 10),
    note: expense.note ?? '',
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ExpensesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('expenses-add');
  const canEdit = hasPermission('expenses-edit');
  const canDelete = hasPermission('expenses-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.expenses({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setExpenses(response.data);
      setPagination(response.meta ?? null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    load(page);
  }, [load, page, refreshKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
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
      .catch((error) => Alert.alert('Options failed', error instanceof Error ? error.message : 'Try again.'));
  }, []);

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingExpense(null);
    setForm(emptyForm());
    setModalVisible(true);
  }

  function openEditModal(expense: Expense) {
    setEditingExpense(expense);
    setForm(expenseToForm(expense));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingExpense(null);
    setForm(emptyForm());
  }

  async function saveExpense() {
    const amount = parseAmount(form.amount);

    if (!form.referenceNo.trim() || !form.expenseCategoryId || !form.warehouseId || !form.accountId || amount === null || amount <= 0) {
      Alert.alert('Missing expense fields', 'Reference, category, warehouse, account, and amount are required.');
      return;
    }

    const payload: ExpensePayload = {
      reference_no: form.referenceNo.trim(),
      expense_category_id: form.expenseCategoryId,
      warehouse_id: form.warehouseId,
      account_id: form.accountId,
      amount,
      expense_date: nullableText(form.expenseDate),
      note: nullableText(form.note),
    };

    setSaving(true);
    try {
      if (editingExpense) await api.updateExpense(editingExpense.id, payload);
      else await api.createExpense(payload);

      closeModal();
      if (editingExpense) await load(page);
      else if (page === 1) await load(1);
      else setPage(1);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(expense: Expense) {
    Alert.alert('Delete expense?', `Delete ${expense.reference_no}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteExpense(expense) },
    ]);
  }

  async function deleteExpense(expense: Expense) {
    setSaving(true);
    try {
      await api.deleteExpense(expense.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('expenses-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Expenses</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {expenses.length} shown from {pagination?.total ?? expenses.length}
          </Text>
        </View>
        {canAdd ? <Button mode="contained" onPress={openCreateModal}>Add</Button> : null}
      </View>
      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search expenses"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.dateColumn}>Date</DataTable.Title>
            <DataTable.Title style={styles.referenceColumn}>Reference</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Category</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Warehouse</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Account</DataTable.Title>
            <DataTable.Title numeric style={styles.amountColumn}>Amount</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {expenses.map((expense) => (
            <DataTable.Row key={expense.id}>
              <DataTable.Cell style={styles.dateColumn}>{expense.expense_date ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.referenceColumn}>{expense.reference_no}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{expense.category_name ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{expense.warehouse_name ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{expense.account_name ?? '-'}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.amountColumn}>{money(expense.amount)}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? <Button compact mode="text" onPress={() => openEditModal(expense)}>Edit</Button> : null}
                  {canDelete ? <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(expense)}>Delete</Button> : null}
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Text variant="bodyMedium" style={styles.paginationText}>Page {pagination.current_page} of {pagination.last_page}</Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>Next</Button>
        </View>
      ) : null}

      {!loading && expenses.length === 0 ? <Text variant="bodyMedium" style={styles.empty}>No expenses found.</Text> : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <Text variant="titleLarge">{editingExpense ? 'Edit Expense' : 'Add Expense'}</Text>
          <TextInput mode="outlined" label="Reference" value={form.referenceNo} onChangeText={(value) => updateForm('referenceNo', value)} />
          <TextInput mode="outlined" label="Date (YYYY-MM-DD)" value={form.expenseDate} onChangeText={(value) => updateForm('expenseDate', value)} />
          <PickerField label="Category" value={labelFor(categories, form.expenseCategoryId)} options={categories} onSelect={(item) => updateForm('expenseCategoryId', item.id)} />
          <PickerField label="Warehouse" value={labelFor(warehouses, form.warehouseId)} options={warehouses} onSelect={(item) => updateForm('warehouseId', item.id)} />
          <PickerField label="Account" value={accountLabel(accounts, form.accountId)} options={accounts} getLabel={(item) => `${item.name} (${item.account_no})`} onSelect={(item) => updateForm('accountId', item.id)} />
          <TextInput mode="outlined" label="Amount" keyboardType="decimal-pad" value={form.amount} onChangeText={(value) => updateForm('amount', value)} />
          <TextInput mode="outlined" label="Note" multiline value={form.note} onChangeText={(value) => updateForm('note', value)} />
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>Cancel</Button>
            <Button mode="contained" onPress={saveExpense} loading={saving} disabled={saving}>Save</Button>
          </View>
        </Modal>
      </Portal>
    </Screen>
  );
}

function PickerField<T extends { id: number; name: string }>({
  label,
  value,
  options,
  onSelect,
  getLabel = (item) => item.name,
}: {
  label: string;
  value: string;
  options: T[];
  onSelect: (item: T) => void;
  getLabel?: (item: T) => string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={<Button mode="outlined" contentStyle={styles.pickerButton} onPress={() => setVisible(true)}>{label}: {value}</Button>}
    >
      {options.map((option) => (
        <Menu.Item
          key={option.id}
          title={getLabel(option)}
          onPress={() => {
            onSelect(option);
            setVisible(false);
          }}
        />
      ))}
    </Menu>
  );
}

function labelFor(items: Array<{ id: number; name: string }>, id: number | null) {
  return items.find((item) => item.id === id)?.name ?? 'Select';
}

function accountLabel(items: Account[], id: number | null) {
  const account = items.find((item) => item.id === id);
  return account ? `${account.name} (${account.account_no})` : 'Select';
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  muted: { color: '#666666' },
  searchbar: { height: 44, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.28)', backgroundColor: '#ffffff' },
  searchbarInput: { minHeight: 0, paddingVertical: 0 },
  table: { minWidth: 1120, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  dateColumn: { flex: 0.9 },
  referenceColumn: { flex: 1.2 },
  nameColumn: { flex: 1.2 },
  amountColumn: { flex: 0.9 },
  actionColumn: { flex: 1.1, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  paginationText: { color: '#333333' },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#666666' },
  modal: { margin: 18, padding: 18, borderRadius: 8, backgroundColor: '#ffffff', gap: 12 },
  pickerButton: { justifyContent: 'flex-start' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
