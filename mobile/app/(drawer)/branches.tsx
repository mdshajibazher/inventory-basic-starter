import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
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
import { ImageUploadField, type PickedImage } from '@/src/components/ImageUploadField';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { Branch, PaginationMeta } from '@/src/types';

type BranchForm = {
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

const emptyForm: BranchForm = {
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

function branchToForm(branch: Branch): BranchForm {
  return {
    name: branch.name,
    image: branch.image ?? null,
    imageFile: null,
    removeImage: false,
    companyName: branch.company_name,
    vatNumber: branch.vat_number ?? '',
    email: branch.email,
    phoneNumber: branch.phone_number,
    address: branch.address,
    city: branch.city,
    state: branch.state ?? '',
    postalCode: branch.postal_code ?? '',
    country: branch.country ?? '',
    isActive: Boolean(branch.is_active),
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

export default function BranchesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('branches-add');
  const canEdit = hasPermission('branches-edit');
  const canDelete = hasPermission('branches-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.branches({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setBranches(response.data as Branch[]);
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

  function updateForm<K extends keyof BranchForm>(key: K, value: BranchForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingBranch(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(branch: Branch) {
    setEditingBranch(branch);
    setForm(branchToForm(branch));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingBranch(null);
    setForm(emptyForm);
  }

  async function saveBranch() {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Branch name is required.');
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
      if (editingBranch) {
        await api.updateBranch(editingBranch.id, payload);
      } else {
        await api.createBranch(payload);
      }

      closeModal();
      if (editingBranch) {
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

  function confirmDelete(branch: Branch) {
    Alert.alert('Delete branch?', `Delete ${branch.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteBranch(branch);
        },
      },
    ]);
  }

  async function deleteBranch(branch: Branch) {
    setSaving(true);
    try {
      await api.deleteBranch(branch.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('branches-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Branches</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {branches.length} shown from {pagination?.total ?? branches.length}
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
        placeholder="Search branches, company, contact, address, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Branch</DataTable.Title>
            <DataTable.Title style={styles.imageColumn}>Image</DataTable.Title>
            <DataTable.Title style={styles.companyColumn}>Company</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Email</DataTable.Title>
            <DataTable.Title style={styles.contactColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.cityColumn}>City</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {branches.map((branch) => (
            <DataTable.Row key={branch.id}>
              <DataTable.Cell style={styles.nameColumn}>{branch.name}</DataTable.Cell>
              <DataTable.Cell style={styles.imageColumn}>
                {branch.image ? <Image source={{ uri: branch.image }} style={styles.tableImage} /> : 'No image'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.companyColumn}>{branch.company_name}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{branch.email}</DataTable.Cell>
              <DataTable.Cell style={styles.contactColumn}>{branch.phone_number}</DataTable.Cell>
              <DataTable.Cell style={styles.cityColumn}>{branch.city}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {branch.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(branch)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(branch)}>
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

      {!loading && branches.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No branches found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">
              {editingBranch ? 'Edit Branch' : 'Add Branch'}
            </Text>

            <TextInput
              mode="outlined"
              label="Branch name"
              value={form.name}
              onChangeText={(value) => updateForm('name', value)}
            />
            <TextInput
              mode="outlined"
              label="Company name"
              value={form.companyName}
              onChangeText={(value) => updateForm('companyName', value)}
            />
            <TextInput
              mode="outlined"
              label="VAT number"
              value={form.vatNumber}
              onChangeText={(value) => updateForm('vatNumber', value)}
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
              label="Phone number"
              value={form.phoneNumber}
              onChangeText={(value) => updateForm('phoneNumber', value)}
            />
            <TextInput
              mode="outlined"
              label="Address"
              multiline
              value={form.address}
              onChangeText={(value) => updateForm('address', value)}
            />
            <TextInput
              mode="outlined"
              label="City"
              value={form.city}
              onChangeText={(value) => updateForm('city', value)}
            />
            <TextInput
              mode="outlined"
              label="State"
              value={form.state}
              onChangeText={(value) => updateForm('state', value)}
            />
            <TextInput
              mode="outlined"
              label="Postal code"
              value={form.postalCode}
              onChangeText={(value) => updateForm('postalCode', value)}
            />
            <TextInput
              mode="outlined"
              label="Country"
              value={form.country}
              onChangeText={(value) => updateForm('country', value)}
            />

            <ImageUploadField
              label="Branch image"
              imageUri={form.imageFile?.uri ?? form.image}
              disabled={saving}
              onChange={(image) =>
                setForm((current) => ({
                  ...current,
                  imageFile: image,
                  removeImage: false,
                }))
              }
              onClear={() =>
                setForm((current) => ({
                  ...current,
                  image: null,
                  imageFile: null,
                  removeImage: Boolean(editingBranch?.image),
                }))
              }
            />

            <View style={styles.switchRow}>
              <View>
                <Text variant="titleSmall">Active</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  Show this branch as available.
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
              <Button mode="contained" onPress={saveBranch} loading={saving} disabled={saving}>
                Save
              </Button>
            </View>
          </ScrollView>
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
    minWidth: 1200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.3,
  },
  imageColumn: {
    flex: 1,
  },
  companyColumn: {
    flex: 1.4,
  },
  contactColumn: {
    flex: 1.5,
  },
  cityColumn: {
    flex: 1,
  },
  statusColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 1.1,
    justifyContent: 'center',
  },
  tableImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#f2f2f2',
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
    maxHeight: '92%',
    margin: 18,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalContent: {
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
