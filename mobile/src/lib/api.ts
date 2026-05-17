import { tokenStorage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api';

type RequestOptions = RequestInit & {
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : await tokenStorage.get();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

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

  categories: () => request<{ data: unknown[] }>('/categories'),

  createCategory: (payload: { name: string; parent_id?: number | null; is_active?: boolean }) =>
    request<{ data: unknown }>('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCategory: (
    id: number,
    payload: { name: string; parent_id?: number | null; is_active?: boolean }
  ) =>
    request<{ data: unknown }>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteCategory: (id: number) =>
    request<{ message: string }>(`/categories/${id}`, {
      method: 'DELETE',
    }),

  products: (search = '') =>
    request<{ data: unknown[] }>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  createProduct: (payload: Record<string, unknown>) =>
    request<{ data: unknown }>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (id: number, payload: Record<string, unknown>) =>
    request<{ data: unknown }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
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
