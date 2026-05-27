'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api, type ProductPayload } from '@/lib/api';
import type { Brand, Category, PaginationMeta, Product, Tax, Unit, Warehouse } from '@/lib/types';
import { errorMessage, toNullableNumber, toNumber } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Modal, Select, StatusBadge, Switch, Textarea } from '@/components/ui';
import { EmptyState, PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';

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
  warehousePrices: WarehousePriceForm[];
  isBatch: boolean;
  isVariant: boolean;
  variantInput: string;
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
  warehousePrices: [],
  isBatch: false,
  isVariant: false,
  variantInput: '',
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

export function ProductsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<ProductOptions>(fallbackOptions);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const canAdd = hasPermission('products-add');
  const canEdit = hasPermission('products-edit');
  const canDelete = hasPermission('products-delete');

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
      const [productResponse, optionResponse] = await Promise.all([
        api.products({ page: nextPage, perPage, search: debouncedSearch }),
        api.productOptions(),
      ]);
      const nextOptions = optionResponse.data as ProductOptions;
      setProducts(productResponse.data as Product[]);
      setPagination(productResponse.meta ?? null);
      setOptions({ ...fallbackOptions, ...nextOptions });
      setForm((current) => defaultsForOptions(current, nextOptions));
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (!hasPermission('products-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

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

  function addVariantsFromInput() {
    setForm((current) => {
      const names = current.variantInput
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      if (!names.length) return current;

      return {
        ...current,
        variantInput: '',
        variants: [
          ...current.variants,
          ...names.map((name) => ({
            id: null,
            variantId: null,
            name,
            itemCode: `${name}-${current.code || generateCode()}`,
            additionalPrice: '0',
          })),
        ],
      };
    });
  }

  function removeVariant(index: number) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  }

  function openCreate() {
    setEditing(null);
    setSelectedBrand(null);
    setSelectedCategory(null);
    setForm(defaultsForOptions({ ...emptyForm, code: generateCode() }, options));
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setSelectedBrand(product.brand ?? null);
    setSelectedCategory(product.category ?? null);
    setForm(defaultsForOptions(productToForm(product), options));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setSelectedBrand(null);
    setSelectedCategory(null);
    setForm(emptyForm);
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
      else await api.createProduct(payload);
      closeModal();
      toast.success('Product saved');
      if (editing || page === 1) await load(editing ? page : 1);
      else setPage(1);
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

  return (
    <div>
      <PageHeader title="Products" subtitle={`${products.length} shown from ${pagination?.total ?? products.length}`} canAdd={canAdd} onAdd={openCreate} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search products, code, brand, category" />
      {products.length ? (
        <TableWrap>
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                {['Product', 'Code', 'Brand', 'Category', 'Qty', 'Price', 'Status', 'Action'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.image_url || product.image ? <img src={product.image_url ?? product.image ?? ''} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-neutral-100" />}
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-neutral-500">{product.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{product.code}</td>
                  <td className="px-4 py-3">{product.brand?.title ?? '-'}</td>
                  <td className="px-4 py-3">{product.category?.name ?? '-'}</td>
                  <td className="px-4 py-3">{product.qty ?? product.quantity ?? 0}</td>
                  <td className="px-4 py-3">{product.price}</td>
                  <td className="px-4 py-3"><StatusBadge active={product.is_active} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canEdit ? <Button variant="ghost" onClick={() => openEdit(product)}>Edit</Button> : null}
                    {canDelete ? <Button variant="danger" disabled={saving} onClick={() => void remove(product)}>Delete</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <EmptyState label={loading ? 'Loading...' : 'No products found.'} />
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} />
      <Modal title={`${editing ? 'Edit' : 'Add'} Product`} open={open} onOpenChange={setOpen}>
        <form onSubmit={save} className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name"><Input value={form.name} onChange={(event) => setValue('name', event.target.value)} /></Field>
            <Field label="Code"><Input value={form.code} onChange={(event) => setValue('code', event.target.value)} /></Field>
            <Field label="Type"><Select value={form.type} onValueChange={(value) => setValue('type', value)} options={options.types.map(option)} /></Field>
            <Field label="Barcode symbology"><Select value={form.barcodeSymbology} onValueChange={(value) => setValue('barcodeSymbology', value)} options={options.barcode_symbologies.map(option)} /></Field>
            <SearchableSelect
              label="Brand"
              valueLabel={selectedBrand?.title ?? 'No brand'}
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
              label="Category"
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
            <Field label="Product unit"><Select value={idValue(form.unitId)} onValueChange={(value) => setValue('unitId', nullableId(value))} options={unitOptions(options.units)} /></Field>
            <Field label="Sale unit"><Select value={idValue(form.saleUnitId)} onValueChange={(value) => setValue('saleUnitId', nullableId(value))} options={unitOptions(options.units)} /></Field>
            <Field label="Purchase unit"><Select value={idValue(form.purchaseUnitId)} onValueChange={(value) => setValue('purchaseUnitId', nullableId(value))} options={unitOptions(options.units)} /></Field>
            <Field label="Tax"><Select value={idValue(form.taxId)} onValueChange={(value) => setValue('taxId', nullableId(value))} options={[{ value: 'none', label: 'No tax' }, ...options.taxes.map((tax) => ({ value: String(tax.id), label: `${tax.name} (${tax.rate}%)` }))]} /></Field>
            <Field label="Tax method"><Select value={String(form.taxMethod)} onValueChange={(value) => setValue('taxMethod', Number(value))} options={options.tax_methods.map((item) => ({ value: String(item.id), label: item.name }))} /></Field>
            <Field label="Cost"><Input type="number" step="0.01" value={form.cost} onChange={(event) => setValue('cost', event.target.value)} /></Field>
            <Field label="Price"><Input type="number" step="0.01" value={form.price} onChange={(event) => setValue('price', event.target.value)} /></Field>
            <Field label="Quantity"><Input type="number" step="0.01" value={form.qty} onChange={(event) => setValue('qty', event.target.value)} /></Field>
            <Field label="Alert quantity"><Input type="number" step="0.01" value={form.alertQuantity} onChange={(event) => setValue('alertQuantity', event.target.value)} /></Field>
            <Field label="Promotion price"><Input type="number" step="0.01" value={form.promotionPrice} onChange={(event) => setValue('promotionPrice', event.target.value)} /></Field>
            <Field label="Starting Date"><Input placeholder="YYYY-MM-DD" value={form.startingDate} onChange={(event) => setValue('startingDate', event.target.value)} /></Field>
            <Field label="Last Date"><Input placeholder="YYYY-MM-DD" value={form.lastDate} onChange={(event) => setValue('lastDate', event.target.value)} /></Field>
            <Field label="Image"><Input type="file" accept="image/*" onChange={(event) => setValue('imageFile', event.target.files?.[0] ?? null)} /></Field>
          </div>
          <Field label="Product details"><Textarea value={form.productDetails} onChange={(event) => setValue('productDetails', event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['featured', 'Featured'],
              ['promotion', 'Promotion'],
              ['isDiffPrice', 'Different warehouse price'],
              ['isBatch', 'Batch'],
              ['isVariant', 'Variant'],
              ['removeImage', 'Remove image'],
              ['isActive', 'Active'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                <span className="text-sm font-medium">{label}</span>
                <Switch checked={Boolean(form[key as keyof ProductForm])} onCheckedChange={(checked) => setValue(key as keyof ProductForm, checked as never)} />
              </div>
            ))}
          </div>
          {form.isVariant ? (
            <div className="grid min-w-0 gap-3">
              <Field label="Product variants" hint="Enter one or more variant names separated by commas.">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Input
                    value={form.variantInput}
                    placeholder="Enter variant separated by comma"
                    onChange={(event) => setValue('variantInput', event.target.value)}
                    onBlur={addVariantsFromInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addVariantsFromInput();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" className="shrink-0" onClick={addVariantsFromInput}>Add</Button>
                </div>
              </Field>
              {form.variants.length ? (
                <div className="w-full max-w-full overflow-x-auto rounded-md border border-neutral-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-neutral-50 text-xs font-medium text-neutral-500">
                      <tr>
                        <th className="w-10 px-3 py-2"><GripVertical className="h-4 w-4" /></th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Item Code</th>
                        <th className="px-3 py-2">Additional Price</th>
                        <th className="w-12 px-3 py-2"><Trash2 className="h-4 w-4" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.variants.map((variant, index) => (
                        <tr key={`${variant.id ?? 'new'}-${index}`} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-neutral-400"><GripVertical className="h-4 w-4" /></td>
                          <td className="px-3 py-2">
                            <Input value={variant.name} onChange={(event) => setVariantValue(index, 'name', event.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={variant.itemCode} onChange={(event) => setVariantValue(index, 'itemCode', event.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" step="0.01" value={variant.additionalPrice} onChange={(event) => setVariantValue(index, 'additionalPrice', event.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Button type="button" variant="danger" className="h-9 w-9 px-0" aria-label="Remove variant" onClick={() => removeVariant(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
          {form.isDiffPrice ? (
            <div className="grid min-w-0 gap-3">
              <div className="text-sm font-medium text-neutral-900">Warehouse prices</div>
              {form.warehousePrices.length ? (
                <div className="overflow-hidden rounded-md border border-neutral-200">
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500 sm:grid">
                    <div className="px-3 py-2">Warehouse</div>
                    <div className="px-3 py-2">Price</div>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {form.warehousePrices.map((warehousePrice, index) => (
                      <div key={warehousePrice.warehouseId} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] sm:items-center sm:py-2">
                        <div className="min-w-0 text-sm text-neutral-700">
                          <span className="block text-xs font-medium text-neutral-500 sm:hidden">Warehouse</span>
                          <span className="block truncate">{warehousePrice.warehouseName}</span>
                        </div>
                        <div>
                          <span className="mb-1 block text-xs font-medium text-neutral-500 sm:hidden">Price</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={warehousePrice.price}
                            onChange={(event) => setWarehousePrice(index, event.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-neutral-200 px-3 py-4 text-sm text-neutral-500">No active warehouses found.</div>
              )}
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function productToForm(product: Product): ProductForm {
  return {
    ...emptyForm,
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
    warehousePrices: (product.warehouse_prices ?? []).map((warehousePrice) => ({
      warehouseId: warehousePrice.warehouse_id,
      warehouseName: warehousePrice.warehouse_name ?? `Warehouse ${warehousePrice.warehouse_id}`,
      price: warehousePrice.price == null ? '' : String(warehousePrice.price),
    })),
    isBatch: Boolean(product.is_batch),
    isVariant: Boolean(product.is_variant),
    variantInput: '',
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id,
      variantId: variant.variant_id,
      name: variant.name,
      itemCode: variant.item_code,
      additionalPrice: String(variant.additional_price ?? '0'),
    })),
    isActive: Boolean(product.is_active),
  };
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

  return (
    <Field label={label}>
      <div className="relative">
        <Button type="button" variant="secondary" className="h-10 w-full justify-between overflow-hidden px-3 text-left font-normal" onClick={() => { setQuery(''); setDebouncedQuery(''); setOpen(true); }}>
          <span className="truncate">{valueLabel}</span>
        </Button>
        {open ? (
          <div className="fixed inset-0 z-50 grid place-items-start bg-black/30 p-4 pt-20">
            <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-3 shadow-xl">
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
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function defaultsForOptions(form: ProductForm, options: ProductOptions) {
  return {
    ...form,
    type: form.type || options.types[0] || 'standard',
    barcodeSymbology: form.barcodeSymbology || options.barcode_symbologies[0] || 'C128',
    unitId: form.unitId ?? options.units[0]?.id ?? null,
    saleUnitId: form.saleUnitId ?? options.units[0]?.id ?? null,
    purchaseUnitId: form.purchaseUnitId ?? options.units[0]?.id ?? null,
    warehousePrices: mergeWarehousePrices(form.warehousePrices, options.warehouses),
  };
}

function validateProduct(form: ProductForm) {
  if (!form.name.trim() || !form.code.trim() || !form.categoryId) return { title: 'Missing fields', description: 'Product name, code, and category are required.' };
  if (!form.unitId || !form.saleUnitId || !form.purchaseUnitId) return { title: 'Missing units', description: 'Product, sale, and purchase units are required.' };
  if (form.isVariant && !form.variants.length) return { title: 'Missing variants', description: 'Add at least one product variant.' };
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
    qty: toNullableNumber(form.qty),
    alert_quantity: toNullableNumber(form.alertQuantity),
    tax_id: form.taxId,
    tax_method: form.taxMethod,
    featured: form.featured,
    product_details: form.productDetails.trim() || null,
    promotion: form.promotion,
    promotion_price: toNullableNumber(form.promotionPrice),
    starting_date: form.startingDate.trim() || null,
    last_date: form.lastDate.trim() || null,
    is_variant: form.isVariant,
    variants: form.isVariant
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

function idValue(value: number | null) {
  return value ? String(value) : 'none';
}

function nullableId(value: string) {
  return value === 'none' ? null : Number(value);
}

function option(value: string) {
  return { value, label: value };
}

function unitOptions(units: Unit[]) {
  return [{ value: 'none', label: 'Select unit' }, ...units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))];
}
