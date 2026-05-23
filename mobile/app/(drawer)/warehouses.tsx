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
import type { PaginationMeta, Warehouse } from '@/src/types';

type WarehouseForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: WarehouseForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  isActive: true,
};

const perPage = 15;

function warehouseToForm(warehouse: Warehouse): WarehouseForm {
  return {
    name: warehouse.name,
    phone: warehouse.phone ?? '',
    email: warehouse.email ?? '',
    address: warehouse.address,
    isActive: Boolean(warehouse.is_active),
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

export default function WarehousesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<WarehouseForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('warehouses-add');
  const canEdit = hasPermission('warehouses-edit');
  const canDelete = hasPermission('warehouses-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.warehouses({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setWarehouses(response.data as Warehouse[]);
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

  function updateForm<K extends keyof WarehouseForm>(key: K, value: WarehouseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingWarehouse(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(warehouse: Warehouse) {
    setEditingWarehouse(warehouse);
    setForm(warehouseToForm(warehouse));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingWarehouse(null);
    setForm(emptyForm);
  }

  async function saveWarehouse() {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Warehouse name is required.');
      return;
    }

    if (!form.address.trim()) {
      Alert.alert('Missing address', 'Warehouse address is required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: nullableText(form.phone),
      email: nullableText(form.email),
      address: form.address.trim(),
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingWarehouse) {
        await api.updateWarehouse(editingWarehouse.id, payload);
      } else {
        await api.createWarehouse(payload);
      }

      closeModal();
      if (editingWarehouse) {
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

  function confirmDelete(warehouse: Warehouse) {
    Alert.alert('Delete warehouse?', `Delete ${warehouse.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteWarehouse(warehouse);
        },
      },
    ]);
  }

  async function deleteWarehouse(warehouse: Warehouse) {
    setSaving(true);
    try {
      await api.deleteWarehouse(warehouse.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('warehouses-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Warehouses</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {warehouses.length} shown from {pagination?.total ?? warehouses.length}
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
        placeholder="Search warehouses, contact, address, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Warehouse</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Email</DataTable.Title>
            <DataTable.Title style={styles.addressColumn}>Address</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {warehouses.map((warehouse) => (
            <DataTable.Row key={warehouse.id}>
              <DataTable.Cell style={styles.nameColumn}>{warehouse.name}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{warehouse.phone || '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{warehouse.email || '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.addressColumn}>{warehouse.address}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {warehouse.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(warehouse)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(warehouse)}>
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

      {!loading && warehouses.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No warehouses found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge">
            {editingWarehouse ? 'Edit Warehouse' : 'Add Warehouse'}
          </Text>

          <TextInput
            mode="outlined"
            label="Warehouse name"
            value={form.name}
            onChangeText={(value) => updateForm('name', value)}
          />
          <TextInput
            mode="outlined"
            label="Phone"
            value={form.phone}
            onChangeText={(value) => updateForm('phone', value)}
          />
          <TextInput
            mode="outlined"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={(value) => updateForm('email', value)}
          />
          <TextInput
            mode="outlined"
            label="Address"
            multiline
            value={form.address}
            onChangeText={(value) => updateForm('address', value)}
          />

          <View style={styles.switchRow}>
            <View>
              <Text variant="titleSmall">Active</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Show this warehouse as available.
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
            <Button mode="contained" onPress={saveWarehouse} loading={saving} disabled={saving}>
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
    minWidth: 960,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.4,
  },
  contactColumn: {
    flex: 1.2,
  },
  addressColumn: {
    flex: 1.8,
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
