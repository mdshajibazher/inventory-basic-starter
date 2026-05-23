import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Button, Checkbox, DataTable, Menu, Modal, Portal, Searchbar, Switch, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type CustomerPayload } from '@/src/lib/api';
import type { Customer, CustomerGroup, PaginationMeta } from '@/src/types';

type CustomerForm = {
  customerGroupId: string;
  name: string;
  companyName: string;
  email: string;
  phoneNumber: string;
  taxNo: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isActive: boolean;
  createUser: boolean;
  username: string;
  password: string;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: CustomerForm = {
  customerGroupId: '',
  name: '',
  companyName: '',
  email: '',
  phoneNumber: '',
  taxNo: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  isActive: true,
  createUser: false,
  username: '',
  password: '',
};

const perPage = 15;

function customerToForm(customer: Customer): CustomerForm {
  return {
    customerGroupId: String(customer.customer_group_id),
    name: customer.name,
    companyName: customer.company_name ?? '',
    email: customer.email ?? '',
    phoneNumber: customer.phone_number,
    taxNo: customer.tax_no ?? '',
    address: customer.address,
    city: customer.city,
    state: customer.state ?? '',
    postalCode: customer.postal_code ?? '',
    country: customer.country ?? '',
    isActive: Boolean(customer.is_active),
    createUser: false,
    username: '',
    password: '',
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

export default function CustomersScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupMenuVisible, setGroupMenuVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('customers-add');
  const canEdit = hasPermission('customers-edit');
  const canDelete = hasPermission('customers-delete');
  const selectedGroup = useMemo(
    () => groups.find((group) => String(group.id) === form.customerGroupId),
    [form.customerGroupId, groups]
  );

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.customers({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setCustomers(response.data as Customer[]);
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
    api.customerOptions()
      .then((response) => {
        const data = response.data as { customer_groups?: CustomerGroup[] };
        setGroups(data.customer_groups ?? []);
      })
      .catch((error) => Alert.alert('Options failed', error instanceof Error ? error.message : 'Try again.'));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  function updateForm<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingCustomer(null);
    setForm({ ...emptyForm, customerGroupId: groups[0] ? String(groups[0].id) : '' });
    setModalVisible(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setForm(customerToForm(customer));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingCustomer(null);
    setGroupMenuVisible(false);
    setForm(emptyForm);
  }

  function validate() {
    if (!form.customerGroupId) return 'Customer group is required.';
    if (!form.name.trim()) return 'Customer name is required.';
    if (!form.phoneNumber.trim()) return 'Phone number is required.';
    if (!form.address.trim()) return 'Address is required.';
    if (!form.city.trim()) return 'City is required.';
    if (form.createUser && !editingCustomer?.user_id) {
      if (!form.email.trim()) return 'Email is required to create a linked user.';
      if (!form.username.trim()) return 'Username is required to create a linked user.';
      if (form.password.length < 6) return 'Password must be at least 6 characters.';
    }
    return null;
  }

  function payload(): CustomerPayload {
    return {
      customer_group_id: Number(form.customerGroupId),
      name: form.name.trim(),
      company_name: nullableText(form.companyName),
      email: nullableText(form.email),
      phone_number: form.phoneNumber.trim(),
      tax_no: nullableText(form.taxNo),
      address: form.address.trim(),
      city: form.city.trim(),
      state: nullableText(form.state),
      postal_code: nullableText(form.postalCode),
      country: nullableText(form.country),
      is_active: form.isActive,
      create_user: form.createUser,
      username: nullableText(form.username),
      password: nullableText(form.password),
    };
  }

  async function saveCustomer() {
    const validation = validate();
    if (validation) {
      Alert.alert('Invalid customer', validation);
      return;
    }

    setSaving(true);
    try {
      if (editingCustomer) await api.updateCustomer(editingCustomer.id, payload());
      else await api.createCustomer(payload());

      closeModal();
      if (editingCustomer) await load(page);
      else if (page === 1) await load(1);
      else setPage(1);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(customer: Customer) {
    Alert.alert('Delete customer?', `Delete ${customer.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteCustomer(customer) },
    ]);
  }

  async function deleteCustomer(customer: Customer) {
    setSaving(true);
    try {
      await api.deleteCustomer(customer.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('customers-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Customers</Text>
          <Text variant="bodyMedium" style={styles.muted}>{customers.length} shown from {pagination?.total ?? customers.length}</Text>
        </View>
        {canAdd ? <Button mode="contained" onPress={openCreateModal}>Add</Button> : null}
      </View>

      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search customers, contact, location, group"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Customer</DataTable.Title>
            <DataTable.Title style={styles.groupColumn}>Group</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Email</DataTable.Title>
            <DataTable.Title style={styles.cityColumn}>City</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>
          {customers.map((customer) => (
            <DataTable.Row key={customer.id}>
              <DataTable.Cell style={styles.nameColumn}>{customer.name}</DataTable.Cell>
              <DataTable.Cell style={styles.groupColumn}>{customer.customer_group?.name ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{customer.phone_number}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{customer.email || '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.cityColumn}>{customer.city}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>{customer.is_active ? 'Active' : 'Inactive'}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? <Button compact mode="text" onPress={() => openEditModal(customer)}>Edit</Button> : null}
                  {canDelete ? <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(customer)}>Delete</Button> : null}
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

      {!loading && customers.length === 0 ? <Text variant="bodyMedium" style={styles.empty}>No customers found.</Text> : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <Text variant="titleLarge">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</Text>
            <Menu
              visible={groupMenuVisible}
              onDismiss={() => setGroupMenuVisible(false)}
              anchor={
                <Button mode="outlined" contentStyle={styles.groupButton} onPress={() => setGroupMenuVisible(true)}>
                  {selectedGroup ? `${selectedGroup.name} (${selectedGroup.percentage}%)` : 'Customer group'}
                </Button>
              }
            >
              {groups.map((group) => (
                <Menu.Item
                  key={group.id}
                  title={`${group.name} (${group.percentage}%)`}
                  onPress={() => {
                    updateForm('customerGroupId', String(group.id));
                    setGroupMenuVisible(false);
                  }}
                />
              ))}
            </Menu>
            <TextInput mode="outlined" label="Customer name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
            <TextInput mode="outlined" label="Company name" value={form.companyName} onChangeText={(value) => updateForm('companyName', value)} />
            <TextInput mode="outlined" label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => updateForm('email', value)} />
            <TextInput mode="outlined" label="Phone number" value={form.phoneNumber} onChangeText={(value) => updateForm('phoneNumber', value)} />
            <TextInput mode="outlined" label="Tax no" value={form.taxNo} onChangeText={(value) => updateForm('taxNo', value)} />
            <TextInput mode="outlined" label="Address" multiline value={form.address} onChangeText={(value) => updateForm('address', value)} />
            <View style={styles.twoColumns}>
              <TextInput style={styles.columnInput} mode="outlined" label="City" value={form.city} onChangeText={(value) => updateForm('city', value)} />
              <TextInput style={styles.columnInput} mode="outlined" label="State" value={form.state} onChangeText={(value) => updateForm('state', value)} />
            </View>
            <View style={styles.twoColumns}>
              <TextInput style={styles.columnInput} mode="outlined" label="Postal code" value={form.postalCode} onChangeText={(value) => updateForm('postalCode', value)} />
              <TextInput style={styles.columnInput} mode="outlined" label="Country" value={form.country} onChangeText={(value) => updateForm('country', value)} />
            </View>
          <View style={styles.checkboxRow}>
              <Checkbox status={form.createUser ? 'checked' : 'unchecked'} onPress={() => updateForm('createUser', !form.createUser)} />
              <Text variant="titleSmall">Create User</Text>
            </View>
            {form.createUser ? (
              <>
                <TextInput mode="outlined" label="Username" value={form.username} onChangeText={(value) => updateForm('username', value)} />
                <TextInput mode="outlined" label="Password" secureTextEntry value={form.password} onChangeText={(value) => updateForm('password', value)} />
              </>
            ) : null}
            <View style={styles.switchRow}>
              <Text variant="titleSmall">Active</Text>
              <Switch value={form.isActive} onValueChange={(value) => updateForm('isActive', value)} />
            </View>
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeModal} disabled={saving}>Cancel</Button>
              <Button mode="contained" onPress={saveCustomer} loading={saving} disabled={saving}>Save</Button>
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
  table: { minWidth: 980, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  nameColumn: { flex: 1.4 },
  groupColumn: { flex: 1 },
  contactColumn: { flex: 1.2 },
  cityColumn: { flex: 1 },
  statusColumn: { flex: 0.8 },
  actionColumn: { flex: 1.1, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  paginationText: { color: '#333333' },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#666666' },
  modal: { margin: 18, maxHeight: '88%', borderRadius: 8, backgroundColor: '#ffffff' },
  modalContent: { gap: 12, padding: 18, paddingBottom: 28 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  columnInput: { flex: 1 },
  groupButton: { justifyContent: 'flex-start' },
  checkboxRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
