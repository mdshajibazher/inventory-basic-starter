import Constants from 'expo-constants';
import { tokenStorage } from './storage';
import type { PaginatedResponse } from '../types';

const DEFAULT_API_URL = 'http://10.0.2.2:8000/api';

function configuredApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };

  const hostUri =
    constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.manifest?.debuggerHost;

  const host = hostUri?.replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0];

  return host ? `http://${host}:8000/api` : DEFAULT_API_URL;
}

const API_URL = configuredApiUrl();

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export type UploadImage = {
  uri: string;
  name: string;
  mimeType: string;
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

type UnitPayload = {
  unit_code: string;
  unit_name: string;
  base_unit?: number | null;
  operator?: string | null;
  operation_value?: number | null;
  is_active?: boolean;
};

type RolePayload = {
  name: string;
  description?: string | null;
  is_active?: boolean;
  permissions?: string[];
};

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
  is_batch?: boolean;
  is_diffPrice?: boolean;
  is_active?: boolean;
  image?: UploadImage | null;
  remove_image?: boolean;
};

function isFormData(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function appendBoolean(formData: FormData, key: string, value?: boolean) {
  if (value !== undefined) {
    formData.append(key, value ? '1' : '0');
  }
}

function appendNullableNumber(formData: FormData, key: string, value?: number | null) {
  formData.append(key, value === null || value === undefined ? '' : String(value));
}

function appendImage(formData: FormData, key: string, image?: UploadImage | null) {
  if (!image) return;

  formData.append(key, {
    uri: image.uri,
    name: image.name,
    type: image.mimeType,
  } as unknown as Blob);
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

function appendNullableString(formData: FormData, key: string, value?: string | null) {
  formData.append(key, value === null || value === undefined ? '' : value);
}

function appendRequiredNumber(formData: FormData, key: string, value: number) {
  formData.append(key, String(value));
}

function productFormData(payload: ProductPayload) {
  const formData = new FormData();
  formData.append('name', payload.name);
  formData.append('code', payload.code);
  formData.append('type', payload.type);
  formData.append('barcode_symbology', payload.barcode_symbology);
  appendNullableNumber(formData, 'brand_id', payload.brand_id);
  appendRequiredNumber(formData, 'category_id', payload.category_id);
  appendNullableNumber(formData, 'unit_id', payload.unit_id);
  appendNullableNumber(formData, 'purchase_unit_id', payload.purchase_unit_id);
  appendNullableNumber(formData, 'sale_unit_id', payload.sale_unit_id);
  appendRequiredNumber(formData, 'cost', payload.cost);
  appendRequiredNumber(formData, 'price', payload.price);
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
  appendBoolean(formData, 'is_batch', payload.is_batch);
  appendBoolean(formData, 'is_diffPrice', payload.is_diffPrice);
  appendBoolean(formData, 'is_active', payload.is_active);
  appendBoolean(formData, 'remove_image', payload.remove_image);
  appendImage(formData, 'image', payload.image);
  return formData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : await tokenStorage.get();
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
    throw new Error(
      `Could not reach the API at ${API_URL}. For Expo Go on a physical phone, set EXPO_PUBLIC_API_URL to your computer's LAN IP, for example http://192.168.0.105:8000/api, and run Laravel with php artisan serve --host=0.0.0.0 --port=8000.`
    );
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

  roles: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(
      `/roles${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`
    ),

  permissions: () => request<{ data: unknown[] }>('/roles/permissions'),

  createRole: (payload: RolePayload) =>
    request<{ data: unknown }>('/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRole: (id: number, payload: RolePayload) =>
    request<{ data: unknown }>(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteRole: (id: number) =>
    request<{ message: string }>(`/roles/${id}`, {
      method: 'DELETE',
    }),

  brands: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(
      `/brands${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`
    ),

  createBrand: (payload: BrandPayload) =>
    request<{ data: unknown }>('/brands', {
      method: 'POST',
      body: brandFormData(payload),
    }),

  updateBrand: (id: number, payload: BrandPayload) =>
    request<{ data: unknown }>(`/brands/${id}`, {
      method: 'POST',
      body: (() => {
        const formData = brandFormData(payload);
        formData.append('_method', 'PUT');
        return formData;
      })(),
    }),

  deleteBrand: (id: number) =>
    request<{ message: string }>(`/brands/${id}`, {
      method: 'DELETE',
    }),

  categories: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(
      `/categories${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`
    ),

  createCategory: (payload: CategoryPayload) =>
    request<{ data: unknown }>('/categories', {
      method: 'POST',
      body: categoryFormData(payload),
    }),

  updateCategory: (id: number, payload: CategoryPayload) =>
    request<{ data: unknown }>(`/categories/${id}`, {
      method: 'POST',
      body: (() => {
        const formData = categoryFormData(payload);
        formData.append('_method', 'PUT');
        return formData;
      })(),
    }),

  deleteCategory: (id: number) =>
    request<{ message: string }>(`/categories/${id}`, {
      method: 'DELETE',
    }),

  units: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(
      `/units${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`
    ),

  createUnit: (payload: UnitPayload) =>
    request<{ data: unknown }>('/units', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUnit: (id: number, payload: UnitPayload) =>
    request<{ data: unknown }>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteUnit: (id: number) =>
    request<{ message: string }>(`/units/${id}`, {
      method: 'DELETE',
    }),

  productOptions: () => request<{ data: unknown }>('/products/options'),

  products: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(
      `/products${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`
    ),

  createProduct: (payload: ProductPayload) =>
    request<{ data: unknown }>('/products', {
      method: 'POST',
      body: productFormData(payload),
    }),

  updateProduct: (id: number, payload: ProductPayload) =>
    request<{ data: unknown }>(`/products/${id}`, {
      method: 'POST',
      body: (() => {
        const formData = productFormData(payload);
        formData.append('_method', 'PUT');
        return formData;
      })(),
    }),

  deleteProduct: (id: number) =>
    request<{ message: string }>(`/products/${id}`, {
      method: 'DELETE',
    }),

  stockIn: (payload: { product_id: number; quantity: number; note?: string }) =>
    request<{ data: unknown }>('/stock/in', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  stockOut: (payload: { product_id: number; quantity: number; note?: string }) =>
    request<{ data: unknown }>('/stock/out', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  movements: () => request<{ data: unknown[] }>('/stock/movements'),
};
