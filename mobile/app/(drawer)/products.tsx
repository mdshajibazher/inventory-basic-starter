import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect, useRouter } from 'expo-router';
import {
  Button,
  DataTable,
  HelperText,
  ActivityIndicator,
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
import type { Brand, Category, PaginationMeta, Product, Tax, Unit, Warehouse } from '@/src/types';
import { productBadgeTone, productTaxLabel, productUnitLabel, productVariantLabel } from '@/src/product-list-display';

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
  warehousePrices: WarehousePriceForm[];
  isBatch: boolean;
  isVariant: boolean;
  variantGroups: VariantOptionGroupForm[];
  variants: ProductVariantForm[];
  image: string | null;
  imageFile: PickedImage | null;
  removeImage: boolean;
};

type WarehousePriceForm = {
  warehouseId: number;
  warehouseName: string;
  price: string;
};

type ProductVariantForm = {
  id?: number | null;
  variantId?: number | null;
  name: string;
  itemCode: string;
  additionalPrice: string;
};

type VariantOptionGroupForm = {
  id: string;
  name: string;
  values: string;
};

type ProductOptions = {
  types: string[];
  barcode_symbologies: string[];
  tax_methods: { id: number; name: string }[];
  units: Unit[];
  taxes: Tax[];
  warehouses: Warehouse[];
};

type RouteParams = {
  refreshKey?: number;
};

type ProductScreenMode = 'index' | 'create' | 'edit';

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
  warehousePrices: [],
  isBatch: false,
  isVariant: false,
  variantGroups: [],
  variants: [],
  image: null,
  imageFile: null,
  removeImage: false,
};

function productToForm(product: Product, options?: ProductOptions): ProductForm {
  return {
    type: product.type ?? 'standard',
    name: product.name,
    code: product.code,
    barcodeSymbology: product.barcode_symbology ?? 'C128',
    brandId: product.brand_id ?? null,
    categoryId: product.category_id,
    unitId: resolveUnitId(product, 'unit_id', 'unit', options),
    saleUnitId: resolveUnitId(product, 'sale_unit_id', 'sale_unit', options),
    purchaseUnitId: resolveUnitId(product, 'purchase_unit_id', 'purchase_unit', options),
    cost: String(product.cost ?? '0'),
    price: String(product.price ?? '0'),
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
    warehousePrices: (product.warehouse_prices ?? []).map((warehousePrice) => ({
      warehouseId: warehousePrice.warehouse_id,
      warehouseName: warehousePrice.warehouse_name ?? `Warehouse ${warehousePrice.warehouse_id}`,
      price: warehousePrice.price == null ? '' : String(warehousePrice.price),
    })),
    isBatch: Boolean(product.is_batch),
    isVariant: Boolean(product.is_variant) && !Boolean(product.is_batch),
    variantGroups: [],
    variants: Boolean(product.is_batch) ? [] : (product.variants ?? []).map((variant) => ({
      id: variant.id,
      variantId: variant.variant_id,
      name: variant.name,
      itemCode: variant.item_code,
      additionalPrice: String(variant.additional_price ?? '0'),
    })),
    image: product.image_url ?? null,
    imageFile: null,
    removeImage: false,
  };
}

type ProductUnitRelation = Unit | number | string | null | undefined;

