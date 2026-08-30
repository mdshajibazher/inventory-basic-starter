'use client';

import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bell, Boxes, Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight, ChevronsUpDown, CircleDollarSign, Copy, Download, Eye, Filter, GripVertical, ImageOff, Package, Pencil, Plus, RotateCcw, Save, Search, Star, Tags, Trash2, Upload, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api, type ProductPayload } from '@/lib/api';
import type { Brand, Category, PaginationMeta, Product, ProductSummary, Tax, Unit, Warehouse } from '@/lib/types';
import { errorMessage, toNullableNumber, toNumber } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActionButton, Button, Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { EmptyState } from '@/components/resource-shell';
import { productBadgeTone, productTaxLabel, productUnitLabel, productVariantLabel } from './product-list-display';
import { VariantRemoveButton } from './variant-remove-button';

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
  imageFile: File | null;
  removeImage: boolean;
  isActive: boolean;
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

type SearchableSelectProps<T> = {
  label: string;
  valueLabel: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  keyFor: (option: T) => string | number;
  labelFor: (option: T) => string;
  detailFor?: (option: T) => string | null | undefined;
  onSelect: (option: T) => void;
};

type ProductOptions = {
  types: string[];
  barcode_symbologies: string[];
  tax_methods: { id: number; name: string }[];
  units: Unit[];
  taxes: Tax[];
  warehouses: Warehouse[];
};

type ProductsPageMode = 'index' | 'create' | 'edit';

const defaultPerPage = 15;
const emptyProductSummary: ProductSummary = { total: 0, active: 0, low_stock: 0, out_of_stock: 0, categories: 0 };

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
  imageFile: null,
  removeImage: false,
  isActive: true,
};

const fallbackOptions: ProductOptions = {
  types: ['standard', 'combo', 'digital'],
  barcode_symbologies: ['C128', 'C39'],
  tax_methods: [
    { id: 1, name: 'Exclusive' },
    { id: 2, name: 'Inclusive' },
  ],
  units: [],
  taxes: [],
  warehouses: [],
};

