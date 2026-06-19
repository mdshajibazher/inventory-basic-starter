import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import {
  Button,
  DataTable,
  Modal,
  Portal,
  Searchbar,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { Account, PaginationMeta } from '@/src/types';

type AccountForm = {
  accountNo: string;
  name: string;
  initialBalance: string;
  totalBalance: string;
  note: string;
  isDefault: boolean;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: AccountForm = {
  accountNo: '',
  name: '',
  initialBalance: '0',
  totalBalance: '0',
  note: '',
  isDefault: false,
  isActive: true,
};

const perPage = 15;

function accountToForm(account: Account): AccountForm {
  return {
    accountNo: account.account_no,
    name: account.name,
    initialBalance: account.initial_balance == null ? '0' : String(account.initial_balance),
    totalBalance: account.total_balance == null ? '0' : String(account.total_balance),
    note: account.note ?? '',
    isDefault: Boolean(account.is_default),
    isActive: Boolean(account.is_active),
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

export default function AccountsScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('accounts-add');
  const canEdit = hasPermission('accounts-edit');
  const canDelete = hasPermission('accounts-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.accounts({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setAccounts(response.data as Account[]);
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

  function updateForm<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingAccount(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    setForm(accountToForm(account));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingAccount(null);
    setForm(emptyForm);
  }

  async function saveAccount() {
    const initialBalance = parseAmount(form.initialBalance);
    const totalBalance = parseAmount(form.totalBalance);

    if (!form.accountNo.trim()) {
      Alert.alert('Missing account number', 'Account number is required.');
      return;
    }

    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Account name is required.');
      return;
    }

    if (initialBalance === null || initialBalance < 0 || totalBalance === null || totalBalance < 0) {
      Alert.alert('Invalid balance', 'Enter valid initial and total balances.');
      return;
    }

    const payload = {
      account_no: form.accountNo.trim(),
      name: form.name.trim(),
      initial_balance: initialBalance,
      total_balance: totalBalance,
      note: nullableText(form.note),
      is_default: form.isDefault,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingAccount) {
        await api.updateAccount(editingAccount.id, payload);
      } else {
        await api.createAccount(payload);
      }

      closeModal();
      if (editingAccount) {
        await load(page);
      } else if (page === 1) {
        await load(1);
      } else {
        setPage(1);
      }
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(account: Account) {
    Alert.alert('Delete account?', `Delete ${account.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteAccount(account);
        },
      },
    ]);
  }

  async function deleteAccount(account: Account) {
    setSaving(true);
    try {
      await api.deleteAccount(account.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('accounts-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Accounts</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {accounts.length} shown from {pagination?.total ?? accounts.length}
          </Text>
        </View>
        {canAdd ? (
          <Button mode="contained" onPress={openCreateModal}>
            Add
          </Button>
        ) : null}
      </View>
      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search accounts, numbers, notes, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Account</DataTable.Title>
            <DataTable.Title style={styles.numberColumn}>Number</DataTable.Title>
            <DataTable.Title numeric style={styles.amountColumn}>Initial</DataTable.Title>
            <DataTable.Title numeric style={styles.amountColumn}>Balance</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Default</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {accounts.map((account) => (
            <DataTable.Row key={account.id}>
              <DataTable.Cell style={styles.nameColumn}>{account.name}</DataTable.Cell>
              <DataTable.Cell style={styles.numberColumn}>{account.account_no}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.amountColumn}>{account.initial_balance ?? 0}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.amountColumn}>{account.total_balance}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>{account.is_default ? 'Default' : '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>{account.is_active ? 'Active' : 'Inactive'}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(account)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(account)}>
                      Delete
                    </Button>
                  ) : null}
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>
            Previous
          </Button>
          <Text variant="bodyMedium" style={styles.paginationText}>
            Page {pagination.current_page} of {pagination.last_page}
          </Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>
            Next
          </Button>
        </View>
      ) : null}

      {!loading && accounts.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No accounts found.
        </Text>
      ) : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <Text variant="titleLarge">{editingAccount ? 'Edit Account' : 'Add Account'}</Text>

          <TextInput mode="outlined" label="Account number" value={form.accountNo} onChangeText={(value) => updateForm('accountNo', value)} />
          <TextInput mode="outlined" label="Account name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
          <View style={styles.inputGrid}>
            <TextInput
              mode="outlined"
              label="Initial balance"
              keyboardType="decimal-pad"
              value={form.initialBalance}
              onChangeText={(value) => updateForm('initialBalance', value)}
              style={styles.gridInput}
            />
            <TextInput
              mode="outlined"
              label="Total balance"
              keyboardType="decimal-pad"
              value={form.totalBalance}
              onChangeText={(value) => updateForm('totalBalance', value)}
              style={styles.gridInput}
            />
          </View>
          <TextInput mode="outlined" label="Note" multiline value={form.note} onChangeText={(value) => updateForm('note', value)} />

          <View style={styles.switchRow}>
            <Text variant="titleSmall">Default</Text>
            <Switch value={form.isDefault} onValueChange={(value) => updateForm('isDefault', value)} />
          </View>
          <View style={styles.switchRow}>
            <Text variant="titleSmall">Active</Text>
            <Switch value={form.isActive} onValueChange={(value) => updateForm('isActive', value)} />
          </View>

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={saveAccount} loading={saving} disabled={saving}>
              Save
            </Button>
          </View>
        </Modal>
      </Portal>
    </Screen>
  );
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
  searchbar: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.28)',
    backgroundColor: '#ffffff',
  },
  searchbarInput: {
    minHeight: 0,
    paddingVertical: 0,
  },
  table: {
    minWidth: 1040,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.4,
  },
  numberColumn: {
    flex: 1.1,
  },
  amountColumn: {
    flex: 1,
  },
  statusColumn: {
    flex: 0.9,
  },
  actionColumn: {
    flex: 1.1,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  paginationText: {
    color: '#333333',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#666666',
  },
  modal: {
    margin: 18,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  gridInput: {
    flex: 1,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
