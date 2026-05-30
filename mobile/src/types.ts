export type User = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role_id?: number | null;
  role?: Role | null;
  roles?: Role[] | string[];
  permissions?: string[];
  direct_permissions?: Permission[];
  is_active?: boolean | number | null;
};

export type Permission = {
  id: number;
  name: string;
  guard_name?: string;
};

export type Role = {
  id: number;
  name: string;
  description?: string | null;
  guard_name?: string | null;
  is_active?: boolean | number | null;
  permissions?: Permission[];
};

export type Category = {
  id: number;
  name: string;
  image?: string | null;
  parent_id?: number | null;
  is_active?: boolean | number | null;
  parent_category_name?: string | null;
  parent?: Pick<Category, 'id' | 'name'> | null;
  children?: Category[];
};

export type Brand = {
  id: number;
  title: string;
  image?: string | null;
  is_active?: boolean | number | null;
};

export type Branch = {
  id: number;
  name: string;
  image?: string | null;
  company_name: string;
  vat_number?: string | null;
  email: string;
  phone_number: string;
  address: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active?: boolean | number | null;
};

export type Supplier = {
  id: number;
  name: string;
  image?: string | null;
  company_name: string;
  vat_number?: string | null;
  email: string;
  phone_number: string;
  address: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active?: boolean | number | null;
};

export type Unit = {
  id: number;
  unit_code: string;
  unit_name: string;
  base_unit?: number | null;
  base_unit_name?: string | null;
  operator?: string | null;
  operation_value?: number | string | null;
  is_active?: boolean | number | null;
  base?: Pick<Unit, 'id' | 'unit_name'> | null;
  related_units?: Unit[];
};

export type PaginationMeta = {
  current_page: number;
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta?: PaginationMeta;
  links?: unknown;
};

export type Product = {
  id: number;
  name: string;
  code: string;
  sku: string;
  type: string;
  barcode_symbology: string;
  brand_id?: number | null;
  category_id: number;
  unit_id?: number | null;
  purchase_unit_id?: number | null;
  sale_unit_id?: number | null;
  cost: string | number;
  purchase_price: string | number;
  price: string | number;
  selling_price: string | number;
  qty: number;
  quantity: number;
  alert_quantity?: number | null;
  low_stock_limit: number;
  tax_id?: number | null;
  tax_method?: number | null;
  image?: string | null;
  image_url?: string | null;
  featured?: boolean | number | null;
  product_details?: string | null;
  description?: string | null;
  promotion?: boolean | number | null;
  promotion_price?: string | number | null;
  starting_date?: string | null;
  last_date?: string | null;
  is_variant?: boolean | number | null;
  is_batch?: boolean | number | null;
  is_diffPrice?: boolean | number | null;
  is_active?: boolean | number | null;
  variants?: ProductVariant[];
  warehouse_prices?: ProductWarehousePrice[];
  brand?: Brand;
  category?: Category;
  unit?: Unit;
  purchase_unit?: Unit;
  sale_unit?: Unit;
  tax?: Tax;
};

export type ProductWarehousePrice = {
  warehouse_id: number;
  warehouse_name?: string | null;
  product_batch_id?: number | null;
  batch_no?: string | null;
  expired_date?: string | null;
  qty?: number | string | null;
  price?: number | string | null;
};

export type ProductVariant = {
  id: number;
  variant_id: number;
  name: string;
  position: number;
  item_code: string;
  additional_price: number | string | null;
  qty: number;
};

export type Tax = {
  id: number;
  name: string;
  rate: number | string;
  is_active?: boolean | number | null;
};

export type Currency = {
  id: number;
  name: string;
  code: string;
  exchange_rate: number | string;
};

export type Warehouse = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address: string;
  is_active?: boolean | number | null;
};

export type PurchaseStatus = {
  id: number;
  value: string;
  label: string;
};

export type CustomerGroup = {
  id: number;
  name: string;
  percentage: number | string;
};

export type Customer = {
  id: number;
  customer_group_id: number;
  user_id?: number | null;
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
  deposit?: number | string | null;
  expense?: number | string | null;
  is_active?: boolean | number | null;
  customer_group?: CustomerGroup;
  user?: Pick<User, 'id' | 'name' | 'email'> | null;
};

export type StockMovement = {
  id: number;
  type: 'in' | 'out';
  quantity: number;
  before_quantity: number;
  after_quantity: number;
  note?: string | null;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku'>;
};

export type DashboardSummary = {
  total_categories: number;
  total_products: number;
  total_quantity: number;
  low_stock_products: number;
  recent_movements: StockMovement[];
};