function normalizeId(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveUnitId(product: Product, idKey: keyof Product, relationKey: keyof Product, options?: ProductOptions) {
  const rawProduct = product as Record<string, unknown>;
  const relation = rawProduct[relationKey] as ProductUnitRelation;
  const directId = normalizeId(rawProduct[idKey] as number | string | null | undefined);
  const relationId = typeof relation === 'object' ? normalizeId(relation?.id) : normalizeId(relation);

  if (directId) return directId;
  if (relationId) return relationId;

  if (typeof relation === 'string') {
    const normalizedRelation = relation.trim().toLowerCase();
    return options?.units.find((unit) => (
      unit.unit_name.toLowerCase() === normalizedRelation ||
      unit.unit_code.toLowerCase() === normalizedRelation
    ))?.id ?? null;
  }

  return null;
}

function mergeProductUnits(units: Unit[], product: Product): Unit[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  [product.unit, product.sale_unit, product.purchase_unit].forEach((unit) => {
    if (unit?.id && !byId.has(unit.id)) {
      byId.set(unit.id, unit);
    }
  });

  return Array.from(byId.values());
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(month: Date) {
  const start = startOfMonth(month);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
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

type SearchableSelectFieldProps<T> = {
  label: string;
  valueLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  keyFor: (option: T) => string | number;
  labelFor: (option: T) => string;
  detailFor?: (option: T) => string | null | undefined;
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

function SearchableSelectField<T>({
  label,
  valueLabel,
  disabled,
  style,
  placeholder,
  search,
  keyFor,
  labelFor,
  detailFor,
  onSelect,
}: SearchableSelectFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timeout);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    search(debouncedQuery)
      .then((nextOptions) => {
        if (!cancelled) setOptions(nextOptions);
      })
      .catch((error) => {
        if (!cancelled) Alert.alert('Search failed', error instanceof Error ? error.message : 'Try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, search, visible]);

  function open() {
    setQuery('');
    setDebouncedQuery('');
    setVisible(true);
  }

  return (
    <View style={[styles.formField, style]}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <Button mode="outlined" disabled={disabled} contentStyle={styles.selectButton} onPress={open}>{valueLabel}</Button>
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.searchModal}>
          <View style={styles.searchModalContent}>
            <Text variant="titleMedium">{label}</Text>
            <Searchbar value={query} onChangeText={setQuery} placeholder={placeholder} loading={loading} style={styles.searchbar} inputStyle={styles.searchbarInput} />
            {loading ? <ActivityIndicator style={styles.searchLoading} /> : null}
            <FlatList
              data={options}
              keyExtractor={(item) => String(keyFor(item))}
              keyboardShouldPersistTaps="handled"
              style={styles.searchList}
              ListEmptyComponent={!loading ? <Text style={styles.emptySearch}>No matches found.</Text> : null}
              renderItem={({ item }) => {
                const detail = detailFor?.(item);
                return (
                  <Button mode="text" contentStyle={styles.searchResultButton} labelStyle={styles.searchResultLabel} onPress={() => { onSelect(item); setVisible(false); }}>
                    {detail ? `${labelFor(item)}\n${detail}` : labelFor(item)}
                  </Button>
                );
              }}
            />
            <Button mode="outlined" onPress={() => setVisible(false)}>Close</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

export default function ProductsScreen({ mode = 'index', productId }: { mode?: ProductScreenMode; productId?: number }) {
  const { width } = useWindowDimensions();
  const { hasPermission } = useAuth();
  const route = useRoute();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [options, setOptions] = useState<ProductOptions>({
    types: ['standard', 'combo', 'digital'],
    barcode_symbologies: ['C128', 'C39'],
    tax_methods: [
      { id: 1, name: 'Exclusive' },
      { id: 2, name: 'Inclusive' },
    ],
    units: [],
    taxes: [],
    warehouses: [],
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('products-add');
  const canEdit = hasPermission('products-edit');
  const canDelete = hasPermission('products-delete');
  const compactVariantLayout = width < 560;

  const searchBrands = useCallback(async (query: string) => {
    const response = await api.brands({ page: 1, perPage: 20, search: query, activeOnly: true });
    return [{ id: 0, title: 'No brand' } as Brand, ...(response.data as Brand[])];
  }, []);

  const searchCategories = useCallback(async (query: string) => {
    const response = await api.categories({ page: 1, perPage: 20, search: query, activeOnly: true });
    return response.data as Category[];
  }, []);

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const productResponse = await api.products({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setProducts(productResponse.data as Product[]);
      setPagination(productResponse.meta ?? null);
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
    if (mode !== 'index') return;
    load(page);
  }, [load, mode, page, refreshKey]);

  useEffect(() => {
    if (mode === 'index') return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    Promise.all([
      api.productOptions(),
      mode === 'edit' && productId ? api.product(productId) : Promise.resolve(null),
    ])
      .then(([optionResponse, productResponse]) => {
        if (requestId !== requestIdRef.current) return;
        const nextOptions = optionResponse.data as ProductOptions;
        setOptions(nextOptions);

        if (productResponse) {
          const product = productResponse.data as Product;
          const editOptions = {
            ...nextOptions,
            units: mergeProductUnits(nextOptions.units, product),
          };
          setEditingProduct(product);
          setSelectedBrand(product.brand ?? null);
          setSelectedCategory(product.category ?? null);
          setOptions(editOptions);
          setForm(defaultsForOptions(productToForm(product, editOptions), editOptions, { defaultUnits: false }));
        } else {
          resetCreateForm(nextOptions);
        }
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) {
          Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [mode, productId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  function defaultsForOptions(
    current: ProductForm,
    nextOptions = options,
    { defaultUnits = true }: { defaultUnits?: boolean } = {}
  ): ProductForm {
    const unitId = current.unitId ?? (defaultUnits ? nextOptions.units[0]?.id ?? null : null);
    const unitFamily = compatibleUnits(nextOptions.units, unitId);

    return {
      ...current,
      type: current.type || nextOptions.types[0] || 'standard',
      barcodeSymbology: current.barcodeSymbology || nextOptions.barcode_symbologies[0] || 'C128',
      unitId,
      saleUnitId: unitFamily.some((unit) => unit.id === current.saleUnitId) ? current.saleUnitId : null,
      purchaseUnitId: unitFamily.some((unit) => unit.id === current.purchaseUnitId) ? current.purchaseUnitId : null,
      warehousePrices: mergeWarehousePrices(current.warehousePrices, nextOptions.warehouses),
    };
  }

  function resetCreateForm(nextOptions = options) {
    setEditingProduct(null);
    setSelectedBrand(null);
    setSelectedCategory(null);
    setForm(defaultsForOptions({ ...emptyForm, code: generateCode() }, nextOptions, { defaultUnits: false }));
  }

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateBaseUnit(unitId: number | null) {
    setForm((current) => {
      const unitFamily = compatibleUnits(options.units, unitId);

      return {
        ...current,
        unitId,
        saleUnitId: unitId && unitFamily.some((unit) => unit.id === current.saleUnitId) ? current.saleUnitId : null,
        purchaseUnitId: unitId && unitFamily.some((unit) => unit.id === current.purchaseUnitId) ? current.purchaseUnitId : null,
      };
    });
  }

  function updateBatch(value: boolean) {
    setForm((current) => ({
      ...current,
      isBatch: value,
      isVariant: value ? false : current.isVariant,
      variantGroups: value ? [] : current.variantGroups,
      variants: value ? [] : current.variants,
    }));
  }

  function updateVariantEnabled(value: boolean) {
    setForm((current) => ({
      ...current,
      isVariant: value,
      isBatch: value ? false : current.isBatch,
      variantGroups: value ? current.variantGroups : [],
    }));
  }

  function updatePromotion(value: boolean) {
    setForm((current) => ({
      ...current,
      promotion: value,
      startingDate: value && !current.startingDate ? todayDate() : current.startingDate,
    }));
  }

  function updateVariant<K extends keyof ProductVariantForm>(index: number, key: K, value: ProductVariantForm[K]) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, [key]: value } : variant
      )),
    }));
  }

  function updateWarehousePrice(index: number, price: string) {
    setForm((current) => ({
      ...current,
      warehousePrices: current.warehousePrices.map((warehousePrice, warehouseIndex) => (
        warehouseIndex === index ? { ...warehousePrice, price } : warehousePrice
      )),
    }));
  }

  function removeVariant(index: number) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  }

  function addVariantGroup() {
    setForm((current) => ({
      ...current,
      variantGroups: [
        ...current.variantGroups,
        { id: variantGroupId(), name: '', values: '' },
      ],
    }));
  }

  function updateVariantGroup<K extends keyof VariantOptionGroupForm>(index: number, key: K, value: VariantOptionGroupForm[K]) {
    setForm((current) => ({
      ...current,
      variantGroups: current.variantGroups.map((group, groupIndex) => (
        groupIndex === index ? { ...group, [key]: value } : group
      )),
    }));
  }

  function removeVariantGroup(index: number) {
    setForm((current) => ({
      ...current,
      variantGroups: current.variantGroups.filter((_, groupIndex) => groupIndex !== index),
    }));
  }

  function generateVariantCombinations() {
    setForm((current) => {
      const combinations = variantCombinations(current.variantGroups);
      if (!combinations.length) return current;

      const existingNames = new Set(current.variants.map((variant) => normalizeVariantName(variant.name)));
      const generated = combinations
        .filter((name) => !existingNames.has(normalizeVariantName(name)))
        .map((name) => ({
          id: null,
          variantId: null,
          name,
          itemCode: variantItemCode(current.code, name),
          additionalPrice: '0',
        }));

      if (!generated.length) return current;

      return {
        ...current,
        variants: [...current.variants, ...generated],
      };
    });
  }

  function openCreatePage() {
    router.push('/(drawer)/products-create');
  }

  function openEditPage(product: Product) {
    router.push({ pathname: '/(drawer)/products-edit', params: { id: String(product.id) } });
  }

  function openDetailPage(product: Product) {
    router.push({ pathname: '/(drawer)/products-detail', params: { id: String(product.id) } });
  }

  function closeForm() {
    router.replace('/(drawer)/products');
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

    if (form.isVariant && !form.variants.length) {
      Alert.alert('Missing variants', 'Generate at least one variant combination before saving.');
      return null;
    }

    if (form.isVariant && form.variants.some((variant) => !variant.name.trim() || !variant.itemCode.trim())) {
      Alert.alert('Invalid variants', 'Each variant needs a name and item code.');
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
      is_variant: form.isVariant && !form.isBatch,
      variants: form.isVariant && !form.isBatch
        ? form.variants.map((variant) => ({
          id: variant.id,
          variant_id: variant.variantId,
          name: variant.name.trim(),
          item_code: variant.itemCode.trim(),
          additional_price: toNumber(variant.additionalPrice),
        }))
        : [],
      warehouse_prices: form.warehousePrices.map((warehousePrice) => ({
        warehouse_id: warehousePrice.warehouseId,
        price: toNullableNumber(warehousePrice.price),
      })),
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
        resetCreateForm();
      }

      closeForm();
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

  const selectedUnit = options.units.find((unit) => unit.id === form.unitId);
  const salePurchaseUnits = compatibleUnits(options.units, form.unitId);
  const selectedSaleUnit = salePurchaseUnits.find((unit) => unit.id === form.saleUnitId);
  const selectedPurchaseUnit = salePurchaseUnits.find((unit) => unit.id === form.purchaseUnitId);
  const selectedTax = options.taxes.find((tax) => tax.id === form.taxId);
  const selectedTaxMethod = options.tax_methods.find((method) => method.id === form.taxMethod);
  const isStandard = form.type === 'standard';
  const unitIdLocked = mode === 'edit' && Boolean(editingProduct?.unit_id_locked);
  const salePurchaseDisabled = !isStandard || !form.unitId;

  if (mode === 'index' && !hasPermission('products-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  if (mode === 'create' && !hasPermission('products-add')) {
    return <Redirect href="/(drawer)/products" />;
  }

  if (mode === 'edit' && !hasPermission('products-edit')) {
    return <Redirect href="/(drawer)/products" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">{mode === 'edit' ? 'Edit Product' : mode === 'create' ? 'Add Product' : 'Products'}</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {mode === 'index'
              ? `${products.length} shown from ${pagination?.total ?? products.length}`
              : editingProduct
                ? 'Update product information and stock settings'
                : 'Create a product and configure price, stock, and variants'}
          </Text>
        </View>
        {mode === 'index' && canAdd ? (
          <Button mode="contained" onPress={openCreatePage}>
            Add
          </Button>
        ) : null}
        {mode !== 'index' ? (
          <Button mode="outlined" onPress={closeForm}>
            Back
          </Button>
        ) : null}
      </View>

      {mode === 'index' ? (
        <>
          <Searchbar
            style={styles.searchbar}
            inputStyle={styles.searchbarInput}
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
                <DataTable.Title style={styles.badgeColumn}>Product Type</DataTable.Title>
                <DataTable.Title style={styles.taxColumn}>Tax</DataTable.Title>
                <DataTable.Title style={styles.variantColumn}>Is Variant</DataTable.Title>
                <DataTable.Title style={styles.unitColumn}>Base Unit</DataTable.Title>
                <DataTable.Title style={styles.unitColumn}>Sale Unit</DataTable.Title>
                <DataTable.Title style={styles.unitColumn}>Purchase Unit</DataTable.Title>
                <DataTable.Title style={styles.nameColumn}>Brand</DataTable.Title>
                <DataTable.Title style={styles.nameColumn}>Category</DataTable.Title>
                <DataTable.Title numeric style={styles.numberColumn}>Qty</DataTable.Title>
                <DataTable.Title numeric style={styles.numberColumn}>Base Unit Price</DataTable.Title>
                <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
              </DataTable.Header>

              {products.map((product) => (
                <DataTable.Row key={product.id}>
                  <DataTable.Cell style={styles.imageColumn} onPress={() => openDetailPage(product)}>
                    <ProductThumb uri={product.image_url} />
                  </DataTable.Cell>
                  <DataTable.Cell style={styles.nameColumn} onPress={() => openDetailPage(product)}>{product.name}</DataTable.Cell>
                  <DataTable.Cell style={styles.codeColumn}>{product.code}</DataTable.Cell>
                  <DataTable.Cell style={styles.badgeColumn}><ProductValueBadge label={product.type || 'Unknown'} capitalize /></DataTable.Cell>
                  <DataTable.Cell style={styles.taxColumn}>{productTaxLabel(product.tax)}</DataTable.Cell>
                  <DataTable.Cell style={styles.variantColumn}><VariantBadge value={product.is_variant} /></DataTable.Cell>
                  <DataTable.Cell style={styles.unitColumn}><ProductValueBadge label={productUnitLabel(product.unit)} /></DataTable.Cell>
                  <DataTable.Cell style={styles.unitColumn}><ProductValueBadge label={productUnitLabel(product.sale_unit)} /></DataTable.Cell>
                  <DataTable.Cell style={styles.unitColumn}><ProductValueBadge label={productUnitLabel(product.purchase_unit)} /></DataTable.Cell>
                  <DataTable.Cell style={styles.nameColumn}>{product.brand?.title ?? 'N/A'}</DataTable.Cell>
                  <DataTable.Cell style={styles.nameColumn}>{product.category?.name ?? 'N/A'}</DataTable.Cell>
                  <DataTable.Cell numeric style={styles.numberColumn}>{product.qty ?? 0}</DataTable.Cell>
                  <DataTable.Cell numeric style={styles.numberColumn}>{Number(product.price).toFixed(2)}</DataTable.Cell>
                  <DataTable.Cell style={styles.actionColumn}>
                    <View style={styles.actions}>
                      <Button compact mode="text" onPress={() => openDetailPage(product)}>View</Button>
                      {canEdit ? (
                        <Button compact mode="text" onPress={() => openEditPage(product)}>Edit</Button>
                      ) : null}
                      {canDelete ? (
                        <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(product)}>Delete</Button>
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
        </>
      ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">{mode === 'edit' ? 'Edit Product' : 'Add Product'}</Text>


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
              <SearchableSelectField
                label="Brand"
                valueLabel={selectedBrand?.title ?? 'No brand'}
                placeholder="Search brands"
                search={searchBrands}
                keyFor={(brand) => brand.id}
                labelFor={(brand) => brand.title}
                onSelect={(brand) => {
                  setSelectedBrand(brand.id ? brand : null);
                  updateForm('brandId', brand.id ? brand.id : null);
                }}
              />
      

            <SearchableSelectField
              label="Category *"
              valueLabel={selectedCategory?.name ?? 'Select category'}
              style={styles.fullField}
              placeholder="Search categories"
              search={searchCategories}
              keyFor={(category) => category.id}
              labelFor={(category) => category.name}
              detailFor={(category) => category.parent_category_name ?? category.parent?.name}
              onSelect={(category) => {
                setSelectedCategory(category);
                updateForm('categoryId', category.id);
              }}
            />
            <HelperText type="info" visible={!form.categoryId}>Search and select a category before saving.</HelperText>

          
              <SelectField
                label="Product Base Unit *"
                valueLabel={selectedUnit?.unit_name ?? 'Select product base unit'}
                disabled={!isStandard || unitIdLocked}
                options={options.units}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateBaseUnit(unit.id)}
              />
              <HelperText type="info" visible={unitIdLocked}>Base unit is locked because this product has purchase, sale, or return history.</HelperText>
              <SelectField
                label="Sale Unit"
                valueLabel={form.unitId ? selectedSaleUnit?.unit_name ?? 'Select sale unit' : 'Select base unit first'}
                disabled={salePurchaseDisabled}
                options={salePurchaseUnits}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateForm('saleUnitId', unit.id)}
              />
              <SelectField
                label="Purchase Unit"
                valueLabel={form.unitId ? selectedPurchaseUnit?.unit_name ?? 'Select purchase unit' : 'Select base unit first'}
                disabled={salePurchaseDisabled}
                options={salePurchaseUnits}
                keyFor={(unit) => unit.id}
                labelFor={(unit) => unit.unit_name}
                onSelect={(unit) => updateForm('purchaseUnitId', unit.id)}
              />
       

      
              <TextInput mode="outlined" label="Purchase Cost *" value={form.cost} keyboardType="numeric" disabled={!isStandard} onChangeText={(value) => updateForm('cost', value)} style={styles.formField} />
              <TextInput mode="outlined" label="Base Unit Price *" value={form.price} keyboardType="numeric" onChangeText={(value) => updateForm('price', value)} style={styles.formField} />
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
              {form.isDiffPrice ? (
                <View style={styles.warehousePriceSection}>
                  <Text variant="titleSmall">Warehouse prices</Text>
                  {form.warehousePrices.length ? form.warehousePrices.map((warehousePrice, index) => (
                    <View key={warehousePrice.warehouseId} style={[styles.warehousePriceRow, compactVariantLayout && styles.warehousePriceRowCompact]}>
                      <Text variant="bodyMedium" style={styles.warehousePriceName}>{warehousePrice.warehouseName}</Text>
                      <TextInput
                        dense
                        mode="outlined"
                        label="Base Unit Price"
                        value={warehousePrice.price}
                        keyboardType="numeric"
                        onChangeText={(value) => updateWarehousePrice(index, value)}
                        style={styles.warehousePriceInput}
                      />
                    </View>
                  )) : (
                    <Text variant="bodyMedium" style={styles.emptyWarehousePrices}>No active warehouses found.</Text>
                  )}
                </View>
              ) : null}
              {!form.isVariant ? (
                <SwitchRow label="Batch and expired date" value={form.isBatch} onValueChange={updateBatch} />
              ) : null}
              {!form.isBatch ? (
                <SwitchRow label="Product variant" value={form.isVariant} onValueChange={updateVariantEnabled} />
              ) : null}
              <SwitchRow label="Add Promotional Price" value={form.promotion} onValueChange={updatePromotion} />
              {form.promotion ? (
                <View style={styles.promotionSection}>
                  <TextInput
                    dense
                    mode="outlined"
                    label="Promotional Price"
                    value={form.promotionPrice}
                    keyboardType="numeric"
                    onChangeText={(value) => updateForm('promotionPrice', value)}
                    style={styles.formField}
                  />
                  <DatePickerField
                    label="Promotion Starts"
                    value={form.startingDate}
                    onChange={(value) => updateForm('startingDate', value)}
                    style={styles.formField}
                  />
                  <TextInput
                    dense
                    mode="outlined"
                    label="Promotion Ends"
                    placeholder="YYYY-MM-DD"
                    value={form.lastDate}
                    onChangeText={(value) => updateForm('lastDate', value)}
                    style={styles.formField}
                  />
                </View>
              ) : null}
      
            {form.isVariant ? (
              <View style={styles.variantSection}>
                <View style={styles.variantGroupSection}>
                  <Text variant="titleSmall">Option groups</Text>
                  {form.variantGroups.length ? form.variantGroups.map((group, index) => (
                    <View key={group.id} style={[styles.variantGroupRow, compactVariantLayout && styles.variantGroupRowCompact]}>
                      <TextInput
                        mode="outlined"
                        label="Option"
                        placeholder="Color"
                        value={group.name}
                        onChangeText={(value) => updateVariantGroup(index, 'name', value)}
                        style={styles.variantGroupName}
                      />
                      <TextInput
                        mode="outlined"
                        label="Values"
                        placeholder="Red, Blue"
                        value={group.values}
                        onChangeText={(value) => updateVariantGroup(index, 'values', value)}
                        style={styles.variantGroupValues}
                      />
                      <Button mode="contained" buttonColor="#d64545" onPress={() => removeVariantGroup(index)} style={styles.variantGroupRemove}>X</Button>
                    </View>
                  )) : (
                    <Text variant="bodySmall" style={styles.muted}>Add groups such as Color and Size, then generate sellable variants.</Text>
                  )}
                  <View style={styles.variantGroupActions}>
                    <Button mode="outlined" compact onPress={addVariantGroup}>Add group</Button>
                    <Button mode="contained" compact onPress={generateVariantCombinations}>Generate</Button>
                  </View>
                </View>
                {form.variants.map((variant, index) => (
                  <View key={`${variant.id ?? 'new'}-${index}`} style={[styles.variantRow, compactVariantLayout && styles.variantRowCompact]}>
                    <Text variant="labelMedium" style={[styles.variantDrag, compactVariantLayout && styles.variantDragCompact]}>::</Text>
                    <TextInput mode="outlined" label="Name" value={variant.name} onChangeText={(value) => updateVariant(index, 'name', value)} style={[styles.variantField, compactVariantLayout && styles.variantFieldCompact]} />
                    <TextInput mode="outlined" label="Item Code" value={variant.itemCode} onChangeText={(value) => updateVariant(index, 'itemCode', value)} style={[styles.variantField, compactVariantLayout && styles.variantFieldCompact]} />
                    <TextInput mode="outlined" label="Additional Price" value={variant.additionalPrice} keyboardType="numeric" onChangeText={(value) => updateVariant(index, 'additionalPrice', value)} style={[styles.variantPriceField, compactVariantLayout && styles.variantFieldCompact]} />
                    <Button mode="contained" buttonColor="#d64545" onPress={() => removeVariant(index)} style={[styles.variantRemoveButton, compactVariantLayout && styles.variantRemoveButtonCompact]}>X</Button>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeForm} disabled={saving}>Cancel</Button>
              <Button mode="contained" onPress={saveProduct} loading={saving} disabled={saving || loading}>{mode === 'edit' ? 'Update' : 'Save'}</Button>
            </View>
          </ScrollView>
      )}
    </Screen>
  );
}

function ProductThumb({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={styles.tableImagePlaceholder}>
        <MaterialCommunityIcons name="package-variant-closed" size={20} color="#9ca3af" />
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.tableImage} onError={() => setFailed(true)} />;
}

const productBadgePalette = [
  { backgroundColor: '#e0f2fe', borderColor: '#bae6fd', color: '#0369a1' },
  { backgroundColor: '#f3e8ff', borderColor: '#e9d5ff', color: '#7e22ce' },
  { backgroundColor: '#d1fae5', borderColor: '#a7f3d0', color: '#047857' },
  { backgroundColor: '#fef3c7', borderColor: '#fde68a', color: '#b45309' },
  { backgroundColor: '#ffe4e6', borderColor: '#fecdd3', color: '#be123c' },
  { backgroundColor: '#cffafe', borderColor: '#a5f3fc', color: '#0e7490' },
];

function ProductValueBadge({ label, capitalize = false }: { label: string; capitalize?: boolean }) {
  const tone = label === 'N/A'
    ? { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }
    : productBadgePalette[productBadgeTone(label, productBadgePalette.length)];

  return (
    <View style={[styles.valueBadge, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
      <Text variant="labelSmall" numberOfLines={1} style={[styles.valueBadgeText, { color: tone.color }, capitalize && styles.capitalizeText]}>{label}</Text>
    </View>
  );
}

function VariantBadge({ value }: { value: Product['is_variant'] }) {
  const label = productVariantLabel(value);
  const tone = label === 'Yes'
    ? { backgroundColor: '#d1fae5', borderColor: '#a7f3d0', color: '#047857' }
    : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' };

  return (
    <View style={[styles.valueBadge, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
      <Text variant="labelSmall" style={[styles.valueBadgeText, { color: tone.color }]}>{label}</Text>
    </View>
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

function DatePickerField({ label, value, onChange, style }: { label: string; value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle> }) {
  const [visible, setVisible] = useState(false);
  const selectedDate = parseDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const days = calendarDays(visibleMonth);

  function openPicker() {
    setVisibleMonth(startOfMonth(selectedDate ?? new Date()));
    setVisible(true);
  }

  function selectDate(date: Date) {
    onChange(formatDate(date));
    setVisible(false);
  }

  return (
    <View style={style}>
      <TextInput
        dense
        mode="outlined"
        label={label}
        value={value}
        placeholder="YYYY-MM-DD"
        editable={false}
        right={<TextInput.Icon icon="calendar" onPress={openPicker} />}
        onPressIn={openPicker}
      />
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.datePickerModal}>
          <View style={styles.datePickerHeader}>
            <Button compact mode="text" onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))}>Prev</Button>
            <Text variant="titleMedium">{visibleMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <Button compact mode="text" onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))}>Next</Button>
          </View>
          <View style={styles.datePickerWeekdays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} variant="labelSmall" style={styles.datePickerWeekday}>{day}</Text>
            ))}
          </View>
          <View style={styles.datePickerGrid}>
            {days.map((date) => {
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = selectedDate ? formatDate(date) === formatDate(selectedDate) : false;

              return (
                <Pressable
                  key={date.toISOString()}
                  onPress={() => selectDate(date)}
                  style={[styles.datePickerDay, isSelected && styles.datePickerDaySelected]}
                >
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.datePickerDayText,
                      !isCurrentMonth && styles.datePickerDayMuted,
                      isSelected && styles.datePickerDayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

function mergeWarehousePrices(currentPrices: WarehousePriceForm[], warehouses: Warehouse[]) {
  const currentByWarehouse = new Map(currentPrices.map((warehousePrice) => [warehousePrice.warehouseId, warehousePrice]));

  return warehouses.map((warehouse) => {
    const current = currentByWarehouse.get(warehouse.id);

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      price: current?.price ?? '',
    };
  });
}

function compatibleUnits(units: Unit[], baseUnitId: number | null) {
  if (!baseUnitId) return [];

  const selectedUnit = units.find((unit) => unit.id === baseUnitId);
  const rootUnitId = normalizeId(selectedUnit?.base_unit) ?? baseUnitId;

  return units.filter((unit) => unit.id === rootUnitId || normalizeId(unit.base_unit) === rootUnitId);
}

function variantGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function variantCombinations(groups: VariantOptionGroupForm[]) {
  const valuesByGroup = groups
    .map((group) => splitVariantValues(group.values))
    .filter((values) => values.length);

  if (!valuesByGroup.length) return [];

  return valuesByGroup
    .reduce<string[][]>((combinations, values) => (
      combinations.flatMap((combination) => values.map((value) => [...combination, value]))
    ), [[]])
    .map((combination) => combination.join(' / '));
}

function splitVariantValues(values: string) {
  return Array.from(new Set(values
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)));
}

function normalizeVariantName(name: string) {
  return name.trim().toLowerCase();
}

function variantItemCode(productCode: string, variantName: string) {
  const base = productCode.trim() || generateCode();
  const suffix = variantName
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

  return suffix ? `${base}-${suffix}` : base;
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
  searchModal: {
    maxHeight: '86%',
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  searchModalContent: {
    gap: 12,
    padding: 16,
  },
  searchLoading: {
    paddingVertical: 8,
  },
  searchList: {
    maxHeight: 360,
  },
  searchResultButton: {
    minHeight: 56,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 8,
  },
  searchResultLabel: {
    width: '100%',
    textAlign: 'left',
    lineHeight: 20,
  },
  emptySearch: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#666666',
  },
  table: {
    minWidth: 1500,
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
  badgeColumn: {
    flex: 1.1,
  },
  taxColumn: {
    flex: 1.25,
  },
  variantColumn: {
    flex: 0.9,
  },
  unitColumn: {
    flex: 1.1,
  },
  numberColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 0.8,
    justifyContent: 'center',
  },
  valueBadge: {
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  valueBadgeText: {
    fontWeight: '700',
  },
  capitalizeText: {
    textTransform: 'capitalize',
  },
  tableImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#f2f2f2',
  },
  tableImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#f9fafb',
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
    color: '#666666',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#666666',
  },
  modal: {
    maxHeight: '92%',
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalContent: {
    padding: 18,
    paddingBottom: 28,
    gap: 10,
  },
  fieldLabel: {
    marginBottom: 4,
    color: '#333333',
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
  variantSection: {
    gap: 10,
  },
  variantGroupSection: {
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  variantGroupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  variantGroupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  variantGroupRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  variantGroupName: {
    minWidth: 120,
    flex: 1,
  },
  variantGroupValues: {
    minWidth: 180,
    flex: 2,
  },
  variantGroupRemove: {
    minWidth: 48,
  },
  warehousePriceSection: {
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  warehousePriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  warehousePriceRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  warehousePriceName: {
    flex: 1,
    color: '#444444',
  },
  warehousePriceInput: {
    minWidth: 180,
    flex: 1,
  },
  emptyWarehousePrices: {
    paddingVertical: 8,
    color: '#666666',
  },
  promotionSection: {
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  datePickerModal: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    width: '92%',
    maxWidth: 360,
  },
  datePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  datePickerWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  datePickerWeekday: {
    flex: 1,
    textAlign: 'center',
    color: '#666666',
  },
  datePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  datePickerDay: {
    alignItems: 'center',
    aspectRatio: 1,
    flexBasis: '14.2857%',
    justifyContent: 'center',
    borderRadius: 6,
  },
  datePickerDaySelected: {
    backgroundColor: '#111111',
  },
  datePickerDayText: {
    color: '#222222',
  },
  datePickerDayMuted: {
    color: '#aaaaaa',
  },
  datePickerDayTextSelected: {
    color: '#ffffff',
  },
  variantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f3f3',
  },
  variantRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  variantDrag: {
    width: 18,
    color: '#777777',
    textAlign: 'center',
  },
  variantDragCompact: {
    display: 'none',
  },
  variantField: {
    minWidth: 160,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  variantPriceField: {
    minWidth: 140,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  variantFieldCompact: {
    alignSelf: 'stretch',
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    width: '100%',
  },
  variantRemoveButton: {
    minWidth: 48,
  },
  variantRemoveButtonCompact: {
    alignSelf: 'flex-end',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
