import { tokenStorage } from './storage';
import type { PaginatedResponse } from './types';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export type UploadImage = File;

export type ProductPayload = {
  name: string;
  code: string;
  type: string;
  barcode_symbology: string;
  brand_id?: number | null;
  category_id: number;
  unit_id?: number | null;
  purchase_unit_id?: number | null;
  sale_unit_id?: number | null;
  cost: number;
  price: number;
  qty?: number | null;
  alert_quantity?: number | null;
  tax_id?: number | null;
  tax_method?: number | null;
  featured?: boolean;
  product_details?: string | null;
  promotion?: boolean;
  promotion_price?: number | null;
  starting_date?: string | null;
  last_date?: string | null;
  is_variant?: boolean;
  variants?: ProductVariantPayload[];
  is_batch?: boolean;
  is_diffPrice?: boolean;
  warehouse_prices?: ProductWarehousePricePayload[];
  is_active?: boolean;
  image?: UploadImage | null;
  remove_image?: boolean;
};

export type ProductWarehousePricePayload = {
  warehouse_id: number;
  price?: number | null;
};

export type ProductVariantPayload = {
  id?: number | null;
  variant_id?: number | null;
  name: string;
  item_code: string;
  additional_price: number;
};

type BrandPayload = {
  title: string;
  image?: UploadImage | null;
  remove_image?: boolean;
  is_active?: boolean;
};

type CategoryPayload = {
  name: string;
  image?: UploadImage | null;
  remove_image?: boolean;
  parent_id?: number | null;
  is_active?: boolean;
};

type BranchPayload = {
  name: string;
  image?: UploadImage | null;
  remove_image?: boolean;
  company_name: string;
  vat_number?: string | null;
  email: string;
  phone_number: string;
  address: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active?: boolean;
};

type SupplierPayload = BranchPayload;

type UnitPayload = {
  unit_code: string;
  unit_name: string;
  base_unit?: number | null;
  operator?: string | null;
  operation_value?: number | null;
  is_active?: boolean;
};

type TaxPayload = {
  name: string;
  rate: number;
  is_active?: boolean;
};

type CurrencyPayload = {
  name: string;
  code: string;
  exchange_rate: number;
};

type WarehousePayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address: string;
  is_active?: boolean;
};

export type CustomerPayload = {
  customer_group_id: number;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone_number: string;
  tax_no?: string | null;
  address: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active?: boolean;
  create_user?: boolean;
  username?: string | null;
  password?: string | null;
};

export type SalesInvoiceLinePayload = {
  product_id: number;
  product_code?: string | null;
  product_batch_id?: number | null;
  qty: number;
  sale_unit?: number | string | null;
  net_unit_price: number;
  discount: number;
  tax_rate?: number | null;
  tax: number;
  subtotal: number;
};

export type SalesInvoicePayload = {
  reference_no: string;
  customer_id: number;
  warehouse_id: number;
  biller_id: number;
  sale_status: number;
  payment_status: number;
  lines: SalesInvoiceLinePayload[];
  order_tax_rate?: number;
  order_discount?: number;
  coupon_id?: number | null;
  coupon_discount?: number;
  coupon_active?: boolean;
  shipping_cost?: number;
  paid_by_id?: number | null;
  paying_amount?: number;
  paid_amount?: number;
  payment_note?: string | null;
  sale_note?: string | null;
  staff_note?: string | null;
  document?: UploadImage | null;
};

export type PurchaseInvoiceLinePayload = {
  product_id: number;
  product_code?: string | null;
  qty: number;
  received: number;
  batch_no?: string | null;
  expired_date?: string | null;
  purchase_unit?: number | string | null;
  net_unit_cost: number;
  discount: number;
  tax_rate: number;
  tax: number;
  subtotal: number;
};

export type PurchaseInvoicePayload = {
  reference_no: string;
  supplier_id: number;
  warehouse_id: number;
  status: number;
  purchase_status_id?: number;
  payment_status: number;
  lines: PurchaseInvoiceLinePayload[];
  order_tax_rate?: number;
  order_discount?: number;
  shipping_cost?: number;
  paid_by_id?: number | null;
  paying_amount?: number;
  paid_amount?: number;
  payment_note?: string | null;
  note?: string | null;
  document?: UploadImage | null;
};

