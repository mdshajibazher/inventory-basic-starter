export type User = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role_id?: number | null;
  current_biller_id?: number | null;
  current_biller?: Branch | null;
  biller_ids?: number[];
  billers?: Branch[];
  role?: Role | null;
  roles?: Role[] | string[];
  permissions?: string[];
  direct_permissions?: Permission[];
  sensitive_permissions?: UserSensitivePermissions;
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
  sensitive_permissions?: string[];
};

export type SensitivePermission = {
  name: string;
  label: string;
  category: 'super-user' | 'approval';
  warning: string;
};

export type SensitivePermissionWarnings = {
  super_user: string;
  approval: string;
};

export type SensitivePermissionCatalog = {
  data: SensitivePermission[];
  warnings: SensitivePermissionWarnings;
};

export type SensitivePermissionRoleSource = {
  id: number;
  name: string;
  is_active: boolean;
};

export type UserSensitivePermissions = {
  direct: string[];
  inherited: Array<{
    name: string;
    roles: SensitivePermissionRoleSource[];
  }>;
  effective: string[];
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

export type GeneralSetting = {
  id: number;
  site_title: string;
  site_logo?: string | null;
  favicon?: string | null;
  company_name?: string | null;
  company_address?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  bulksmsbd_api_url?: string | null;
  bulksmsbd_api_key?: string | null;
  bulksmsbd_sender_id?: string | null;
  sales_invoice_mail_notification_enabled?: boolean;
  sales_invoice_mail_notification_user_ids?: number[];
  sales_invoice_sms_notification_enabled?: boolean;
  sales_invoice_sms_notification_user_ids?: number[];
  return_invoice_mail_notification_enabled?: boolean;
  return_invoice_mail_notification_user_ids?: number[];
  return_invoice_sms_notification_enabled?: boolean;
  return_invoice_sms_notification_user_ids?: number[];
  purchase_invoice_mail_notification_enabled?: boolean;
  purchase_invoice_mail_notification_user_ids?: number[];
  purchase_invoice_sms_notification_enabled?: boolean;
  purchase_invoice_sms_notification_user_ids?: number[];
  payment_mail_notification_enabled?: boolean;
  payment_mail_notification_user_ids?: number[];
  payment_sms_notification_enabled?: boolean;
  payment_sms_notification_user_ids?: number[];
  customer_sales_invoice_sms_notification_enabled?: boolean;
  customer_sales_invoice_mail_notification_enabled?: boolean;
  customer_return_invoice_sms_notification_enabled?: boolean;
  customer_return_invoice_mail_notification_enabled?: boolean;
  currency?: string | null;
  currency_position?: string | null;
  staff_access?: string | null;
  date_format?: string | null;
  developed_by?: string | null;
  invoice_format?: string | null;
  state?: number | string | null;
  theme?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export type ProductSummary = {
  total: number;
  active: number;
  low_stock: number;
  out_of_stock: number;
  categories: number;
};

export type ActivityLogChange = {
  field: string;
  old: unknown;
  new: unknown;
};

export type ActivityLog = {
  id: number;
  log_name?: string | null;
  event?: string | null;
  description?: string | null;
  causer?: {
    id: number | string;
    name?: string | null;
    email?: string | null;
  } | null;
  changes: ActivityLogChange[];
  created_at?: string | null;
};

export type SmsLog = {
  id: number;
  user_id?: number | null;
  user_name?: string | null;
  user_email?: string | null;
  phone_number: string;
  message: string;
  status: string;
  provider?: string | null;
  provider_response?: string | null;
  record_type?: string | null;
  record_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EmailLog = {
  id: number;
  user_id?: number | null;
  user_name?: string | null;
  user_email?: string | null;
  email: string;
  subject: string;
  message: string;
  status: string;
  provider?: string | null;
  provider_response?: string | null;
  record_type?: string | null;
  record_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
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
  effective_qty?: number;
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
  activity_logs?: ActivityLog[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductWarehousePrice = {
  warehouse_id: number;
  warehouse_name?: string | null;
  variant_id?: number | null;
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

export type StockTransferStatusKey = 'pending' | 'completed';

export type StockTransferLine = {
  id: number;
  transfer_id: number;
  product_id: number;
  product_batch_id?: number | null;
  variant_id?: number | null;
  qty: number | string;
  purchase_unit_id: number;
  net_unit_cost: number | string;
  tax_rate: number | string;
  tax: number | string;
  total: number | string;
  note?: string | null;
  product?: Pick<Product, 'id' | 'name' | 'code' | 'cost' | 'is_batch' | 'is_variant' | 'warehouse_prices' | 'variants'> | null;
  unit?: Pick<Unit, 'id' | 'unit_code' | 'unit_name'> | null;
  batch?: { id: number; batch_no: string; expired_date?: string | null } | null;
  variant?: { id: number; name: string } | null;
};

export type StockTransfer = {
  id: number;
  reference_no: string;
  transfer_date?: string | null;
  user_id?: number | null;
  status: number | string;
  status_key: StockTransferStatusKey;
  status_label: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  expected_delivery_date?: string | null;
  requested_by?: number | null;
  item: number;
  total_qty: number | string;
  total_tax: number | string;
  total_cost: number | string;
  shipping_cost?: number | string | null;
  grand_total: number | string;
  document?: string | null;
  document_url?: string | null;
  vehicle_courier?: string | null;
  driver_contact?: string | null;
  note?: string | null;
  from_warehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  to_warehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  user?: Pick<User, 'id' | 'name' | 'email'> | null;
  requested_user?: Pick<User, 'id' | 'name' | 'email'> | null;
  products?: StockTransferLine[];
  activity_logs?: ActivityLog[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProfitReportSummary = {
  gross_sales: number;
  sales_discounts: number;
  order_discounts: number;
  coupon_discounts: number;
  payment_discounts: number;
  shipping: number;
  returns: number;
  cost_of_goods_sold: number;
  return_cost: number;
  purchase_return_cost: number;
  net_cost_of_goods_sold: number;
  gross_profit: number;
  expenses: number;
  tax_collected: number;
  tax_returned: number;
  net_revenue: number;
  net_profit: number;
  margin_percent: number;
  cash_in: number;
  cash_out: number;
  net_cash_movement: number;
};

export type ProfitReportProduct = {
  product_id: number;
  code: string;
  name: string;
  qty_sold: number;
  qty_returned: number;
  purchase_return_qty: number;
  net_sales: number;
  net_returns: number;
  purchase_return_cost: number;
  cost: number;
  profit: number;
  gross_profit: number;
  margin_percent: number;
};

export type ProfitReportBreakdown = {
  id: number;
  name: string;
  net_revenue: number;
  returns: number;
  purchase_return_cost: number;
  cost: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  margin_percent: number;
};

export type ProfitReportExpense = {
  category_id: number | null;
  category_name: string;
  amount: number;
};

export type ProfitReportCash = {
  payment_type: PaymentType | string;
  label: string;
  direction: PaymentDirection;
  amount: number;
};

export type ProfitReportDetailRow = {
  date?: string | null;
  label: string;
  reference?: string | null;
  type: string;
  description?: string | null;
  amount: number;
  amount_type?: 'money' | 'percent' | string;
  quantity?: number | string | null;
  revenue?: number;
  profit?: number;
};

export type ProfitReportDetail = {
  metric: {
    key: string;
    label: string;
    value: number;
    value_type: 'money' | 'percent' | string;
  };
  columns: string[];
  rows: ProfitReportDetailRow[];
  summary: {
    total: number;
    total_type: 'money' | 'percent' | string;
    row_count: number;
    components: { label: string; amount: number }[];
  };
  filters: {
    start_date: string;
    end_date: string;
    warehouse: Pick<Warehouse, 'id' | 'name'> | null;
    search: string;
  };
};

export type ProfitReport = {
  summary: ProfitReportSummary;
  products: ProfitReportProduct[];
  warehouses: ProfitReportBreakdown[];
  categories: ProfitReportBreakdown[];
  expenses: ProfitReportExpense[];
  cash: ProfitReportCash[];
  filters: {
    start_date: string;
    end_date: string;
    warehouse: Pick<Warehouse, 'id' | 'name'> | null;
    search: string;
  };
};

export type DatewiseProductReportRow = {
  sl: number;
  date: string;
  customer_name: string;
  product_name: string;
  unit: string;
  unit_price: number;
  qty: number;
  type: 'Sales' | 'Return';
  amount: number;
  cost: number;
};

export type DatewiseProductReport = {
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
  };
  rows: DatewiseProductReportRow[];
  summary: {
    total_sales_amount: number;
    total_return_amount: number;
    total_sales_cost: number;
    total_return_cost: number;
    total_sales_qty: number;
    total_return_qty: number;
    profitable_qty: number;
    profitable_amount: number;
    sales_in_words: string;
    returns_in_words: string;
  };
  filters: {
    start_date: string;
    end_date: string;
    product: {
      id: number;
      name: string;
      code: string;
    };
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

export type ExpenseCategory = {
  id: number;
  code: string;
  name: string;
  is_active?: boolean | number | null;
};

export type Expense = {
  id: number;
  reference_no: string;
  expense_category_id: number;
  category_name?: string | null;
  warehouse_id: number;
  warehouse_name?: string | null;
  account_id: number;
  account_name?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  cash_register_id?: number | null;
  amount: number | string;
  note?: string | null;
  expense_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PaymentType =
  | 'sale_payment'
  | 'customer_advance'
  | 'purchase_payment'
  | 'supplier_advance'
  | 'sale_return_refund'
  | 'purchase_return_refund';

export type PaymentDirection = 'in' | 'out';

export type ReferenceDocument = {
  type: string;
  id: number | null;
  reference_no?: string | null;
};

export type Payment = {
  id: number;
  payment_reference: string;
  payment_type: PaymentType;
  direction: PaymentDirection;
  amount: number | string;
  discount_amount?: number | string | null;
  settled_amount?: number | string | null;
  change?: number | string | null;
  paying_method: string;
  payment_note?: string | null;
  approval_status?: 'pending' | 'approved' | string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  can_approve?: boolean;
  can_edit?: boolean;
  account_id: number;
  customer_id?: number | null;
  supplier_id?: number | null;
  sale_id?: number | null;
  purchase_id?: number | null;
  sale_return_id?: number | null;
  purchase_return_id?: number | null;
  reference_document?: ReferenceDocument | null;
  account?: Pick<Account, 'id' | 'name' | 'account_no'> | null;
  customer?: Pick<Customer, 'id' | 'name' | 'email' | 'phone_number'> | null;
  supplier?: Pick<Supplier, 'id' | 'name' | 'email' | 'phone_number'> | null;
  sale?: InvoiceOption | null;
  purchase?: InvoiceOption | null;
  sale_return?: InvoiceOption | null;
  purchase_return?: InvoiceOption | null;
  activity_logs?: ActivityLog[];
  created_at?: string;
  updated_at?: string;
};

export type Branding = {
  site_title?: string | null;
  site_logo?: string | null;
};

export type InvoiceOption = {
  id: number;
  reference_no: string;
  customer_id?: number | null;
  supplier_id?: number | null;
  grand_total?: number | string | null;
  due_amount?: number | string | null;
  paid_amount?: number | string | null;
  payment_status?: number | string | null;
  approval_status?: 'pending' | 'approved' | string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  can_approve?: boolean;
  sale_date?: string | null;
  purchase_date?: string | null;
  return_date?: string | null;
  customer?: Pick<Customer, 'id' | 'name'> | null;
  supplier?: Pick<Supplier, 'id' | 'name'> | null;
  activity_logs?: ActivityLog[];
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

export type CustomerLedgerRow = {
  id: number;
  type: 'sale' | 'return' | 'payment';
  date: string;
  bill?: string | null;
  particular: string;
  debit: number;
  credit: number;
  cash_amount?: number;
  discount_amount?: number;
  product_lines: string[];
  balance: number;
};

export type CustomerLedgerReport = {
  company: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  customer: Pick<Customer, 'id' | 'name' | 'company_name' | 'email' | 'phone_number'> & {
    address?: string | null;
  };
  filters: {
    from?: string | null;
    to?: string | null;
    printed_at: string;
  };
  opening_balance: number;
  rows: CustomerLedgerRow[];
  totals: {
    debit: number;
    credit: number;
    closing_balance: number;
  };
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
  category_id?: number | null;
  category?: Category | null;
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