export function ProductsPage({ mode = 'index', productId }: { mode?: ProductsPageMode; productId?: number }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<ProductOptions>(fallbackOptions);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [summary, setSummary] = useState<ProductSummary>(emptyProductSummary);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [filterBrands, setFilterBrands] = useState<Brand[]>([]);
  const [filterCategories, setFilterCategories] = useState<Category[]>([]);
  const [filterWarehouses, setFilterWarehouses] = useState<Warehouse[]>([]);
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  const canAdd = hasPermission('products-add');
  const canEdit = hasPermission('products-edit');
  const canDelete = hasPermission('products-delete');

  const visibleProducts = products;

  const searchBrands = useCallback(async (query: string) => {
    const response = await api.brands({ page: 1, perPage: 20, search: query, activeOnly: true });
    return [{ id: 0, title: 'No brand' } as Brand, ...(response.data as Brand[])];
  }, []);

  const searchCategories = useCallback(async (query: string) => {
    const response = await api.categories({ page: 1, perPage: 20, search: query, activeOnly: true });
    return response.data as Category[];
  }, []);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const productResponse = await api.products({
        page: nextPage,
        perPage,
        search: debouncedSearch,
        categoryId: categoryFilter === 'all' ? undefined : Number(categoryFilter),
        brandId: brandFilter === 'all' ? undefined : Number(brandFilter),
        status: statusFilter,
        warehouseId: warehouseFilter === 'all' ? undefined : Number(warehouseFilter),
      });
      setProducts(productResponse.data);
      setPagination(productResponse.meta ?? null);
      setSummary(productResponse.summary ?? emptyProductSummary);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [brandFilter, categoryFilter, debouncedSearch, page, perPage, statusFilter, warehouseFilter]);

  useEffect(() => {
    if (mode === 'index' && !hasPermission('products-index')) router.replace('/dashboard');
    if (mode === 'create' && !hasPermission('products-add')) router.replace('/products');
    if (mode === 'edit' && !hasPermission('products-edit')) router.replace('/products');
  }, [hasPermission, mode, router]);

  useEffect(() => {
    if (mode !== 'index') return;
    void load(page);
  }, [load, mode, page]);

  useEffect(() => {
    if (mode !== 'index') return;
    let cancelled = false;
    void Promise.all([
      api.brands({ page: 1, perPage: 100, activeOnly: true }),
      api.categories({ page: 1, perPage: 100, activeOnly: true }),
      api.warehouses({ page: 1, perPage: 100, activeOnly: true }),
    ]).then(([brandResponse, categoryResponse, warehouseResponse]) => {
      if (cancelled) return;
      setFilterBrands(brandResponse.data as Brand[]);
      setFilterCategories(categoryResponse.data as Category[]);
      setFilterWarehouses(warehouseResponse.data as Warehouse[]);
    }).catch((error) => toast.error('Filters failed', { description: errorMessage(error) }));
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (mode === 'index') return;

    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api.productOptions(),
      mode === 'edit' && productId ? api.product(productId) : Promise.resolve(null),
    ])
      .then(([optionResponse, productResponse]) => {
        if (cancelled) return;
        const nextOptions = { ...fallbackOptions, ...(optionResponse.data as ProductOptions) };
        setOptions(nextOptions);

        if (productResponse) {
          const product = productResponse.data as Product;
          const editOptions = {
            ...nextOptions,
            units: mergeProductUnits(nextOptions.units, product),
          };
          setEditing(product);
          setSelectedBrand(product.brand ?? null);
          setSelectedCategory(product.category ?? null);
          setOptions(editOptions);
          setForm(defaultsForOptions(productToForm(product, editOptions), editOptions, { defaultUnits: false }));
        } else {
          resetCreateForm(nextOptions);
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error('Load failed', { description: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, productId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  function setValue<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetCreateForm(nextOptions = options) {
    setEditing(null);
    setSelectedBrand(null);
    setSelectedCategory(null);
    setForm(defaultsForOptions({ ...emptyForm, code: generateCode() }, nextOptions, { defaultUnits: false }));
  }

  function setBaseUnit(unitId: number | null) {
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

  function setBatch(value: boolean) {
    setForm((current) => ({
      ...current,
      isBatch: value,
      isVariant: value ? false : current.isVariant,
      variantGroups: value ? [] : current.variantGroups,
      variants: value ? [] : current.variants,
    }));
  }

  function setVariantEnabled(value: boolean) {
    setForm((current) => ({
      ...current,
      isVariant: value,
      isBatch: value ? false : current.isBatch,
      variantGroups: value ? current.variantGroups : [],
    }));
  }

  function setPromotion(value: boolean) {
    setForm((current) => ({
      ...current,
      promotion: value,
      startingDate: value && !current.startingDate ? todayDate() : current.startingDate,
    }));
  }

  function setVariantValue<K extends keyof ProductVariantForm>(index: number, key: K, value: ProductVariantForm[K]) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, [key]: value } : variant
      )),
    }));
  }

  function setWarehousePrice(index: number, price: string) {
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

  function setVariantGroup<K extends keyof VariantOptionGroupForm>(index: number, key: K, value: VariantOptionGroupForm[K]) {
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

  function openCreate() {
    router.push('/products/create');
  }

  function openEdit(product: Product) {
    router.push(`/products/${product.id}/edit`);
  }

  function resetProductFilters() {
    setBrandFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
    setWarehouseFilter('all');
    setSearch('');
  }

  function exportProducts() {
    const rows = visibleProducts.map((product) => [
      product.name,
      product.code,
      product.brand?.title ?? '',
      product.category?.name ?? '',
      String(product.qty ?? product.quantity ?? 0),
      String(product.price ?? 0),
      productInventoryStatus(product).label,
    ]);
    const csv = [['Product', 'SKU / Code', 'Brand', 'Category', 'Stock Qty', 'Unit Price', 'Status'], ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'products.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function cancelForm() {
    router.push('/products');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const validation = validateProduct(form);
    if (validation) {
      toast.error(validation.title, { description: validation.description });
      return;
    }

    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) await api.updateProduct(editing.id, payload);
      else {
        await api.createProduct(payload);
        resetCreateForm();
      }
      toast.success('Product saved');
      router.replace('/products');
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    setSaving(true);
    try {
      await api.deleteProduct(product.id);
      toast.success('Product deleted');
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const unitIdLocked = mode === 'edit' && Boolean(editing?.unit_id_locked);
  const salePurchaseUnits = compatibleUnits(options.units, form.unitId);
  const salePurchaseDisabled = !form.unitId;

  const productForm = (
    <form onSubmit={save} className="min-w-0 pb-20">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <FormSection icon={Package} title="Basic Information">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Product Name *"><Input value={form.name} placeholder="Enter product name" onChange={(event) => setValue('name', event.target.value)} /></Field>
              <Field label="Product Code *" hint="Unique code for this product"><Input value={form.code} onChange={(event) => setValue('code', event.target.value)} /></Field>
              <Field label="Type"><Select value={form.type} onValueChange={(value) => setValue('type', value)} options={options.types.map(option)} /></Field>
              <Field label="Barcode Symbology"><Select value={form.barcodeSymbology} onValueChange={(value) => setValue('barcodeSymbology', value)} options={options.barcode_symbologies.map(option)} /></Field>
              <SearchableSelect
                label="Brand"
                valueLabel={selectedBrand?.title ?? 'Select brand (optional)'}
                placeholder="Search brands"
                search={searchBrands}
                keyFor={(brand) => brand.id}
                labelFor={(brand) => brand.title}
                onSelect={(brand) => {
                  setSelectedBrand(brand.id ? brand : null);
                  setValue('brandId', brand.id ? brand.id : null);
                }}
              />
              <SearchableSelect
                label="Category *"
                valueLabel={selectedCategory?.name ?? 'Select category'}
                placeholder="Search categories"
                search={searchCategories}
                keyFor={(category) => category.id}
                labelFor={(category) => category.name}
                detailFor={(category) => category.parent_category_name ?? category.parent?.name}
                onSelect={(category) => {
                  setSelectedCategory(category);
                  setValue('categoryId', category.id);
                }}
              />
            </div>
          </FormSection>

          <FormSection icon={CircleDollarSign} title="Unit & Pricing">
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Base Unit *" hint={unitIdLocked ? 'Base unit is locked because this product has purchase, sale, or return history.' : undefined}>
                <Select
                  value={idValue(form.unitId)}
                  onValueChange={(value) => setBaseUnit(nullableId(value))}
                  options={unitOptions(options.units)}
                  disabled={unitIdLocked}
                />
              </Field>
              <Field label="Sales Unit">
                <Select
                  value={idValue(form.saleUnitId)}
                  onValueChange={(value) => setValue('saleUnitId', nullableId(value))}
                  options={unitOptions(salePurchaseUnits, salePurchaseDisabled ? 'Select base unit first' : 'Select sales unit')}
                  disabled={salePurchaseDisabled}
                />
              </Field>
              <Field label="Purchase Unit">
                <Select
                  value={idValue(form.purchaseUnitId)}
                  onValueChange={(value) => setValue('purchaseUnitId', nullableId(value))}
                  options={unitOptions(salePurchaseUnits, salePurchaseDisabled ? 'Select base unit first' : 'Select purchase unit')}
                  disabled={salePurchaseDisabled}
                />
              </Field>
              <Field label="Base Unit Price (৳)"><MoneyInput value={form.price} onChange={(value) => setValue('price', value)} /></Field>
              <Field label="Purchase Cost (৳)"><MoneyInput value={form.cost} onChange={(value) => setValue('cost', value)} /></Field>
              <Field label="Tax"><Select value={idValue(form.taxId)} onValueChange={(value) => setValue('taxId', nullableId(value))} options={[{ value: 'none', label: 'No tax' }, ...options.taxes.map((tax) => ({ value: String(tax.id), label: `${tax.name} (${tax.rate}%)` }))]} /></Field>
              <Field label="Tax Method"><Select value={String(form.taxMethod)} onValueChange={(value) => setValue('taxMethod', Number(value))} options={options.tax_methods.map((item) => ({ value: String(item.id), label: item.name }))} /></Field>
              <Field label="Alert Quantity"><Input type="number" step="0.01" value={form.alertQuantity} placeholder="Enter alert quantity" onChange={(event) => setValue('alertQuantity', event.target.value)} /></Field>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">Alert Quantity</div>
                    <div className="mt-1 text-xs text-emerald-700">Get notified when stock is below this quantity.</div>
                  </div>
                </div>
              </div>
            </div>
          </FormSection>

          {form.isVariant ? (
            <FormSection icon={Tags} title="Variants (Option Groups)" subtitle="Add option groups like Color, Size etc. and their values">
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-3">
                  {form.variantGroups.length ? (
                    form.variantGroups.map((group, index) => (
                      <div key={group.id} className="grid gap-2 sm:grid-cols-[minmax(120px,0.45fr)_minmax(180px,1fr)_auto]">
                        <Field label="Option Group">
                          <Input value={group.name} placeholder="Color" onChange={(event) => setVariantGroup(index, 'name', event.target.value)} />
                        </Field>
                        <Field label="Values (comma separated)">
                          <Input value={group.values} placeholder="Red, Blue, Green" onChange={(event) => setVariantGroup(index, 'values', event.target.value)} />
                        </Field>
                        <Button type="button" variant="danger" className="mt-6 h-10 w-10 px-0" aria-label="Remove option group" title="Remove option group" onClick={() => removeVariantGroup(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">Add groups such as Color and Size, then generate sellable variants.</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" className="h-9 border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50" onClick={addVariantGroup}>
                      <Plus className="h-4 w-4" />
                      Add Option Group
                    </Button>
                    <Button type="button" variant="secondary" className="h-9 px-3" onClick={generateVariantCombinations}>Generate combinations</Button>
                  </div>
                </div>
                <VariantPreview groups={form.variantGroups} count={form.variants.length} />
              </div>
              {form.variants.length ? (
                <div className="mt-4 w-full max-w-full overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th className="w-10 px-3 py-2"><GripVertical className="h-4 w-4" /></th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Item Code</th>
                        <th className="px-3 py-2">Additional Price</th>
                        <th className="w-28 px-3 py-2 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.variants.map((variant, index) => (
                        <tr key={`${variant.id ?? 'new'}-${index}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-400"><GripVertical className="h-4 w-4" /></td>
                          <td className="px-3 py-2"><Input value={variant.name} onChange={(event) => setVariantValue(index, 'name', event.target.value)} /></td>
                          <td className="px-3 py-2"><Input value={variant.itemCode} onChange={(event) => setVariantValue(index, 'itemCode', event.target.value)} /></td>
                          <td className="px-3 py-2"><Input type="number" step="0.01" value={variant.additionalPrice} onChange={(event) => setVariantValue(index, 'additionalPrice', event.target.value)} /></td>
                          <td className="px-3 py-2 text-center">
                            <VariantRemoveButton onRemove={() => removeVariant(index)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </FormSection>
          ) : null}

          {form.isDiffPrice ? (
            <FormSection icon={Building2} title="Warehouse Prices" subtitle="Set base unit price for each warehouse (optional)" action={<span className="text-lg leading-none text-slate-500">...</span>}>
              {form.warehousePrices.length ? (
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 sm:grid">
                    <div className="px-3 py-2">Warehouse</div>
                    <div className="px-3 py-2">Base Unit Price (৳)</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {form.warehousePrices.map((warehousePrice, index) => (
                      <div key={warehousePrice.warehouseId} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] sm:items-center sm:py-2">
                        <div className="min-w-0 text-sm text-slate-700">
                          <span className="block text-xs font-medium text-slate-500 sm:hidden">Warehouse</span>
                          <span className="block truncate">{warehousePrice.warehouseName}</span>
                        </div>
                        <MoneyInput value={warehousePrice.price} onChange={(value) => setWarehousePrice(index, value)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 px-3 py-4 text-sm text-slate-500">No active warehouses found.</div>
              )}
            </FormSection>
          ) : null}

          <FormSection icon={Calendar} title="Promotion" subtitle="Optional promotional pricing window">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Checkbox checked={form.promotion} onCheckedChange={setPromotion} />
              Add Promotional Price
            </label>
            {form.promotion ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Field label="Promotional Price"><MoneyInput value={form.promotionPrice} onChange={(value) => setValue('promotionPrice', value)} /></Field>
                <Field label="Promotion Starts">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input type="date" className="pl-10" value={form.startingDate} onChange={(event) => setValue('startingDate', event.target.value)} />
                  </div>
                </Field>
                <Field label="Promotion Ends">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input type="date" className="pl-10" value={form.lastDate} onChange={(event) => setValue('lastDate', event.target.value)} />
                  </div>
                </Field>
              </div>
            ) : null}
          </FormSection>

          <FormSection icon={Tags} title="Product Details">
            <Field label="Description"><Textarea value={form.productDetails} placeholder="Write product notes, ingredients, warranty or handling instructions" onChange={(event) => setValue('productDetails', event.target.value)} /></Field>
          </FormSection>
        </div>

        <aside className="grid content-start gap-4">
          <FormSection title="Image">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              <Upload className="mx-auto h-6 w-6 text-slate-500" />
              <div className="mt-3 text-sm font-medium text-slate-700">{form.imageFile ? form.imageFile.name : editing?.image_url || editing?.image ? 'Current product image' : 'Upload product image'}</div>
              <div className="mt-1 text-xs text-slate-500">PNG, JPG up to 2MB</div>
            </div>
            <label className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Choose File
              <input className="sr-only" type="file" accept="image/*" onChange={(event) => setValue('imageFile', event.target.files?.[0] ?? null)} />
            </label>
          </FormSection>

          <FormSection icon={Boxes} title="Product Options">
            <div className="grid gap-2">
              <OptionToggle icon={Star} title="Featured Product" description="Show on featured list" checked={form.featured} onCheckedChange={(checked) => setValue('featured', checked)} />
              <OptionToggle icon={Building2} title="Different Warehouse Price" description="Set price per warehouse" checked={form.isDiffPrice} onCheckedChange={(checked) => setValue('isDiffPrice', checked)} />
              <OptionToggle icon={ImageOff} title="Remove Image" description="Hide from invoices" checked={form.removeImage} onCheckedChange={(checked) => setValue('removeImage', checked)} />
              <OptionToggle icon={Package} title="Active" description="Product will be active" checked={form.isActive} onCheckedChange={(checked) => setValue('isActive', checked)} />
              {!form.isVariant ? <OptionToggle icon={Boxes} title="Batch Tracking" description="Track product in batches" checked={form.isBatch} onCheckedChange={setBatch} /> : null}
              {!form.isBatch ? <OptionToggle icon={Tags} title="Variant Product" description="This product has variants" checked={form.isVariant} onCheckedChange={setVariantEnabled} /> : null}
            </div>
          </FormSection>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1600px] justify-end gap-3">
          <Button type="button" variant="secondary" className="min-w-28 border-slate-200" onClick={cancelForm}>Cancel</Button>
          <Button type="submit" className="min-w-36 bg-emerald-600 hover:bg-emerald-700" disabled={saving || loading}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : mode === 'edit' ? 'Update Product' : 'Save Product'}
          </Button>
        </div>
      </div>
    </form>
  );

  if (mode !== 'index') {
    return (
      <div className="min-h-screen bg-slate-50/40">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <Link className="hover:text-slate-900" href="/products">Products</Link>
              <ChevronRight className="h-4 w-4" />
              <span>{mode === 'edit' ? 'Edit Product' : 'Add New Product'}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Package className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{mode === 'edit' ? 'Edit Product' : 'Add New Product'}</h1>
                <p className="mt-1 text-sm text-slate-500">{mode === 'edit' ? 'Update product information and stock settings' : 'Create a new product and configure pricing, stock, and variants'}</p>
              </div>
            </div>
          </div>
          <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50" href="/products">
            <span className="text-lg leading-none">&larr;</span>
            Back
          </Link>
        </div>
        {loading && !editing && mode === 'edit' ? <EmptyState label="Loading product..." /> : productForm}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Package className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Products</h1><p className="mt-1 text-sm text-slate-500">Manage your inventory products and stock in one place.</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" className="border-slate-200 bg-white shadow-sm" onClick={exportProducts} disabled={!visibleProducts.length}><Download className="h-4 w-4" />Export</Button>
          {canAdd ? <Button type="button" className="bg-emerald-600 shadow-sm hover:bg-emerald-700" onClick={openCreate}><Plus className="h-4 w-4" />Add Product</Button> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <ProductMetric icon={Boxes} iconClassName="bg-cyan-50 text-cyan-600" label="Total Products" value={summary.total} caption="Matching products" />
        <ProductMetric icon={CheckCircle2} iconClassName="bg-lime-50 text-lime-600" label="Active" value={summary.active} caption="Currently active products" />
        <ProductMetric icon={AlertTriangle} iconClassName="bg-amber-50 text-amber-500" label="Low Stock" value={summary.low_stock} caption="Products low on stock" />
        <ProductMetric icon={XCircle} iconClassName="bg-red-50 text-red-500" label="Out of Stock" value={summary.out_of_stock} caption="Products out of stock" />
        <ProductMetric icon={Tags} iconClassName="bg-violet-50 text-violet-600" label="Categories" value={summary.categories} caption="Matching categories" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(145px,.8fr))_auto_auto]">
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product name, SKU, barcode..." className="pl-10" /></div>
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1); }} options={[{ value: 'all', label: 'All Categories' }, ...filterCategories.map((category) => ({ value: String(category.id), label: category.name }))]} />
          <Select value={brandFilter} onValueChange={(value) => { setBrandFilter(value); setPage(1); }} options={[{ value: 'all', label: 'All Brands' }, ...filterBrands.map((brand) => ({ value: String(brand.id), label: brand.title }))]} />
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }} options={[{ value: 'all', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'low_stock', label: 'Low Stock' }, { value: 'out_of_stock', label: 'Out of Stock' }, { value: 'inactive', label: 'Inactive' }]} />
          <Select value={warehouseFilter} onValueChange={(value) => { setWarehouseFilter(value); setPage(1); }} options={[{ value: 'all', label: 'All Warehouses' }, ...filterWarehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))]} />
          <Button type="button" variant="secondary" className="border-slate-200 bg-white" onClick={() => setPage(1)}><Filter className="h-4 w-4" />Filters</Button>
          <Button type="button" variant="secondary" className="w-10 px-0" aria-label="Reset filters" title="Reset filters" onClick={resetProductFilters}><RotateCcw className="h-4 w-4" /></Button>
        </div>

        <div className="relative overflow-x-auto" aria-busy={loading}>
          {visibleProducts.length ? (
            <table className="w-full min-w-[1940px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <tr>
                  {['Product', 'SKU / Code', 'Product Type', 'Tax', 'Is Variant', 'Base Unit', 'Sale Unit', 'Purchase Unit', 'Brand', 'Category', 'Stock Qty', 'Unit Price (৳)', 'Status', 'Updated'].map((header) => <th key={header} className="whitespace-nowrap px-5 py-3"><span className="inline-flex items-center gap-1">{header}<ChevronsUpDown className="h-3 w-3 text-slate-300" /></span></th>)}
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProducts.map((product) => {
                  const status = productInventoryStatus(product);
                  return (
                    <tr key={product.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-2.5"><Link href={`/products/${product.id}`} className="flex min-w-48 items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"><ProductThumb src={product.image_url ?? product.image} alt={product.name} /><div className="min-w-0 truncate font-semibold text-slate-900 hover:text-emerald-700">{product.name}</div></Link></td>
                      <td className="px-5 py-2.5 font-medium text-slate-700">{product.code}</td>
                      <td className="px-5 py-2.5"><ProductValueBadge label={product.type || 'Unknown'} capitalize /></td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{productTaxLabel(product.tax)}</td>
                      <td className="px-5 py-2.5"><VariantBadge value={product.is_variant} /></td>
                      <td className="px-5 py-2.5"><ProductValueBadge label={productUnitLabel(product.unit)} /></td>
                      <td className="px-5 py-2.5"><ProductValueBadge label={productUnitLabel(product.sale_unit)} /></td>
                      <td className="px-5 py-2.5"><ProductValueBadge label={productUnitLabel(product.purchase_unit)} /></td>
                      <td className="px-5 py-2.5 text-slate-600">{product.brand?.title ?? '-'}</td>
                      <td className="px-5 py-2.5 text-slate-600">{product.category?.name ?? '-'}</td>
                      <td className="px-5 py-2.5 font-semibold text-slate-800">{formatProductNumber(product.qty ?? product.quantity ?? 0)}</td>
                      <td className="px-5 py-2.5 font-medium text-slate-700">{formatProductMoney(product.price)}</td>
                      <td className="px-5 py-2.5"><span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{relativeProductDate(product.updated_at)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5"><div className="flex items-center justify-end gap-1.5">
                        <ActionButton icon={Eye} text="View product" color="text-blue-500 hover:text-blue-600" bgColor="bg-blue-50 hover:border-blue-100 hover:bg-blue-100" href={`/products/${product.id}`} />
                        {canEdit ? <ActionButton icon={Pencil} text="Edit product" color="text-amber-600 hover:text-amber-700" bgColor="bg-amber-50 hover:border-amber-100 hover:bg-amber-100" onClick={() => openEdit(product)} /> : null}
                        <ActionButton icon={Copy} text="Copy product code" color="text-cyan-600 hover:text-cyan-700" bgColor="bg-cyan-50 hover:border-cyan-100 hover:bg-cyan-100" onClick={() => { void navigator.clipboard.writeText(product.code); toast.success('Product code copied'); }} />
                        {canDelete ? <ActionButton icon={Trash2} text="Delete product" color="text-red-500 hover:text-red-600" bgColor="bg-red-50 hover:border-red-100 hover:bg-red-100" disabled={saving} onClick={() => void remove(product)} /> : null}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="p-5"><EmptyState label={loading ? 'Loading products...' : 'No products match these filters.'} /></div>}
          {loading ? <div className="absolute inset-0 z-10 grid min-h-32 place-items-center bg-white/75"><span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" /></div> : null}
        </div>
        <ProductsTablePagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} shown={visibleProducts.length} />
      </section>
    </div>
  );
}

const productBadgeClasses = [
  'border-sky-200 bg-sky-50 text-sky-700',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-cyan-200 bg-cyan-50 text-cyan-700',
];

function ProductValueBadge({ label, capitalize = false }: { label: string; capitalize?: boolean }) {
  const className = label === 'N/A'
    ? 'border-slate-200 bg-slate-50 text-slate-500'
    : productBadgeClasses[productBadgeTone(label, productBadgeClasses.length)];

  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${capitalize ? 'capitalize ' : ''}${className}`}>{label}</span>;
}

function VariantBadge({ value }: { value: Product['is_variant'] }) {
  const label = productVariantLabel(value);
  const className = label === 'Yes'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';

  return <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function ProductMetric({
  icon: Icon,
  iconClassName,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${iconClassName}`}><Icon className="h-6 w-6" /></div>
        <div className="min-w-0"><div className="text-xs font-medium text-slate-600">{label}</div><div className="mt-1 text-2xl font-bold text-slate-950">{formatProductNumber(value)}</div><div className="mt-1 truncate text-xs text-slate-500">{caption}</div></div>
      </div>
    </div>
  );
}

function ProductsTablePagination({
  meta,
  loading,
  shown,
  onPage,
  onPerPageChange,
}: {
  meta: PaginationMeta | null;
  loading: boolean;
  shown: number;
  onPage: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}) {
  if (!meta) return null;
  const pages = productPaginationPages(meta.current_page, meta.last_page);
  const firstShown = shown ? meta.from ?? 1 : 0;
  const lastShown = shown ? firstShown + shown - 1 : 0;

  return (
    <div className="grid gap-4 border-t border-slate-200 px-5 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <p className="text-sm text-slate-500">Showing <span className="font-medium text-slate-700">{firstShown}</span> to <span className="font-medium text-slate-700">{lastShown}</span> of <span className="font-medium text-slate-700">{formatProductNumber(meta.total)}</span> products</p>
      <div className="flex items-center justify-center gap-1" aria-label="Pagination">
        <Button type="button" variant="ghost" className="h-8 w-8 px-0 text-slate-400" aria-label="Previous page" disabled={loading || meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        {pages.map((item, index) => item === null ? <span key={`ellipsis-${index}`} className="grid h-8 w-8 place-items-center text-sm text-slate-400">...</span> : (
          <Button key={item} type="button" variant="ghost" className={`h-8 w-8 px-0 ${item === meta.current_page ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'text-slate-600'}`} aria-current={item === meta.current_page ? 'page' : undefined} disabled={loading} onClick={() => onPage(item)}>{item}</Button>
        ))}
        <Button type="button" variant="ghost" className="h-8 w-8 px-0 text-slate-400" aria-label="Next page" disabled={loading || meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="sm:justify-self-end"><Select value={String(meta.per_page)} onValueChange={(value) => onPerPageChange(Number(value))} disabled={loading} options={[10, 15, 20, 50, 100].map((value) => ({ value: String(value), label: `${value} / page` }))} /></div>
    </div>
  );
}

function productPaginationPages(currentPage: number, lastPage: number): Array<number | null> {
  if (lastPage <= 5) return Array.from({ length: lastPage }, (_, index) => index + 1);
  const values = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, lastPage])].filter((value) => value > 0 && value <= lastPage).sort((a, b) => a - b);
  return values.flatMap((value, index) => index > 0 && value - values[index - 1] > 1 ? [null, value] : [value]);
}

function productInventoryStatus(product: Product) {
  if (!(product.is_active === true || String(product.is_active) === '1')) return { key: 'inactive', label: 'Inactive', className: 'border-slate-200 bg-slate-100 text-slate-600' };
  const quantity = Number(product.qty ?? product.quantity) || 0;
  if (quantity <= 0) return { key: 'out_of_stock', label: 'Out of Stock', className: 'border-red-200 bg-red-50 text-red-600' };
  const alertQuantity = Number(product.alert_quantity ?? product.low_stock_limit) || 0;
  if (alertQuantity > 0 && quantity <= alertQuantity) return { key: 'low_stock', label: 'Low Stock', className: 'border-amber-200 bg-amber-50 text-amber-600' };
  return { key: 'active', label: 'Active', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

function formatProductNumber(value: number | string) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatProductMoney(value: number | string) {
  return `৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

function relativeProductDate(value?: string | null) {
  if (!value) return '-';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '-';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp));
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function FormSection({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-200 bg-white focus-within:border-black">
      <div className="flex h-10 w-11 shrink-0 items-center justify-center border-r border-neutral-200 bg-slate-50 text-sm font-medium text-slate-600">৳</div>
      <Input
        type="number"
        step="0.01"
        value={value}
        className="border-0 focus:border-0"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function OptionToggle({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-1 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function VariantPreview({ groups, count }: { groups: VariantOptionGroupForm[]; count: number }) {
  const combinations = variantCombinations(groups).slice(0, 9);
  const colors = ['bg-red-50 text-red-700', 'bg-blue-50 text-blue-700', 'bg-emerald-50 text-emerald-700'];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="text-sm font-semibold text-emerald-700">Variant Preview</div>
      <div className="mt-2 text-xs text-slate-500">This will create {count || variantCombinations(groups).length} variants</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {combinations.length ? combinations.map((name, index) => (
          <span key={name} className={`rounded-md px-2.5 py-1 text-xs font-medium ${colors[index % colors.length]}`}>{name}</span>
        )) : <span className="text-xs text-slate-500">Add option values to preview variants.</span>}
        {variantCombinations(groups).length > combinations.length ? <span className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500">...</span> : null}
      </div>
    </div>
  );
}

function ProductThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-400">
        <Package className="h-5 w-5" />
      </div>
    );
  }

  return <img src={src} alt={alt} className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover" onError={() => setFailed(true)} />;
}

function productToForm(product: Product, options?: ProductOptions): ProductForm {
  return {
    ...emptyForm,
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
    isActive: Boolean(product.is_active),
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

function SearchableSelect<T>({ label, valueLabel, placeholder, search, keyFor, labelFor, detailFor, onSelect }: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void search(debouncedQuery)
      .then((nextOptions) => {
        if (!cancelled) setOptions(nextOptions);
      })
      .catch((error) => {
        if (!cancelled) toast.error('Search failed', { description: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, search]);

  function openSearch() {
    setQuery('');
    setDebouncedQuery('');
    setOpen(true);
  }

  return (
    <Field label={label}>
      <div className="relative">
        <Button type="button" variant="secondary" className="h-10 w-full justify-between overflow-hidden px-3 text-left font-normal" onClick={openSearch}>
          <span className="truncate">{valueLabel}</span>
        </Button>
        {open ? createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
            <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium">{label}</div>
                <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setOpen(false)}>Close</Button>
              </div>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus />
              <div className="mt-2 max-h-80 overflow-y-auto">
                {loading ? <div className="px-3 py-4 text-sm text-neutral-500">Searching...</div> : null}
                {!loading && !options.length ? <div className="px-3 py-4 text-sm text-neutral-500">No matches found.</div> : null}
                {options.map((option) => {
                  const detail = detailFor?.(option);
                  return (
                    <button key={keyFor(option)} type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100" onClick={() => { onSelect(option); setOpen(false); }}>
                      <span className="block font-medium">{labelFor(option)}</span>
                      {detail ? <span className="block text-xs text-neutral-500">{detail}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        ) : null}
      </div>
    </Field>
  );
}

function defaultsForOptions(
  form: ProductForm,
  options: ProductOptions,
  { defaultUnits = true }: { defaultUnits?: boolean } = {}
) {
  const unitId = form.unitId ?? (defaultUnits ? options.units[0]?.id ?? null : null);
  const unitFamily = compatibleUnits(options.units, unitId);

  return {
    ...form,
    type: form.type || options.types[0] || 'standard',
    barcodeSymbology: form.barcodeSymbology || options.barcode_symbologies[0] || 'C128',
    unitId,
    saleUnitId: unitFamily.some((unit) => unit.id === form.saleUnitId) ? form.saleUnitId : null,
    purchaseUnitId: unitFamily.some((unit) => unit.id === form.purchaseUnitId) ? form.purchaseUnitId : null,
    warehousePrices: mergeWarehousePrices(form.warehousePrices, options.warehouses),
  };
}

function validateProduct(form: ProductForm) {
  if (!form.name.trim() || !form.code.trim() || !form.categoryId) return { title: 'Missing fields', description: 'Product name, code, and category are required.' };
  if (!form.unitId || !form.saleUnitId || !form.purchaseUnitId) return { title: 'Missing units', description: 'Product, sale, and purchase units are required.' };
  if (form.isVariant && !form.variants.length) return { title: 'Missing variants', description: 'Generate at least one variant combination before saving.' };
  if (form.isVariant && form.variants.some((variant) => !variant.name.trim() || !variant.itemCode.trim())) {
    return { title: 'Invalid variants', description: 'Each variant needs a name and item code.' };
  }
  return null;
}

function toPayload(form: ProductForm): ProductPayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    type: form.type,
    barcode_symbology: form.barcodeSymbology,
    brand_id: form.brandId,
    category_id: form.categoryId as number,
    unit_id: form.unitId,
    sale_unit_id: form.saleUnitId,
    purchase_unit_id: form.purchaseUnitId,
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
    is_batch: form.isBatch,
    is_diffPrice: form.isDiffPrice,
    warehouse_prices: form.warehousePrices.map((warehousePrice) => ({
      warehouse_id: warehousePrice.warehouseId,
      price: toNullableNumber(warehousePrice.price),
    })),
    is_active: form.isActive,
    image: form.imageFile,
    remove_image: form.removeImage,
  };
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

function generateCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function idValue(value: number | null) {
  return value ? String(value) : 'none';
}

function nullableId(value: string) {
  return value === 'none' ? null : Number(value);
}

function option(value: string) {
  return { value, label: value };
}

function unitOptions(units: Unit[], placeholder = 'Select unit') {
  return [{ value: 'none', label: placeholder }, ...units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))];
}

function compatibleUnits(units: Unit[], baseUnitId: number | null) {
  if (!baseUnitId) return [];

  const selectedUnit = units.find((unit) => unit.id === baseUnitId);
  const rootUnitId = normalizeId(selectedUnit?.base_unit) ?? baseUnitId;

  return units.filter((unit) => unit.id === rootUnitId || normalizeId(unit.base_unit) === rootUnitId);
}
