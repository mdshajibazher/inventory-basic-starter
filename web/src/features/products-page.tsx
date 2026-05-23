'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api, type ProductPayload } from '@/lib/api';
import type { Brand, Category, PaginationMeta, Product, Tax, Unit } from '@/lib/types';
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
  isBatch: boolean;
  isVariant: boolean;
  imageFile: File | null;
  removeImage: boolean;
  isActive: boolean;
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
  brands: [],
  categories: [],
  units: [],
  taxes: [],
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

  const canAdd = hasPermission('products-add');
  const canEdit = hasPermission('products-edit');
  const canDelete = hasPermission('products-delete');

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

  function openCreate() {
    setEditing(null);
    setForm(defaultsForOptions({ ...emptyForm, code: generateCode() }, options));
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm(productToForm(product));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
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
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name"><Input value={form.name} onChange={(event) => setValue('name', event.target.value)} /></Field>
            <Field label="Code"><Input value={form.code} onChange={(event) => setValue('code', event.target.value)} /></Field>
            <Field label="Type"><Select value={form.type} onValueChange={(value) => setValue('type', value)} options={options.types.map(option)} /></Field>
            <Field label="Barcode symbology"><Select value={form.barcodeSymbology} onValueChange={(value) => setValue('barcodeSymbology', value)} options={options.barcode_symbologies.map(option)} /></Field>
            <Field label="Brand"><Select value={idValue(form.brandId)} onValueChange={(value) => setValue('brandId', nullableId(value))} options={[{ value: 'none', label: 'No brand' }, ...options.brands.map((brand) => ({ value: String(brand.id), label: brand.title }))]} /></Field>
            <Field label="Category"><Select value={idValue(form.categoryId)} onValueChange={(value) => setValue('categoryId', nullableId(value))} options={[{ value: 'none', label: 'Select category' }, ...options.categories.map((category) => ({ value: String(category.id), label: category.name }))]} /></Field>
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
              ['isDiffPrice', 'Different price'],
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
    isBatch: Boolean(product.is_batch),
    isVariant: Boolean(product.is_variant),
    isActive: Boolean(product.is_active),
  };
}

function defaultsForOptions(form: ProductForm, options: ProductOptions) {
  return {
    ...form,
    type: form.type || options.types[0] || 'standard',
    barcodeSymbology: form.barcodeSymbology || options.barcode_symbologies[0] || 'C128',
    categoryId: form.categoryId ?? options.categories[0]?.id ?? null,
    unitId: form.unitId ?? options.units[0]?.id ?? null,
    saleUnitId: form.saleUnitId ?? options.units[0]?.id ?? null,
    purchaseUnitId: form.purchaseUnitId ?? options.units[0]?.id ?? null,
  };
}

function validateProduct(form: ProductForm) {
  if (!form.name.trim() || !form.code.trim() || !form.categoryId) return { title: 'Missing fields', description: 'Product name, code, and category are required.' };
  if (!form.unitId || !form.saleUnitId || !form.purchaseUnitId) return { title: 'Missing units', description: 'Product, sale, and purchase units are required.' };
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
    is_batch: form.isBatch,
    is_diffPrice: form.isDiffPrice,
    is_active: form.isActive,
    image: form.imageFile,
    remove_image: form.removeImage,
  };
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
