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
  Text,
  TextInput,
} from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/lib/api';
import type { Category, Product } from '@/src/types';

type ProductForm = {
  categoryId: number | null;
  name: string;
  sku: string;
  purchasePrice: string;
  sellingPrice: string;
  lowStockLimit: string;
  description: string;
};

const emptyForm: ProductForm = {
  categoryId: null,
  name: '',
  sku: '',
  purchasePrice: '0',
  sellingPrice: '0',
  lowStockLimit: '5',
  description: '',
};

function productToForm(product: Product): ProductForm {
  return {
    categoryId: product.category_id,
    name: product.name,
    sku: product.sku,
    purchasePrice: String(product.purchase_price ?? '0'),
    sellingPrice: String(product.selling_price ?? '0'),
    lowStockLimit: String(product.low_stock_limit ?? '5'),
    description: product.description ?? '',
  };
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.categoryId),
    [categories, form.categoryId]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      const category = product.category?.name ?? '';
      return [product.name, product.sku, category].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [products, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productResponse, categoryResponse] = await Promise.all([
        api.products(),
        api.categories(),
      ]);
      const nextCategories = categoryResponse.data as Category[];

      setProducts(productResponse.data as Product[]);
      setCategories(nextCategories);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId ?? nextCategories[0]?.id ?? null,
      }));
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingProduct(null);
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id ?? null,
    });
    setModalVisible(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm(productToForm(product));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setCategoryMenuVisible(false);
    setEditingProduct(null);
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id ?? null,
    });
  }

  async function saveProduct() {
    if (!form.categoryId) {
      Alert.alert('Category required', 'Create a category before adding products.');
      return;
    }

    if (!form.name.trim() || !form.sku.trim()) {
      Alert.alert('Missing fields', 'Product name and SKU are required.');
      return;
    }

    const payload = {
      category_id: form.categoryId,
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: null,
      purchase_price: Number(form.purchasePrice) || 0,
      selling_price: Number(form.sellingPrice) || 0,
      quantity: editingProduct?.quantity ?? 0,
      low_stock_limit: Number(form.lowStockLimit) || 0,
      description: form.description.trim() || null,
    };

    setSaving(true);
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
      } else {
        await api.createProduct(payload);
      }

      closeModal();
      await load();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Products</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {filteredProducts.length} shown from {products.length}
          </Text>
        </View>
        <Button mode="contained" onPress={openCreateModal}>
          Add
        </Button>
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, SKU, category"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Product</DataTable.Title>
            <DataTable.Title style={styles.skuColumn}>SKU</DataTable.Title>
            <DataTable.Title style={styles.categoryColumn}>Category</DataTable.Title>
            <DataTable.Title numeric style={styles.numberColumn}>
              Qty
            </DataTable.Title>
            <DataTable.Title numeric style={styles.numberColumn}>
              Price
            </DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {filteredProducts.map((product) => (
            <DataTable.Row key={product.id}>
              <DataTable.Cell style={styles.nameColumn}>{product.name}</DataTable.Cell>
              <DataTable.Cell style={styles.skuColumn}>{product.sku}</DataTable.Cell>
              <DataTable.Cell style={styles.categoryColumn}>
                {product.category?.name ?? 'Uncategorized'}
              </DataTable.Cell>
              <DataTable.Cell numeric style={styles.numberColumn}>
                {product.quantity}
              </DataTable.Cell>
              <DataTable.Cell numeric style={styles.numberColumn}>
                {Number(product.selling_price).toFixed(2)}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <Button compact mode="text" onPress={() => openEditModal(product)}>
                  Edit
                </Button>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {!loading && filteredProducts.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No products found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge">{editingProduct ? 'Edit Product' : 'Add Product'}</Text>

          <TextInput
            mode="outlined"
            label="Product name"
            value={form.name}
            onChangeText={(value) => updateForm('name', value)}
          />
          <TextInput
            mode="outlined"
            label="SKU"
            value={form.sku}
            onChangeText={(value) => updateForm('sku', value)}
          />

          <Menu
            visible={categoryMenuVisible}
            onDismiss={() => setCategoryMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                contentStyle={styles.categoryButton}
                onPress={() => setCategoryMenuVisible(true)}
              >
                {selectedCategory?.name ?? 'Select category'}
              </Button>
            }
          >
            {categories.map((category) => (
              <Menu.Item
                key={category.id}
                title={category.name}
                onPress={() => {
                  updateForm('categoryId', category.id);
                  setCategoryMenuVisible(false);
                }}
              />
            ))}
          </Menu>
          <HelperText type="info" visible={!categories.length}>
            Create a category before adding products.
          </HelperText>

          <View style={styles.formRow}>
            <TextInput
              mode="outlined"
              label="Purchase price"
              value={form.purchasePrice}
              keyboardType="numeric"
              onChangeText={(value) => updateForm('purchasePrice', value)}
              style={styles.formRowInput}
            />
            <TextInput
              mode="outlined"
              label="Selling price"
              value={form.sellingPrice}
              keyboardType="numeric"
              onChangeText={(value) => updateForm('sellingPrice', value)}
              style={styles.formRowInput}
            />
          </View>

          <TextInput
            mode="outlined"
            label="Low stock limit"
            value={form.lowStockLimit}
            keyboardType="numeric"
            onChangeText={(value) => updateForm('lowStockLimit', value)}
          />
          <TextInput
            mode="outlined"
            label="Description"
            value={form.description}
            multiline
            onChangeText={(value) => updateForm('description', value)}
          />

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={saveProduct} loading={saving} disabled={saving}>
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
    minWidth: 760,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.4,
  },
  skuColumn: {
    flex: 1,
  },
  categoryColumn: {
    flex: 1.2,
  },
  numberColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 0.8,
    justifyContent: 'center',
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
  categoryButton: {
    justifyContent: 'flex-start',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formRowInput: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