type RolePayload = {
  name: string;
  description?: string | null;
  is_active?: boolean;
  permissions?: string[];
};

type UserPayload = {
  name: string;
  email: string;
  phone: string;
  password?: string;
  is_active?: boolean;
};

function isFormData(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function appendBoolean(formData: FormData, key: string, value?: boolean) {
  if (value !== undefined) formData.append(key, value ? '1' : '0');
}

function appendNullableNumber(formData: FormData, key: string, value?: number | null) {
  formData.append(key, value === null || value === undefined ? '' : String(value));
}

function appendNullableString(formData: FormData, key: string, value?: string | null) {
  formData.append(key, value === null || value === undefined ? '' : value);
}

function appendImage(formData: FormData, key: string, image?: UploadImage | null) {
  if (image) formData.append(key, image);
}

function brandFormData(payload: BrandPayload) {
  const formData = new FormData();
  formData.append('title', payload.title);
  appendImage(formData, 'image', payload.image);
  appendBoolean(formData, 'remove_image', payload.remove_image);
  appendBoolean(formData, 'is_active', payload.is_active);
  return formData;
}

function categoryFormData(payload: CategoryPayload) {
  const formData = new FormData();
  formData.append('name', payload.name);
  appendImage(formData, 'image', payload.image);
  appendBoolean(formData, 'remove_image', payload.remove_image);
  appendNullableNumber(formData, 'parent_id', payload.parent_id);
  appendBoolean(formData, 'is_active', payload.is_active);
  return formData;
}

function branchFormData(payload: BranchPayload) {
  const formData = new FormData();
  formData.append('name', payload.name);
  appendImage(formData, 'image', payload.image);
  appendBoolean(formData, 'remove_image', payload.remove_image);
  formData.append('company_name', payload.company_name);
  appendNullableString(formData, 'vat_number', payload.vat_number);
  formData.append('email', payload.email);
  formData.append('phone_number', payload.phone_number);
  formData.append('address', payload.address);
  formData.append('city', payload.city);
  appendNullableString(formData, 'state', payload.state);
  appendNullableString(formData, 'postal_code', payload.postal_code);
  appendNullableString(formData, 'country', payload.country);
  appendBoolean(formData, 'is_active', payload.is_active);
  return formData;
}

function supplierFormData(payload: SupplierPayload) {
  return branchFormData(payload);
}

function productFormData(payload: ProductPayload) {
  const formData = new FormData();
  formData.append('name', payload.name);
  formData.append('code', payload.code);
  formData.append('type', payload.type);
  formData.append('barcode_symbology', payload.barcode_symbology);
  appendNullableNumber(formData, 'brand_id', payload.brand_id);
  formData.append('category_id', String(payload.category_id));
  appendNullableNumber(formData, 'unit_id', payload.unit_id);
  appendNullableNumber(formData, 'purchase_unit_id', payload.purchase_unit_id);
  appendNullableNumber(formData, 'sale_unit_id', payload.sale_unit_id);
  formData.append('cost', String(payload.cost));
  formData.append('price', String(payload.price));
  appendNullableNumber(formData, 'qty', payload.qty);
  appendNullableNumber(formData, 'alert_quantity', payload.alert_quantity);
  appendNullableNumber(formData, 'tax_id', payload.tax_id);
  appendNullableNumber(formData, 'tax_method', payload.tax_method);
  appendBoolean(formData, 'featured', payload.featured);
  appendNullableString(formData, 'product_details', payload.product_details);
  appendBoolean(formData, 'promotion', payload.promotion);
  appendNullableNumber(formData, 'promotion_price', payload.promotion_price);
  appendNullableString(formData, 'starting_date', payload.starting_date);
  appendNullableString(formData, 'last_date', payload.last_date);
  appendBoolean(formData, 'is_variant', payload.is_variant);
  payload.variants?.forEach((variant, index) => {
    appendNullableNumber(formData, `product_variant_id[${index}]`, variant.id);
    appendNullableNumber(formData, `variant_id[${index}]`, variant.variant_id);
    formData.append(`variant_name[${index}]`, variant.name);
    formData.append(`item_code[${index}]`, variant.item_code);
    formData.append(`additional_price[${index}]`, String(variant.additional_price));
  });
  appendBoolean(formData, 'is_batch', payload.is_batch);
  appendBoolean(formData, 'is_diffPrice', payload.is_diffPrice);
  payload.warehouse_prices?.forEach((warehousePrice, index) => {
    formData.append(`warehouse_id[${index}]`, String(warehousePrice.warehouse_id));
    appendNullableNumber(formData, `diff_price[${index}]`, warehousePrice.price);
  });
  appendBoolean(formData, 'is_active', payload.is_active);
  appendBoolean(formData, 'remove_image', payload.remove_image);
  appendImage(formData, 'image', payload.image);
  return formData;
}

function appendNumberArray(formData: FormData, key: string, values: number[]) {
  values.forEach((value, index) => {
    formData.append(`${key}[${index}]`, String(value));
  });
}

function appendNullableNumberArray(formData: FormData, key: string, values: (number | null | undefined)[]) {
  values.forEach((value, index) => {
    formData.append(`${key}[${index}]`, value === null || value === undefined ? '' : String(value));
  });
}

function appendNullableStringArray(formData: FormData, key: string, values: (string | number | null | undefined)[]) {
  values.forEach((value, index) => {
    formData.append(`${key}[${index}]`, value === null || value === undefined ? '' : String(value));
  });
}

function salesInvoiceFormData(payload: SalesInvoicePayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  formData.append('customer_id', String(payload.customer_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  formData.append('biller_id', String(payload.biller_id));
  formData.append('sale_status', String(payload.sale_status));
  formData.append('payment_status', String(payload.payment_status));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNullableNumberArray(formData, 'product_batch_id', payload.lines.map((line) => line.product_batch_id));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNullableStringArray(formData, 'sale_unit', payload.lines.map((line) => line.sale_unit));
  appendNumberArray(formData, 'net_unit_price', payload.lines.map((line) => line.net_unit_price));
  appendNumberArray(formData, 'discount', payload.lines.map((line) => line.discount));
  appendNullableNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate));
  appendNumberArray(formData, 'tax', payload.lines.map((line) => line.tax));
  appendNumberArray(formData, 'subtotal', payload.lines.map((line) => line.subtotal));
  appendNullableNumber(formData, 'order_tax_rate', payload.order_tax_rate ?? 0);
  appendNullableNumber(formData, 'order_discount', payload.order_discount ?? 0);
  appendNullableNumber(formData, 'coupon_id', payload.coupon_id);
  appendNullableNumber(formData, 'coupon_discount', payload.coupon_discount ?? 0);
  appendBoolean(formData, 'coupon_active', payload.coupon_active ?? false);
  appendNullableNumber(formData, 'shipping_cost', payload.shipping_cost ?? 0);
  appendNullableNumber(formData, 'paid_by_id', payload.paid_by_id);
  appendNullableNumber(formData, 'paying_amount', payload.paying_amount ?? payload.paid_amount ?? 0);
  appendNullableNumber(formData, 'paid_amount', payload.paid_amount ?? 0);
  appendNullableString(formData, 'payment_note', payload.payment_note);
  appendNullableString(formData, 'sale_note', payload.sale_note);
  appendNullableString(formData, 'staff_note', payload.staff_note);
  appendImage(formData, 'document', payload.document);
  return formData;
}

function purchaseInvoiceFormData(payload: PurchaseInvoicePayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  formData.append('supplier_id', String(payload.supplier_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  formData.append('status', String(payload.status));
  formData.append('purchase_status_id', String(payload.purchase_status_id ?? payload.status));
  formData.append('payment_status', String(payload.payment_status));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNumberArray(formData, 'received', payload.lines.map((line) => line.received));
  appendNullableStringArray(formData, 'batch_no', payload.lines.map((line) => line.batch_no));
  appendNullableStringArray(formData, 'expired_date', payload.lines.map((line) => line.expired_date));
  appendNullableStringArray(formData, 'purchase_unit', payload.lines.map((line) => line.purchase_unit));
  appendNumberArray(formData, 'net_unit_cost', payload.lines.map((line) => line.net_unit_cost));
  appendNumberArray(formData, 'discount', payload.lines.map((line) => line.discount));
  appendNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate));
  appendNumberArray(formData, 'tax', payload.lines.map((line) => line.tax));
  appendNumberArray(formData, 'subtotal', payload.lines.map((line) => line.subtotal));
  appendNullableNumber(formData, 'order_tax_rate', payload.order_tax_rate ?? 0);
  appendNullableNumber(formData, 'order_discount', payload.order_discount ?? 0);
  appendNullableNumber(formData, 'shipping_cost', payload.shipping_cost ?? 0);
  appendNullableNumber(formData, 'paid_by_id', payload.paid_by_id);
  appendNullableNumber(formData, 'paying_amount', payload.paying_amount ?? payload.paid_amount ?? 0);
  appendNullableNumber(formData, 'paid_amount', payload.paid_amount ?? 0);
  appendNullableString(formData, 'payment_note', payload.payment_note);
  appendNullableString(formData, 'note', payload.note);
  appendImage(formData, 'document', payload.document);
  return formData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : tokenStorage.get();
  const multipart = isFormData(options.body);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`Could not reach the API at ${API_URL}. Set NEXT_PUBLIC_API_URL if Laravel runs elsewhere.`);
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const validationMessage =
      body?.errors && typeof body.errors === 'object'
        ? Object.values(body.errors).flat().join('\n')
        : null;
    throw new Error(validationMessage || body?.message || `Request failed: ${response.status}`);
  }

  return body as T;
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
}

