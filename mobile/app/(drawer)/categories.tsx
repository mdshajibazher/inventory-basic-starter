import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import {
  Button,
  DataTable,
  HelperText,
  Menu,
  Modal,
  Portal,
  Searchbar,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { ImageUploadField, type PickedImage } from '@/src/components/ImageUploadField';
import { ResourceImage } from '@/src/components/ResourceImage';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { Category, PaginationMeta } from '@/src/types';

type CategoryForm = {
  name: string;
  image: string | null;
  imageFile: PickedImage | null;
  removeImage: boolean;
  parentId: number | null;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: CategoryForm = {
  name: '',
  image: null,
  imageFile: null,
  removeImage: false,
  parentId: null,
  isActive: true,
};

const perPage = 15;

function categoryToForm(category: Category): CategoryForm {
  return {
    name: category.name,
    image: category.image ?? null,
    imageFile: null,
    removeImage: false,
    parentId: category.parent_id ?? null,
    isActive: Boolean(category.is_active),
  };
}

export default function CategoriesScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [parentMenuVisible, setParentMenuVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('categories-add');
  const canEdit = hasPermission('categories-edit');
  const canDelete = hasPermission('categories-delete');

  const parentOptions = useMemo(
    () => categories.filter((category) => category.id !== editingCategory?.id),
    [categories, editingCategory?.id]
  );

  const selectedParent = useMemo(
    () => categories.find((category) => category.id === form.parentId),
    [categories, form.parentId]
  );

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.categories({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setCategories(response.data as Category[]);
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

  function updateForm<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingCategory(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setForm(categoryToForm(category));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setParentMenuVisible(false);
    setEditingCategory(null);
    setForm(emptyForm);
  }

  async function saveCategory() {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Category name is required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      image: form.imageFile,
      remove_image: form.removeImage,
      parent_id: form.parentId,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, payload);
      } else {
        await api.createCategory(payload);
      }

      closeModal();
      if (editingCategory) {
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

  function confirmDelete(category: Category) {
    Alert.alert('Delete category?', `Delete ${category.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteCategory(category);
        },
      },
    ]);
  }

  async function deleteCategory(category: Category) {
    setSaving(true);
    try {
      await api.deleteCategory(category.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('categories-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Categories</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {categories.length} shown from {pagination?.total ?? categories.length}
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
        placeholder="Search categories, parent, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Category</DataTable.Title>
            <DataTable.Title style={styles.imageColumn}>Image</DataTable.Title>
            <DataTable.Title style={styles.parentColumn}>Parent</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {categories.map((category) => (
            <DataTable.Row key={category.id}>
              <DataTable.Cell style={styles.nameColumn}>{category.name}</DataTable.Cell>
              <DataTable.Cell style={styles.imageColumn}>
                <ResourceImage uri={category.image} kind="category" />
              </DataTable.Cell>
              <DataTable.Cell style={styles.parentColumn}>
                {category.parent_category_name ?? category.parent?.name ?? 'Root'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {category.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(category)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(category)}>
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

      {!loading && categories.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No categories found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge">
            {editingCategory ? 'Edit Category' : 'Add Category'}
          </Text>

          <TextInput
            mode="outlined"
            label="Category name"
            value={form.name}
            onChangeText={(value) => updateForm('name', value)}
          />

          <ImageUploadField
            label="Category image"
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
                removeImage: Boolean(editingCategory?.image),
              }))
            }
          />

          <Menu
            visible={parentMenuVisible}
            onDismiss={() => setParentMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                contentStyle={styles.parentButton}
                onPress={() => setParentMenuVisible(true)}
              >
                {selectedParent?.name ?? 'Root category'}
              </Button>
            }
          >
            <Menu.Item
              title="Root category"
              onPress={() => {
                updateForm('parentId', null);
                setParentMenuVisible(false);
              }}
            />
            {parentOptions.map((category) => (
              <Menu.Item
                key={category.id}
                title={category.name}
                onPress={() => {
                  updateForm('parentId', category.id);
                  setParentMenuVisible(false);
                }}
              />
            ))}
          </Menu>
          <HelperText type="info" visible={parentOptions.length === 0}>
            Save more categories to choose a parent.
          </HelperText>

          <View style={styles.switchRow}>
            <View>
              <Text variant="titleSmall">Active</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Show this category as available.
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
            <Button mode="contained" onPress={saveCategory} loading={saving} disabled={saving}>
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
    minWidth: 700,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.3,
  },
  imageColumn: {
    flex: 0.8,
  },
  parentColumn: {
    flex: 1.1,
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
  parentButton: {
    justifyContent: 'flex-start',
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
