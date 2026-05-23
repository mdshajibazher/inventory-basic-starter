import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type ProductPayload } from '@/src/lib/api';
import type { Brand, Category, PaginationMeta, Product, Tax, Unit } from '@/src/types';

type ProductForm = {
  type: string;
  name: string;
  code: string;
  barcodeSymbology: string;
  brandId: number | null;
  categoryId: number | null;
  unitId: number | null;
  saleUnitId: number | null;
  purchaseUnitId: number | null;
  cost: string;
  price: string;
  qty: string;
  alertQuantity: string;
  taxId: number | null;
  taxMethod: number;
  featured: boolean;
  productDetails: string;
  promotion: boolean;
  promotionPrice: string;
  startingDate: string;
  lastDate: string;
  isDiffPrice: boolean;
  isBatch: boolean;
  isVariant: boolean;
  image: string | null;
  imageFile: PickedImage | null;
  removeImage: boolean;
};

type ProductOptions = {
  types: string[];
  barcode_symbologies: string[];
  tax_methods: { id: number; name: string }[];
  brands: Brand[];
  categories: Category[];
  units: Unit[];
  taxes: Tax[];
};

type RouteParams = {
  refreshKey?: number;
};

const perPage = 15;

const emptyForm: ProductForm = {
  type: 'standard',
  name: '',
  code: '',
  barcodeSymbology: 'C128',
  brandId: null,
  categoryId: null,
  unitId: null,
  saleUnitId: null,
  purchaseUnitId: null,
  cost: '0',
  price: '0',
  qty: '0',
  alertQuantity: '',
  taxId: null,
  taxMethod: 1,
  featured: false,
  productDetails: '',
  promotion: false,
  promotionPrice: '',
  startingDate: '',
  lastDate: '',
  isDiffPrice: false,
  isBatch: false,
  isVariant: false,
  image: null,
  imageFile: null,
  removeImage: false,
};

function productToForm(product: Product): ProductForm {
  return {
    type: product.type ?? 'standard',
    name: product.name,
    code: product.code,
    barcodeSymbology: product.barcode_symbology ?? 'C128',
    brandId: product.brand_id ?? null,
    categoryId: product.category_id,
    unitId: product.unit_id ?? null,
    saleUnitId: product.sale_unit_id ?? null,
    purchaseUnitId: product.purchase_unit_id ?? null,
    cost: String(product.cost ?? '0'),
    price: String(product.price ?? '0'),
    qty: String(product.qty ?? '0'),
    alertQuantity: product.alert_quantity == null ? '' : String(product.alert_quantity),
    taxId: product.tax_id ?? null,
    taxMethod: product.tax_method ?? 1,
    featured: Boolean(product.featured),
    productDetails: product.product_details ?? '',
    promotion: Boolean(product.promotion),
    promotionPrice: product.promotion_price == null ? '' : String(product.promotion_price),
    startingDate: product.starting_date ?? '',
    lastDate: product.last_date ?? '',
    isDiffPrice: Boolean(product.is_diffPrice),
    isBatch: Boolean(product.is_batch),
    isVariant: Boolean(product.is_variant),
    image: product.image_url ?? null,
    imageFile: null,
    removeImage: false,
  };
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? toNumber(trimmed) : null;
}

function generateCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

type SelectFieldProps<T> = {
  label: string;
  valueLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  options: T[];
  keyFor: (option: T) => string | number;
  labelFor: (option: T) => string;
  onSelect: (option: T) => void;
};

function SelectField<T>({
  label,
  valueLabel,
  disabled,
  style,
  options,
  keyFor,
  labelFor,
  onSelect,
}: SelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.formField, style]}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <Button
            mode="outlined"
            contentStyle={styles.selectButton}
            disabled={disabled}
            onPress={() => setVisible(true)}
          >
            {valueLabel}
          </Button>
        }
      >
        {options.map((option) => (
          <Menu.Item
            key={keyFor(option)}
            title={labelFor(option)}
            onPress={() => {
              onSelect(option);
              setVisible(false);
            }}
          />
        ))}
      </Menu>
    </View>
  );
}

