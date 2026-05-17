import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
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
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/lib/api';
import type { Category } from '@/src/types';

type CategoryForm = {
  name: string;
  parentId: number | null;
  isActive: boolean;
};

const emptyForm: CategoryForm = {
  name: '',
  parentId: null,
  isActive: true,
};

function categoryToForm(category: Category): CategoryForm {
  return {
    name: category.name,
    parentId: category.parent_id ?? null,
    isActive: Boolean(category.is_active),
  };
}

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [parentMenuVisible, setParentMenuVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const parentOptions = useMemo(
    () => categories.filter((category) => category.id !== editingCategory?.id),
    [categories, editingCategory?.id]
  );

  const selectedParent = useMemo(
    () => categories.find((category) => category.id === form.parentId),
    [categories, form.parentId]
  );

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return categories;

    return categories.filter((category) => {
      const parent = category.parent?.name ?? '';
      const status = category.is_active ? 'active' : 'inactive';
      return [category.name, parent, status].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [categories, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.categories();
      setCategories(response.data as Category[]);
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      await load();
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
      await load();
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Categories</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {filteredCategories.length} shown from {categories.length}
          </Text>
        </View>
        <Button mode="contained" onPress={openCreateModal}>
          Add
        </Button>
      </View>

      <Searchbar
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
            <DataTable.Title style={styles.parentColumn}>Parent</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {filteredCategories.map((category) => (
            <DataTable.Row key={category.id}>
              <DataTable.Cell style={styles.nameColumn}>{category.name}</DataTable.Cell>
              <DataTable.Cell style={styles.parentColumn}>
                {category.parent?.name ?? 'Root'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {category.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  <Button compact mode="text" onPress={() => openEditModal(category)}>
                    Edit
                  </Button>
                  <Button compact mode="text" textColor="#b42318" onPress={() => confirmDelete(category)}>
                    Delete
                  </Button>
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {!loading && filteredCategories.length === 0 ? (
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
    color: '#667085',
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
