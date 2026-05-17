export type User = {
  id: number;
  name: string;
  email: string;
};

export type Category = {
  id: number;
  name: string;
  parent_id?: number | null;
  is_active?: boolean | number | null;
  parent?: Pick<Category, 'id' | 'name'> | null;
  children?: Category[];
};

export type Product = {
  id: number;
  category_id: number;
  name: string;
  sku: string;
  barcode?: string | null;
  purchase_price: string | number;
  selling_price: string | number;
  quantity: number;
  low_stock_limit: number;
  description?: string | null;
  category?: Category;
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
