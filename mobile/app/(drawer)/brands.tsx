import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
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
import type { Brand, PaginationMeta } from '@/src/types';

type BrandForm = {
  title: string;
  image: string | null;
  imageFile: PickedImage | null;
  removeImage: boolean;
  isActive: boolean;
};

const emptyForm: BrandForm = {
  title: '',
  image: null,
  imageFile: null,
  removeImage: false,
  isActive: true,
};

const perPage = 15;

function brandToForm(brand: Brand): BrandForm {
  return {
    title: brand.title,
    image: brand.image ?? null,
    imageFile: null,
    removeImage: false,
    isActive: Boolean(brand.is_active),
  };
}

export default function BrandsScreen() {
  const { hasPermission } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState<BrandForm>(emptyForm);
  const requestIdRef = useRef(0);

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.brands({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setBrands(response.data as Brand[]);
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
  }, [load, page]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  function updateForm<K extends keyof BrandForm>(key: K, value: BrandForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingBrand(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(brand: Brand) {
    setEditingBrand(brand);
    setForm(brandToForm(brand));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingBrand(null);
    setForm(emptyForm);
  }

  async function saveBrand() {
    if (!form.title.trim()) {
      Alert.alert('Missing title', 'Brand title is required.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      image: form.imageFile,
      remove_image: form.removeImage,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingBrand) {
        await api.updateBrand(editingBrand.id, payload);
      } else {
        await api.createBrand(payload);
      }

      closeModal();
      if (editingBrand) {
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

  function confirmDelete(brand: Brand) {
    Alert.alert('Delete brand?', `Delete ${brand.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteBrand(brand);
        },
      },
    ]);
  }

  async function deleteBrand(brand: Brand) {
    setSaving(true);
    try {
      await api.deleteBrand(brand.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('brand')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Brands</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {brands.length} shown from {pagination?.total ?? brands.length}
          </Text>
        </View>
        <Button mode="contained" onPress={openCreateModal}>
          Add
        </Button>
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search brands, image, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.titleColumn}>Brand</DataTable.Title>
            <DataTable.Title style={styles.imageColumn}>Image</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {brands.map((brand) => (
            <DataTable.Row key={brand.id}>
              <DataTable.Cell style={styles.titleColumn}>{brand.title}</DataTable.Cell>
              <DataTable.Cell style={styles.imageColumn}>
                {brand.image ? (
                  <Image source={{ uri: brand.image }} style={styles.tableImage} />
                ) : (
                  'No image'
                )}
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {brand.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  <Button compact mode="text" onPress={() => openEditModal(brand)}>
                    Edit
                  </Button>
                  <Button compact mode="text" textColor="#b42318" onPress={() => confirmDelete(brand)}>
                    Delete
                  </Button>
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

      {!loading && brands.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No brands found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge">
            {editingBrand ? 'Edit Brand' : 'Add Brand'}
          </Text>

          <TextInput
            mode="outlined"
            label="Brand title"
            value={form.title}
            onChangeText={(value) => updateForm('title', value)}
          />

          <ImageUploadField
            label="Brand image"
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
                removeImage: Boolean(editingBrand?.image),
              }))
            }
          />

          <View style={styles.switchRow}>
            <View>
              <Text variant="titleSmall">Active</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Show this brand as available.
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
            <Button mode="contained" onPress={saveBrand} loading={saving} disabled={saving}>
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
    color: '#667085',
  },
  table: {
    minWidth: 700,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  titleColumn: {
    flex: 1.3,
  },
  imageColumn: {
    flex: 1.2,
  },
  tableImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#f2f4f7',
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
    color: '#344054',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#667085',
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
