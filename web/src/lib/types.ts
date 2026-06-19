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
  unit_group_id?: number | null;
  unit_group_title?: string | null;
  base_unit?: number | null;
  base_unit_name?: string | null;
  operator?: string | null;
  operation_value?: number | string | null;
  is_active?: boolean | number | null;
  can_delete?: boolean;
  unit_group?: UnitGroup | null;
  base?: Pick<Unit, 'id' | 'unit_name'> | null;
  related_units?: Unit[];
};

export type UnitGroup = {
  id: number;
  title: string;
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
  unit_id_locked?: boolean;
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

export type ProfitReportSummary = {
  gross_sales: number;
  sales_discounts: number;
  coupon_discounts: number;
  shipping: number;
  returns: number;
  cost_of_goods_sold: number;
  return_cost: number;
  tax_collected: number;
  tax_returned: number;
  net_revenue: number;
  net_profit: number;
  margin_percent: number;
};

export type ProfitReportProduct = {
  product_id: number;
  code: string;
  name: string;
  qty_sold: number;
  qty_returned: number;
  net_sales: number;
  net_returns: number;
  cost: number;
  profit: number;
  margin_percent: number;
};

export type ProfitReport = {
  summary: ProfitReportSummary;
  products: ProfitReportProduct[];
  filters: {
    start_date: string;
    end_date: string;
    warehouse: Pick<Warehouse, 'id' | 'name'> | null;
    search: string;
  };
};

export type Account = {
  id: number;
  account_no: string;
  name: string;
  initial_balance?: number | string | null;
  total_balance: number | string;
  note?: string | null;
  is_default?: boolean | number | null;
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
  product_id?: number;
  warehouse_id?: number | null;
  product_batch_id?: number | null;
  variant_id?: number | null;
  unit_id?: number | null;
  source_type?: string | null;
  source_id?: number | null;
  type: string;
  quantity: number;
  quantity_base?: number;
  before_quantity: number;
  after_quantity: number;
  reference_no?: string | null;
  note?: string | null;
  movement_date?: string | null;
  is_editable?: boolean;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'code'>;
  warehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  batch?: { id: number; batch_no: string; expired_date?: string | null } | null;
  variant?: { id: number; name: string } | null;
  unit?: Pick<Unit, 'id' | 'unit_code' | 'unit_name'> | null;
};

export type ProductStockBreakdown = {
  warehouse_id: number;
  warehouse_name?: string | null;
  variant_id?: number | null;
  product_batch_id?: number | null;
  batch_no?: string | null;
  expired_date?: string | null;
  qty: number;
};

export type ProductStock = {
  id: number;
  product_id: number;
  name: string;
  code: string;
  type: string;
  current_stock: number;
  unit?: Unit | null;
  is_variant?: boolean | number | null;
  is_batch?: boolean | number | null;
  variants?: ProductVariant[];
  stocks?: ProductStockBreakdown[];
};

export type DashboardSummary = {
  total_categories: number;
  total_products: number;
  total_quantity: number;
  low_stock_products: number;
  recent_movements: StockMovement[];
};