export default function ProductsScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [options, setOptions] = useState<ProductOptions>({
    types: ['standard', 'combo', 'digital'],
    barcode_symbologies: ['C128', 'C39'],
    tax_methods: [
      { id: 1, name: 'Exclusive' },
      { id: 2, name: 'Inclusive' },
    ],
    brands: [],
    categories: [],
    units: [],
    taxes: [],
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('products-add');
  const canEdit = hasPermission('products-edit');
  const canDelete = hasPermission('products-delete');

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const [productResponse, optionResponse] = await Promise.all([
        api.products({ page: nextPage, perPage, search: debouncedSearch }),
        api.productOptions(),
      ]);
      if (requestId !== requestIdRef.current) return;

      const nextOptions = optionResponse.data as ProductOptions;
      setProducts(productResponse.data as Product[]);
      setPagination(productResponse.meta ?? null);
      setOptions(nextOptions);
      setForm((current) => defaultsForOptions(current, nextOptions));
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

  function defaultsForOptions(current: ProductForm, nextOptions = options): ProductForm {
    const firstUnitId = nextOptions.units[0]?.id ?? null;

    return {
      ...current,
      type: current.type || nextOptions.types[0] || 'standard',
      barcodeSymbology: current.barcodeSymbology || nextOptions.barcode_symbologies[0] || 'C128',
      categoryId: current.categoryId ?? nextOptions.categories[0]?.id ?? null,
      unitId: current.unitId ?? firstUnitId,
      saleUnitId: current.saleUnitId ?? firstUnitId,
      purchaseUnitId: current.purchaseUnitId ?? firstUnitId,
    };
  }

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateModal() {
    setEditingProduct(null);
    setForm(defaultsForOptions({ ...emptyForm, code: generateCode() }));
    setModalVisible(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm(defaultsForOptions(productToForm(product)));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingProduct(null);
    setForm(defaultsForOptions(emptyForm));
  }

  function buildPayload(): ProductPayload | null {
    if (!form.name.trim() || !form.code.trim() || !form.categoryId) {
      Alert.alert('Missing fields', 'Product name, code, and category are required.');
      return null;
    }

    if (form.type === 'standard' && (!form.unitId || !form.saleUnitId || !form.purchaseUnitId)) {
      Alert.alert('Missing units', 'Product, sale, and purchase units are required.');
      return null;
    }

    return {
      name: form.name.trim(),
      code: form.code.trim(),
      type: form.type,
      barcode_symbology: form.barcodeSymbology,
      brand_id: form.brandId,
      category_id: form.categoryId,
      unit_id: form.type === 'standard' ? form.unitId : null,
      sale_unit_id: form.type === 'standard' ? form.saleUnitId : null,
      purchase_unit_id: form.type === 'standard' ? form.purchaseUnitId : null,
      cost: toNumber(form.cost),
      price: toNumber(form.price),
      qty: toNullableNumber(form.qty),
      alert_quantity: toNullableNumber(form.alertQuantity),
      tax_id: form.taxId,
      tax_method: form.taxMethod,
      featured: form.featured,
      product_details: form.productDetails.trim() || null,
      promotion: form.promotion,
      promotion_price: form.promotion ? toNullableNumber(form.promotionPrice) : null,
      starting_date: form.promotion ? form.startingDate.trim() || null : null,
      last_date: form.promotion ? form.lastDate.trim() || null : null,
      is_diffPrice: form.isDiffPrice,
      is_batch: form.isBatch,
      is_variant: form.isVariant,
      is_active: true,
      image: form.imageFile,
      remove_image: form.removeImage,
    };
  }

  async function saveProduct() {
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
      } else {
        await api.createProduct(payload);
      }

      closeModal();
      if (editingProduct) {
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

  function confirmDelete(product: Product) {
    Alert.alert('Delete product?', `Delete ${product.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteProduct(product);
        },
      },
    ]);
  }

  async function deleteProduct(product: Product) {
    setSaving(true);
    try {
      await api.deleteProduct(product.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const selectedBrand = options.brands.find((brand) => brand.id === form.brandId);
  const selectedCategory = options.categories.find((category) => category.id === form.categoryId);
  const selectedUnit = options.units.find((unit) => unit.id === form.unitId);
  const selectedSaleUnit = options.units.find((unit) => unit.id === form.saleUnitId);
  const selectedPurchaseUnit = options.units.find((unit) => unit.id === form.purchaseUnitId);
  const selectedTax = options.taxes.find((tax) => tax.id === form.taxId);
  const selectedTaxMethod = options.tax_methods.find((method) => method.id === form.taxMethod);
  const isStandard = form.type === 'standard';

  if (!hasPermission('products-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Products</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {products.length} shown from {pagination?.total ?? products.length}
          </Text>
        </View>
        {canAdd ? (
          <Button mode="contained" onPress={openCreateModal}>
            Add
          </Button>
        ) : null}
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, code, brand, category"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.imageColumn}>Image</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Product</DataTable.Title>
            <DataTable.Title style={styles.codeColumn}>Code</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Brand</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Category</DataTable.Title>
            <DataTable.Title numeric style={styles.numberColumn}>Qty</DataTable.Title>
            <DataTable.Title numeric style={styles.numberColumn}>Price</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {products.map((product) => (
            <DataTable.Row key={product.id}>
              <DataTable.Cell style={styles.imageColumn}>
                {product.image_url ? <Image source={{ uri: product.image_url }} style={styles.tableImage} /> : 'No image'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{product.name}</DataTable.Cell>
              <DataTable.Cell style={styles.codeColumn}>{product.code}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{product.brand?.title ?? 'N/A'}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{product.category?.name ?? 'N/A'}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.numberColumn}>{product.qty ?? 0}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.numberColumn}>{Number(product.price).toFixed(2)}</DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <Button compact mode="text" onPress={() => openEditModal(product)}>Edit</Button>
                  ) : null}
                  {canDelete ? (
                    <Button compact mode="text" textColor="#b42318" onPress={() => confirmDelete(product)}>Delete</Button>
                  ) : null}
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>
            Previous
          </Button>
          <Text variant="bodyMedium" style={styles.paginationText}>Page {pagination.current_page} of {pagination.last_page}</Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>
            Next
          </Button>
        </View>
      ) : null}

      {!loading && products.length === 0 ? <Text variant="bodyMedium" style={styles.empty}>No products found.</Text> : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">{editingProduct ? 'Edit Product' : 'Add Product'}</Text>


              <SelectField
                label="Product Type *"
                valueLabel={form.type}
                style={styles.compactField}
                options={options.types}
                keyFor={(type) => type}
                labelFor={(type) => type}
                onSelect={(type) => updateForm('type', type)}
              />
              <TextInput mode="outlined" label="Product Name *" value={form.name} onChangeText={(value) => updateForm('name', value)} style={styles.wideField} />
 

        
              <TextInput mode="outlined" label="Product Code *" value={form.code} onChangeText={(value) => updateForm('code', value)} style={styles.wideField} />
              <Button mode="outlined" icon="refresh" onPress={() => updateForm('code', generateCode())} style={styles.generateButton}>Generate</Button>
         

        
              <SelectField
                label="Barcode Symbology *"
                valueLabel={form.barcodeSymbology}
                options={options.barcode_symbologies}
                keyFor={(symbology) => symbology}
                labelFor={(symbology) => symbology}
                onSelect={(symbology) => updateForm('barcodeSymbology', symbology)}
              />
              <SelectField
                label="Brand"
                valueLabel={selectedBrand?.title ?? 'Select brand'}
                options={[{ id: 0, title: 'No brand' } as Brand, ...options.brands]}
                keyFor={(brand) => brand.id}
                labelFor={(brand) => brand.title}
                onSelect={(brand) => updateForm('brandId', brand.id ? brand.id : null)}
              />
      

            <SelectField
              label="Category *"
              valueLabel={selectedCategory?.name ?? 'Select category'}
              style={styles.fullField}
              options={options.categories}
              keyFor={(category) => category.id}
              labelFor={(category) => category.name}
              onSelect={(category) => updateForm('categoryId', category.id)}
            />
            <HelperText type="info" visible={!options.categories.length}>Create a category before adding products.</HelperText>

          
              <SelectField
                label="Product Unit *"
                valueLabel={selectedUnit?.unit_name ?? 'Select product unit'}
                disabled={!isStandard}
                options={options.units}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateForm('unitId', unit.id)}
              />
              <SelectField
                label="Sale Unit"
                valueLabel={selectedSaleUnit?.unit_name ?? 'Select sale unit'}
                disabled={!isStandard}
                options={options.units}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateForm('saleUnitId', unit.id)}
              />
              <SelectField
                label="Purchase Unit"
                valueLabel={selectedPurchaseUnit?.unit_name ?? 'Select purchase unit'}
                disabled={!isStandard}
                options={options.units}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateForm('purchaseUnitId', unit.id)}
              />
       

      
              <TextInput mode="outlined" label="Product Cost *" value={form.cost} keyboardType="numeric" disabled={!isStandard} onChangeText={(value) => updateForm('cost', value)} style={styles.formField} />
              <TextInput mode="outlined" label="Product Price *" value={form.price} keyboardType="numeric" onChangeText={(value) => updateForm('price', value)} style={styles.formField} />
              <TextInput mode="outlined" label="Alert Quantity" value={form.alertQuantity} keyboardType="numeric" onChangeText={(value) => updateForm('alertQuantity', value)} style={styles.formField} />
      

       
              <SelectField
                label="Product Tax"
                valueLabel={selectedTax ? `${selectedTax.name} (${selectedTax.rate}%)` : 'No tax'}
                options={[{ id: 0, name: 'No tax', rate: 0 }, ...options.taxes]}
                keyFor={(tax) => tax.id}
                labelFor={(tax) => tax.id ? `${tax.name} (${tax.rate}%)` : tax.name}
                onSelect={(tax) => updateForm('taxId', tax.id ? tax.id : null)}
              />
              <SelectField
                label="Tax Method"
                valueLabel={selectedTaxMethod?.name ?? 'Exclusive'}
                options={options.tax_methods}
                keyFor={(method) => method.id}
                labelFor={(method) => method.name}
                onSelect={(method) => updateForm('taxMethod', method.id)}
              />
    

            <ImageUploadField
              label="Product Image"
              imageUri={form.imageFile?.uri ?? (form.removeImage ? null : form.image)}
              disabled={saving}
              onChange={(image) => setForm((current) => ({ ...current, imageFile: image, removeImage: false }))}
              onClear={() => setForm((current) => ({ ...current, image: null, imageFile: null, removeImage: true }))}
            />

            <TextInput mode="outlined" label="Product Details" value={form.productDetails} multiline numberOfLines={4} onChangeText={(value) => updateForm('productDetails', value)} />

        
              <SwitchRow label="Featured" value={form.featured} onValueChange={(value) => updateForm('featured', value)} />
              <SwitchRow label="Different warehouse price" value={form.isDiffPrice} onValueChange={(value) => updateForm('isDiffPrice', value)} />
              <SwitchRow label="Batch and expired date" value={form.isBatch} onValueChange={(value) => updateForm('isBatch', value)} />
              <SwitchRow label="Product variant" value={form.isVariant} onValueChange={(value) => updateForm('isVariant', value)} />
              <SwitchRow label="Promotional price" value={form.promotion} onValueChange={(value) => updateForm('promotion', value)} />
      

            {form.promotion ? (
              <View style={styles.formRow}>
                <TextInput mode="outlined" label="Promotion Price" value={form.promotionPrice} keyboardType="numeric" onChangeText={(value) => updateForm('promotionPrice', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Starting Date" placeholder="YYYY-MM-DD" value={form.startingDate} onChangeText={(value) => updateForm('startingDate', value)} style={styles.formField} />
                <TextInput mode="outlined" label="Last Date" placeholder="YYYY-MM-DD" value={form.lastDate} onChangeText={(value) => updateForm('lastDate', value)} style={styles.formField} />
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeModal} disabled={saving}>Cancel</Button>
              <Button mode="contained" onPress={saveProduct} loading={saving} disabled={saving}>Save</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Switch value={value} onValueChange={onValueChange} />
      <Text variant="bodyMedium" style={styles.switchLabel}>{label}</Text>
    </View>
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
  imageColumn: {
    flex: 0.75,
  },
  nameColumn: {
    flex: 1.4,
  },
  codeColumn: {
    flex: 1,
  },
  numberColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 0.8,
    justifyContent: 'center',
  },
  tableImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#f2f4f7',
  },
  actions: {
    flexDirection: 'row',
    gap: 2,
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  paginationText: {
    color: '#667085',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#667085',
  },
  modal: {
    maxHeight: '92%',
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalContent: {
    padding: 18,
    gap: 10,
  },
  fieldLabel: {
    marginBottom: 4,
    color: '#344054',
  },
  selectButton: {
    justifyContent: 'flex-start',
    width: '100%',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: 10,
    rowGap: 10,
  },
  formField: {
    minWidth: 180,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  compactField: {
    minWidth: 140,
    flexBasis: 160,
    flexGrow: 0,
  },
  wideField: {
    minWidth: 200,
    flexBasis: 0,
    flexGrow: 2,
    flexShrink: 1,
  },
  fullField: {
    alignSelf: 'stretch',
  },
  generateButton: {
    alignSelf: 'flex-end',
    minWidth: 132,
  },
  switchGrid: {
    gap: 8,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  switchLabel: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
