import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from 'expo-router/react-navigation';
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
import type { PaginationMeta, Tax } from '@/src/types';

type TaxForm = {
  name: string;
  rate: string;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: TaxForm = {
  name: '',
  rate: '',
  isActive: true,
};

const perPage = 15;

function taxToForm(tax: Tax): TaxForm {
  return {
    name: tax.name,
    rate: String(tax.rate),
    isActive: Boolean(tax.is_active),
  };
}

export default function TaxesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [form, setForm] = useState<TaxForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('taxes-add');
  const canEdit = hasPermission('taxes-edit');
  const canDelete = hasPermission('taxes-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.taxes({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setTaxes(response.data as Tax[]);
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

  function updateForm<K extends keyof TaxForm>(key: K, value: TaxForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingTax(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(tax: Tax) {
    setEditingTax(tax);
    setForm(taxToForm(tax));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingTax(null);
    setForm(emptyForm);
  }

  async function saveTax() {
    const rate = Number(form.rate);

    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Tax name is required.');
      return;
    }

    if (!form.rate.trim() || Number.isNaN(rate) || rate < 0) {
      Alert.alert('Invalid rate', 'Enter a valid tax rate.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      rate,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingTax) {
        await api.updateTax(editingTax.id, payload);
      } else {
        await api.createTax(payload);
      }

      closeModal();
      if (editingTax) {
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

  function confirmDelete(tax: Tax) {
    Alert.alert('Delete tax?', `Delete ${tax.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteTax(tax);
        },
      },
    ]);
  }

  async function deleteTax(tax: Tax) {
    setSaving(true);
    try {
      await api.deleteTax(tax.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('taxes-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Taxes</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {taxes.length} shown from {pagination?.total ?? taxes.length}
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
        placeholder="Search taxes, rates, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Tax</DataTable.Title>
            <DataTable.Title numeric style={styles.rateColumn}>
              Rate
            </DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {taxes.map((tax) => (
            <DataTable.Row key={tax.id}>
              <DataTable.Cell style={styles.nameColumn}>{tax.name}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.rateColumn}>
                {tax.rate}%
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {tax.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(tax)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(tax)}>
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

      {!loading && taxes.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No taxes found.
        </Text>
      ) : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <Text variant="titleLarge">{editingTax ? 'Edit Tax' : 'Add Tax'}</Text>

          <TextInput
            mode="outlined"
            label="Tax name"
            value={form.name}
            onChangeText={(value) => updateForm('name', value)}
          />
          <TextInput
            mode="outlined"
            label="Rate"
            value={form.rate}
            keyboardType="decimal-pad"
            right={<TextInput.Affix text="%" />}
            onChangeText={(value) => updateForm('rate', value)}
          />

          <View style={styles.switchRow}>
            <View>
              <Text variant="titleSmall">Active</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Show this tax as available.
              </Text>
            </View>
            <Switch
              value={form.isActive}
              onValueChange={(value) => updateForm('isActive', value)}
            />
          </View>

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={saveTax} loading={saving} disabled={saving}>
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
    minWidth: 680,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.4,
  },
  rateColumn: {
    flex: 0.9,
  },
  statusColumn: {
    flex: 0.8,
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
  switchRow: {
    minHeight: 56,
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
