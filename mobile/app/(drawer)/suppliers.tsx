import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Button, DataTable, Modal, Portal, Searchbar, Switch, Text, TextInput } from 'react-native-paper';
import { ImageUploadField, type PickedImage } from '@/src/components/ImageUploadField';
import { ResourceImage } from '@/src/components/ResourceImage';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { PaginationMeta, Supplier } from '@/src/types';

type SupplierForm = {
  name: string;
  image: string | null;
  imageFile: PickedImage | null;
  removeImage: boolean;
  companyName: string;
  vatNumber: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: SupplierForm = {
  name: '',
  image: null,
  imageFile: null,
  removeImage: false,
  companyName: '',
  vatNumber: '',
  email: '',
  phoneNumber: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  isActive: true,
};

const perPage = 15;

function supplierToForm(supplier: Supplier): SupplierForm {
  return {
    name: supplier.name,
    image: supplier.image ?? null,
    imageFile: null,
    removeImage: false,
    companyName: supplier.company_name,
    vatNumber: supplier.vat_number ?? '',
    email: supplier.email,
    phoneNumber: supplier.phone_number,
    address: supplier.address,
    city: supplier.city,
    state: supplier.state ?? '',
    postalCode: supplier.postal_code ?? '',
    country: supplier.country ?? '',
    isActive: Boolean(supplier.is_active),
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

export default function SuppliersScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('suppliers-add');
  const canEdit = hasPermission('suppliers-edit');
  const canDelete = hasPermission('suppliers-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const response = await api.suppliers({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setSuppliers(response.data as Supplier[]);
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

  function updateForm<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingSupplier(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(supplier: Supplier) {
    setEditingSupplier(supplier);
    setForm(supplierToForm(supplier));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingSupplier(null);
    setForm(emptyForm);
  }

  async function saveSupplier() {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Supplier name is required.');
      return;
    }

    if (!form.companyName.trim() || !form.email.trim() || !form.phoneNumber.trim()) {
      Alert.alert('Missing contact', 'Company name, email, and phone number are required.');
      return;
    }

    if (!form.address.trim() || !form.city.trim()) {
      Alert.alert('Missing address', 'Address and city are required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      image: form.imageFile,
      remove_image: form.removeImage,
      company_name: form.companyName.trim(),
      vat_number: nullableText(form.vatNumber),
      email: form.email.trim(),
      phone_number: form.phoneNumber.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: nullableText(form.state),
      postal_code: nullableText(form.postalCode),
      country: nullableText(form.country),
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingSupplier) await api.updateSupplier(editingSupplier.id, payload);
      else await api.createSupplier(payload);

      closeModal();
      if (editingSupplier) await load(page);
      else if (page === 1) await load(1);
      else setPage(1);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(supplier: Supplier) {
    Alert.alert('Delete supplier?', `Delete ${supplier.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteSupplier(supplier) },
    ]);
  }

  async function deleteSupplier(supplier: Supplier) {
    setSaving(true);
    try {
      await api.deleteSupplier(supplier.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('suppliers-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Suppliers</Text>
          <Text variant="bodyMedium" style={styles.muted}>{suppliers.length} shown from {pagination?.total ?? suppliers.length}</Text>
        </View>
        {canAdd ? <Button mode="contained" onPress={openCreateModal}>Add</Button> : null}
      </View>

      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search suppliers, company, contact, address, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Supplier</DataTable.Title>
            <DataTable.Title style={styles.imageColumn}>Image</DataTable.Title>
            <DataTable.Title style={styles.companyColumn}>Company</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Email</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.cityColumn}>City</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {suppliers.map((supplier) => (
            <DataTable.Row key={supplier.id}>
              <DataTable.Cell style={styles.nameColumn}>{supplier.name}</DataTable.Cell>
              <DataTable.Cell style={styles.imageColumn}>
                <ResourceImage uri={supplier.image} kind="supplier" />
              </DataTable.Cell>
              <DataTable.Cell style={styles.companyColumn}>{supplier.company_name}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{supplier.email}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{supplier.phone_number}</DataTable.Cell>
              <DataTable.Cell style={styles.cityColumn}>{supplier.city}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>{supplier.is_active ? 'Active' : 'Inactive'}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? <Button compact mode="text" onPress={() => openEditModal(supplier)}>Edit</Button> : null}
                  {canDelete ? <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(supplier)}>Delete</Button> : null}
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

      {!loading && suppliers.length === 0 ? <Text variant="bodyMedium" style={styles.empty}>No suppliers found.</Text> : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</Text>
            <TextInput mode="outlined" label="Supplier name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
            <TextInput mode="outlined" label="Company name" value={form.companyName} onChangeText={(value) => updateForm('companyName', value)} />
            <TextInput mode="outlined" label="VAT number" value={form.vatNumber} onChangeText={(value) => updateForm('vatNumber', value)} />
            <TextInput mode="outlined" label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => updateForm('email', value)} />
            <TextInput mode="outlined" label="Phone number" value={form.phoneNumber} onChangeText={(value) => updateForm('phoneNumber', value)} />
            <TextInput mode="outlined" label="Address" multiline value={form.address} onChangeText={(value) => updateForm('address', value)} />
            <TextInput mode="outlined" label="City" value={form.city} onChangeText={(value) => updateForm('city', value)} />
            <TextInput mode="outlined" label="State" value={form.state} onChangeText={(value) => updateForm('state', value)} />
            <TextInput mode="outlined" label="Postal code" value={form.postalCode} onChangeText={(value) => updateForm('postalCode', value)} />
            <TextInput mode="outlined" label="Country" value={form.country} onChangeText={(value) => updateForm('country', value)} />

            <ImageUploadField
              label="Supplier image"
              imageUri={form.imageFile?.uri ?? form.image}
              disabled={saving}
              onChange={(image) => setForm((current) => ({ ...current, imageFile: image, removeImage: false }))}
              onClear={() => setForm((current) => ({ ...current, image: null, imageFile: null, removeImage: Boolean(editingSupplier?.image) }))}
            />

            <View style={styles.switchRow}>
              <View>
                <Text variant="titleSmall">Active</Text>
                <Text variant="bodySmall" style={styles.muted}>Show this supplier as available.</Text>
              </View>
              <Switch value={form.isActive} onValueChange={(value) => updateForm('isActive', value)} />
            </View>

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeModal} disabled={saving}>Cancel</Button>
              <Button mode="contained" onPress={saveSupplier} loading={saving} disabled={saving}>Save</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  muted: { color: '#666666' },
  searchbar: { height: 44, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.28)', backgroundColor: '#ffffff' },
  searchbarInput: { minHeight: 0, paddingVertical: 0 },
  table: { minWidth: 1200, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  nameColumn: { flex: 1.3 },
  imageColumn: { flex: 1 },
  companyColumn: { flex: 1.4 },
  contactColumn: { flex: 1.5 },
  cityColumn: { flex: 1 },
  statusColumn: { flex: 0.8 },
  actionColumn: { flex: 1.1, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  paginationText: { color: '#333333' },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#666666' },
  modal: { maxHeight: '92%', margin: 18, padding: 18, borderRadius: 8, backgroundColor: '#ffffff' },
  modalContent: { gap: 12 },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
