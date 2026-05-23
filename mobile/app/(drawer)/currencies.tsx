import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Button, DataTable, Modal, Portal, Searchbar, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { Currency, PaginationMeta } from '@/src/types';

type CurrencyForm = {
  name: string;
  code: string;
  exchangeRate: string;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: CurrencyForm = {
  name: '',
  code: '',
  exchangeRate: '',
};

const perPage = 15;

function currencyToForm(currency: Currency): CurrencyForm {
  return {
    name: currency.name,
    code: currency.code,
    exchangeRate: String(currency.exchange_rate),
  };
}

export default function CurrenciesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [form, setForm] = useState<CurrencyForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('currencies-add');
  const canEdit = hasPermission('currencies-edit');
  const canDelete = hasPermission('currencies-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.currencies({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setCurrencies(response.data as Currency[]);
      setPagination(response.meta ?? null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
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

  function updateForm<K extends keyof CurrencyForm>(key: K, value: CurrencyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingCurrency(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(currency: Currency) {
    setEditingCurrency(currency);
    setForm(currencyToForm(currency));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingCurrency(null);
    setForm(emptyForm);
  }

  async function saveCurrency() {
    const exchangeRate = Number(form.exchangeRate);

    if (!form.name.trim() || !form.code.trim()) {
      Alert.alert('Missing fields', 'Currency name and code are required.');
      return;
    }

    if (!form.exchangeRate.trim() || Number.isNaN(exchangeRate) || exchangeRate < 0) {
      Alert.alert('Invalid rate', 'Enter a valid exchange rate.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      exchange_rate: exchangeRate,
    };

    setSaving(true);
    try {
      if (editingCurrency) {
        await api.updateCurrency(editingCurrency.id, payload);
      } else {
        await api.createCurrency(payload);
      }

      closeModal();
      if (editingCurrency) {
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

  function confirmDelete(currency: Currency) {
    Alert.alert('Delete currency?', `Delete ${currency.code}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteCurrency(currency);
        },
      },
    ]);
  }

  async function deleteCurrency(currency: Currency) {
    setSaving(true);
    try {
      await api.deleteCurrency(currency.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('currencies-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Currencies</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {currencies.length} shown from {pagination?.total ?? currencies.length}
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
        placeholder="Search currencies, codes, exchange rates"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Currency</DataTable.Title>
            <DataTable.Title style={styles.codeColumn}>Code</DataTable.Title>
            <DataTable.Title numeric style={styles.rateColumn}>
              Exchange Rate
            </DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {currencies.map((currency) => (
            <DataTable.Row key={currency.id}>
              <DataTable.Cell style={styles.nameColumn}>{currency.name}</DataTable.Cell>
              <DataTable.Cell style={styles.codeColumn}>{currency.code}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.rateColumn}>
                {currency.exchange_rate}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(currency)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(currency)}>
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
          <Button
            mode="outlined"
            disabled={loading || page <= 1}
            onPress={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Text variant="bodyMedium" style={styles.paginationText}>
            Page {pagination.current_page} of {pagination.last_page}
          </Text>
          <Button
            mode="outlined"
            disabled={loading || page >= pagination.last_page}
            onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
          >
            Next
          </Button>
        </View>
      ) : null}

      {!loading && currencies.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No currencies found.
        </Text>
      ) : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <Text variant="titleLarge">
            {editingCurrency ? 'Edit Currency' : 'Add Currency'}
          </Text>

          <TextInput
            mode="outlined"
            label="Currency name"
            value={form.name}
            onChangeText={(value) => updateForm('name', value)}
          />
          <TextInput
            mode="outlined"
            label="Code"
            value={form.code}
            autoCapitalize="characters"
            onChangeText={(value) => updateForm('code', value)}
          />
          <TextInput
            mode="outlined"
            label="Exchange rate"
            value={form.exchangeRate}
            keyboardType="decimal-pad"
            onChangeText={(value) => updateForm('exchangeRate', value)}
          />

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={saveCurrency} loading={saving} disabled={saving}>
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
    minWidth: 760,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.3,
  },
  codeColumn: {
    flex: 0.8,
  },
  rateColumn: {
    flex: 1,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