const putForm = (formData: FormData) => {
  formData.append('_method', 'PUT');
  return formData;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ data: { token: string; user: unknown } }>('/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ data: unknown }>('/me'),
  logout: () => request<{ message: string }>('/logout', { method: 'POST' }),
  dashboard: () => request<{ data: unknown }>('/dashboard'),
  users: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/users${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  userOptions: () => request<{ data: unknown }>('/users/options'),
  createUser: (payload: UserPayload) => request<{ data: unknown }>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: number, payload: UserPayload) => request<{ data: unknown }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateUserRoles: (id: number, payload: { roles: number[] }) => request<{ data: unknown }>(`/users/${id}/roles`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateUserPermissions: (id: number, payload: { permissions: string[] }) => request<{ data: unknown }>(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id: number) => request<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
  roles: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/roles${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  permissions: () => request<{ data: unknown[] }>('/roles/permissions'),
  createRole: (payload: RolePayload) => request<{ data: unknown }>('/roles', { method: 'POST', body: JSON.stringify(payload) }),
  updateRole: (id: number, payload: RolePayload) => request<{ data: unknown }>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRole: (id: number) => request<{ message: string }>(`/roles/${id}`, { method: 'DELETE' }),
  brands: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/brands${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createBrand: (payload: BrandPayload) => request<{ data: unknown }>('/brands', { method: 'POST', body: brandFormData(payload) }),
  updateBrand: (id: number, payload: BrandPayload) => request<{ data: unknown }>(`/brands/${id}`, { method: 'POST', body: putForm(brandFormData(payload)) }),
  deleteBrand: (id: number) => request<{ message: string }>(`/brands/${id}`, { method: 'DELETE' }),
  branches: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/branches${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createBranch: (payload: BranchPayload) => request<{ data: unknown }>('/branches', { method: 'POST', body: branchFormData(payload) }),
  updateBranch: (id: number, payload: BranchPayload) => request<{ data: unknown }>(`/branches/${id}`, { method: 'POST', body: putForm(branchFormData(payload)) }),
  deleteBranch: (id: number) => request<{ message: string }>(`/branches/${id}`, { method: 'DELETE' }),
  suppliers: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/suppliers${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createSupplier: (payload: SupplierPayload) => request<{ data: unknown }>('/suppliers', { method: 'POST', body: supplierFormData(payload) }),
  updateSupplier: (id: number, payload: SupplierPayload) => request<{ data: unknown }>(`/suppliers/${id}`, { method: 'POST', body: putForm(supplierFormData(payload)) }),
  deleteSupplier: (id: number) => request<{ message: string }>(`/suppliers/${id}`, { method: 'DELETE' }),
  categories: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/categories${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createCategory: (payload: CategoryPayload) => request<{ data: unknown }>('/categories', { method: 'POST', body: categoryFormData(payload) }),
  updateCategory: (id: number, payload: CategoryPayload) => request<{ data: unknown }>(`/categories/${id}`, { method: 'POST', body: putForm(categoryFormData(payload)) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),
  units: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/units${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  createUnit: (payload: UnitPayload) => request<{ data: unknown }>('/units', { method: 'POST', body: JSON.stringify(payload) }),
  updateUnit: (id: number, payload: UnitPayload) => request<{ data: unknown }>(`/units/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUnit: (id: number) => request<{ message: string }>(`/units/${id}`, { method: 'DELETE' }),
  taxes: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/taxes${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  createTax: (payload: TaxPayload) => request<{ data: unknown }>('/taxes', { method: 'POST', body: JSON.stringify(payload) }),
  updateTax: (id: number, payload: TaxPayload) => request<{ data: unknown }>(`/taxes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTax: (id: number) => request<{ message: string }>(`/taxes/${id}`, { method: 'DELETE' }),
  currencies: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/currencies${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  createCurrency: (payload: CurrencyPayload) => request<{ data: unknown }>('/currencies', { method: 'POST', body: JSON.stringify(payload) }),
  updateCurrency: (id: number, payload: CurrencyPayload) => request<{ data: unknown }>(`/currencies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCurrency: (id: number) => request<{ message: string }>(`/currencies/${id}`, { method: 'DELETE' }),
  warehouses: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/warehouses${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createWarehouse: (payload: WarehousePayload) => request<{ data: unknown }>('/warehouses', { method: 'POST', body: JSON.stringify(payload) }),
  updateWarehouse: (id: number, payload: WarehousePayload) => request<{ data: unknown }>(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteWarehouse: (id: number) => request<{ message: string }>(`/warehouses/${id}`, { method: 'DELETE' }),
  customers: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/customers${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  customerOptions: () => request<{ data: unknown }>('/customers/options'),
  createCustomer: (payload: CustomerPayload) => request<{ data: unknown }>('/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: number, payload: CustomerPayload) => request<{ data: unknown }>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCustomer: (id: number) => request<{ message: string }>(`/customers/${id}`, { method: 'DELETE' }),
  productOptions: () => request<{ data: unknown }>('/products/options'),
  products: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/products${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  createProduct: (payload: ProductPayload) => request<{ data: unknown }>('/products', { method: 'POST', body: productFormData(payload) }),
  updateProduct: (id: number, payload: ProductPayload) => request<{ data: unknown }>(`/products/${id}`, { method: 'POST', body: putForm(productFormData(payload)) }),
  deleteProduct: (id: number) => request<{ message: string }>(`/products/${id}`, { method: 'DELETE' }),
  purchaseStatuses: () => request<{ data: unknown[] }>('/purchase-statuses'),
  salesInvoices: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/sales-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  salesInvoice: (id: number) => request<{ data: unknown }>(`/sales-invoices/${id}`),
  createSalesInvoice: (payload: SalesInvoicePayload) => request<{ data: unknown; message: string }>('/sales-invoices', { method: 'POST', body: salesInvoiceFormData(payload) }),
  updateSalesInvoice: (id: number, payload: SalesInvoicePayload) =>
    request<{ data: unknown; message: string }>(`/sales-invoices/${id}`, { method: 'POST', body: putForm(salesInvoiceFormData(payload)) }),
  purchaseInvoices: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/purchase-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  purchaseInvoice: (id: number) => request<{ data: unknown }>(`/purchase-invoices/${id}`),
  createPurchaseInvoice: (payload: PurchaseInvoicePayload) => request<{ data: unknown; message: string }>('/purchase-invoices', { method: 'POST', body: purchaseInvoiceFormData(payload) }),
  updatePurchaseInvoice: (id: number, payload: PurchaseInvoicePayload) =>
    request<{ data: unknown; message: string }>(`/purchase-invoices/${id}`, { method: 'POST', body: putForm(purchaseInvoiceFormData(payload)) }),
};
