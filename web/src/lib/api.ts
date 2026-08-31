import { tokenStorage } from './storage';
import type { Branding, CustomerLedgerReport, DatewiseProductReport, EmailLog, Expense, InvoiceOption, PaginatedResponse, Payment, PaymentDirection, PaymentType, Product, ProductSummary, ProfitReport, ProfitReportDetail, SmsLog, StockTransfer } from './types';

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

export type ProductBarcodeLabel = {
  product_id: number;
  variant_id?: number | null;
  name: string;
  code: string;
  price: number | string;
  promotion_price?: number | string | null;
  barcode_symbology: string;
  barcode_image: string;
  barcode_mime?: string | null;
  currency?: string | null;
  currency_position?: string | null;
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
  unit_group_id?: number | null;
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

type AccountPayload = {
  account_no: string;
  name: string;
  initial_balance?: number | null;
  total_balance?: number | null;
  note?: string | null;
  is_default?: boolean;
  is_active?: boolean;
};

type ExpenseCategoryPayload = {
  code: string;
  name: string;
  is_active?: boolean;
};

export type ExpensePayload = {
  reference_no: string;
  expense_category_id: number;
  warehouse_id: number;
  account_id: number;
  amount: number;
  note?: string | null;
  expense_date?: string | null;
};

export type GeneralSettingPayload = {
  site_title: string;
  site_logo?: UploadImage | null;
  favicon?: UploadImage | null;
  remove_site_logo?: boolean;
  remove_favicon?: boolean;
  company_name?: string | null;
  company_address?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  bulksmsbd_api_url?: string | null;
  bulksmsbd_api_key?: string | null;
  bulksmsbd_sender_id?: string | null;
  sales_invoice_approver_ids?: number[];
  return_invoice_approver_ids?: number[];
  purchase_invoice_approver_ids?: number[];
  payment_approver_ids?: number[];
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
};

export type PaymentPayload = {
  customer_id?: number | null;
  supplier_id?: number | null;
  sale_id?: number | null;
  purchase_id?: number | null;
  sale_return_id?: number | null;
  purchase_return_id?: number | null;
  account_id: number;
  payment_reference?: string | null;
  payment_type: PaymentType;
  direction?: PaymentDirection;
  amount: number;
  discount_amount?: number;
  change?: number;
  paying_method: string;
  payment_note?: string | null;
};

export type StockAdjustmentPayload = {
  warehouse_id: number;
  product_batch_id?: number | null;
  variant_id?: number | null;
  unit_id: number;
  direction: 'increase' | 'decrease';
  qty: number;
  movement_date?: string | null;
  note?: string | null;
};

export type BatchStockAdjustmentLinePayload = {
  product_id: number;
  product_batch_id?: number | null;
  variant_id?: number | null;
  unit_id: number;
  direction: 'increase' | 'decrease';
  qty: number;
};

export type BatchStockAdjustmentPayload = {
  warehouse_id: number;
  document?: UploadImage | null;
  note?: string | null;
  lines: BatchStockAdjustmentLinePayload[];
};

export type StockTransferLinePayload = {
  product_id: number;
  variant_id?: number | null;
  product_batch_id?: number | null;
  qty: number;
  purchase_unit: number;
  net_unit_cost?: number;
  tax_rate?: number;
  tax?: number;
  subtotal?: number;
  line_note?: string | null;
};

export type StockTransferPayload = {
  reference_no: string;
  transfer_date?: string | null;
  from_warehouse_id: number;
  to_warehouse_id: number;
  status: 'pending' | 'completed' | 1 | 2;
  expected_delivery_date?: string | null;
  requested_by?: number | null;
  note?: string | null;
  vehicle_courier?: string | null;
  driver_contact?: string | null;
  document?: UploadImage | null;
  lines: StockTransferLinePayload[];
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
  variant_id?: number | null;
  product_batch_id?: number | null;
  batch_no?: string | null;
  qty: number;
  sale_unit?: number | string | null;
  unit_price: number;
  net_unit_price: number;
  discount: number;
  tax_rate?: number | null;
  tax_method?: number | null;
  tax: number;
  subtotal: number;
};

export type SalesInvoicePayload = {
  reference_no: string;
  sale_date?: string | null;
  customer_id: number;
  warehouse_id: number;
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
  payment_discount_amount?: number;
  payment_note?: string | null;
  sale_note?: string | null;
  staff_note?: string | null;
  document?: UploadImage | null;
};

export type ReturnInvoicePayload = Omit<SalesInvoicePayload, 'sale_status' | 'payment_status' | 'paid_by_id' | 'paying_amount' | 'paid_amount' | 'payment_discount_amount' | 'payment_note' | 'coupon_id' | 'coupon_discount' | 'coupon_active' | 'shipping_cost'> & {
  return_date?: string | null;
  return_note?: string | null;
};

export type PurchaseInvoiceLinePayload = {
  product_id: number;
  product_code?: string | null;
  variant_id?: number | null;
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
  purchase_date?: string | null;
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

export type PurchaseReturnPayload = Omit<PurchaseInvoicePayload, 'purchase_date' | 'status' | 'purchase_status_id' | 'payment_status' | 'paid_by_id' | 'paying_amount' | 'paid_amount' | 'payment_note' | 'order_discount' | 'shipping_cost'> & {
  return_date?: string | null;
  return_note?: string | null;
};

export type BatchAvailabilityResponse = {
  valid: boolean;
  qty: number;
  product_batch_id: number | null;
  message: string;
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
  biller_ids: number[];
};

export type LoginResponse = {
  data: {
    token?: string;
    user?: unknown;
    requires_branch?: boolean;
    branches?: unknown[];
  };
  message?: string;
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

function appendNumberPayloadArray(formData: FormData, key: string, values?: number[]) {
  values?.forEach((value, index) => formData.append(`${key}[${index}]`, String(value)));
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

function generalSettingFormData(payload: GeneralSettingPayload) {
  const formData = new FormData();
  formData.append('site_title', payload.site_title);
  appendImage(formData, 'site_logo', payload.site_logo);
  appendImage(formData, 'favicon', payload.favicon);
  appendBoolean(formData, 'remove_site_logo', payload.remove_site_logo);
  appendBoolean(formData, 'remove_favicon', payload.remove_favicon);
  appendNullableString(formData, 'company_name', payload.company_name);
  appendNullableString(formData, 'company_address', payload.company_address);
  appendNullableString(formData, 'company_email', payload.company_email);
  appendNullableString(formData, 'company_phone', payload.company_phone);
  appendNullableString(formData, 'bulksmsbd_api_url', payload.bulksmsbd_api_url);
  appendNullableString(formData, 'bulksmsbd_api_key', payload.bulksmsbd_api_key);
  appendNullableString(formData, 'bulksmsbd_sender_id', payload.bulksmsbd_sender_id);
  appendNumberPayloadArray(formData, 'sales_invoice_approver_ids', payload.sales_invoice_approver_ids);
  appendNumberPayloadArray(formData, 'return_invoice_approver_ids', payload.return_invoice_approver_ids);
  appendNumberPayloadArray(formData, 'purchase_invoice_approver_ids', payload.purchase_invoice_approver_ids);
  appendNumberPayloadArray(formData, 'payment_approver_ids', payload.payment_approver_ids);
  appendBoolean(formData, 'sales_invoice_mail_notification_enabled', payload.sales_invoice_mail_notification_enabled);
  appendNumberPayloadArray(formData, 'sales_invoice_mail_notification_user_ids', payload.sales_invoice_mail_notification_user_ids);
  appendBoolean(formData, 'sales_invoice_sms_notification_enabled', payload.sales_invoice_sms_notification_enabled);
  appendNumberPayloadArray(formData, 'sales_invoice_sms_notification_user_ids', payload.sales_invoice_sms_notification_user_ids);
  appendBoolean(formData, 'return_invoice_mail_notification_enabled', payload.return_invoice_mail_notification_enabled);
  appendNumberPayloadArray(formData, 'return_invoice_mail_notification_user_ids', payload.return_invoice_mail_notification_user_ids);
  appendBoolean(formData, 'return_invoice_sms_notification_enabled', payload.return_invoice_sms_notification_enabled);
  appendNumberPayloadArray(formData, 'return_invoice_sms_notification_user_ids', payload.return_invoice_sms_notification_user_ids);
  appendBoolean(formData, 'purchase_invoice_mail_notification_enabled', payload.purchase_invoice_mail_notification_enabled);
  appendNumberPayloadArray(formData, 'purchase_invoice_mail_notification_user_ids', payload.purchase_invoice_mail_notification_user_ids);
  appendBoolean(formData, 'purchase_invoice_sms_notification_enabled', payload.purchase_invoice_sms_notification_enabled);
  appendNumberPayloadArray(formData, 'purchase_invoice_sms_notification_user_ids', payload.purchase_invoice_sms_notification_user_ids);
  appendBoolean(formData, 'payment_mail_notification_enabled', payload.payment_mail_notification_enabled);
  appendNumberPayloadArray(formData, 'payment_mail_notification_user_ids', payload.payment_mail_notification_user_ids);
  appendBoolean(formData, 'payment_sms_notification_enabled', payload.payment_sms_notification_enabled);
  appendNumberPayloadArray(formData, 'payment_sms_notification_user_ids', payload.payment_sms_notification_user_ids);
  appendBoolean(formData, 'customer_sales_invoice_sms_notification_enabled', payload.customer_sales_invoice_sms_notification_enabled);
  appendBoolean(formData, 'customer_sales_invoice_mail_notification_enabled', payload.customer_sales_invoice_mail_notification_enabled);
  appendBoolean(formData, 'customer_return_invoice_sms_notification_enabled', payload.customer_return_invoice_sms_notification_enabled);
  appendBoolean(formData, 'customer_return_invoice_mail_notification_enabled', payload.customer_return_invoice_mail_notification_enabled);
  return formData;
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
  appendNullableString(formData, 'sale_date', payload.sale_date);
  formData.append('customer_id', String(payload.customer_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  formData.append('sale_status', String(payload.sale_status));
  formData.append('payment_status', String(payload.payment_status));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
  appendNullableNumberArray(formData, 'product_batch_id', payload.lines.map((line) => line.product_batch_id));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNullableStringArray(formData, 'sale_unit', payload.lines.map((line) => line.sale_unit));
  appendNumberArray(formData, 'unit_price', payload.lines.map((line) => line.unit_price));
  appendNumberArray(formData, 'net_unit_price', payload.lines.map((line) => line.net_unit_price));
  appendNumberArray(formData, 'discount', payload.lines.map((line) => line.discount));
  appendNullableNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate));
  appendNullableNumberArray(formData, 'tax_method', payload.lines.map((line) => line.tax_method));
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
  appendNullableNumber(formData, 'payment_discount_amount', payload.payment_discount_amount ?? 0);
  appendNullableString(formData, 'payment_note', payload.payment_note);
  appendNullableString(formData, 'sale_note', payload.sale_note);
  appendNullableString(formData, 'staff_note', payload.staff_note);
  appendImage(formData, 'document', payload.document);
  return formData;
}

function returnInvoiceFormData(payload: ReturnInvoicePayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  appendNullableString(formData, 'return_date', payload.return_date);
  formData.append('customer_id', String(payload.customer_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
  appendNullableNumberArray(formData, 'product_batch_id', payload.lines.map((line) => line.product_batch_id));
  appendNullableStringArray(formData, 'batch_no', payload.lines.map((line) => line.batch_no));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNullableStringArray(formData, 'sale_unit', payload.lines.map((line) => line.sale_unit));
  appendNumberArray(formData, 'unit_price', payload.lines.map((line) => line.unit_price));
  appendNumberArray(formData, 'net_unit_price', payload.lines.map((line) => line.net_unit_price));
  appendNumberArray(formData, 'discount', payload.lines.map((line) => line.discount));
  appendNullableNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate));
  appendNullableNumberArray(formData, 'tax_method', payload.lines.map((line) => line.tax_method));
  appendNumberArray(formData, 'tax', payload.lines.map((line) => line.tax));
  appendNumberArray(formData, 'subtotal', payload.lines.map((line) => line.subtotal));
  appendNullableNumber(formData, 'order_tax_rate', payload.order_tax_rate ?? 0);
  appendNullableString(formData, 'return_note', payload.return_note ?? payload.sale_note);
  appendNullableString(formData, 'staff_note', payload.staff_note);
  appendImage(formData, 'document', payload.document);
  return formData;
}

function purchaseInvoiceFormData(payload: PurchaseInvoicePayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  appendNullableString(formData, 'purchase_date', payload.purchase_date);
  formData.append('supplier_id', String(payload.supplier_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  formData.append('status', String(payload.status));
  formData.append('purchase_status_id', String(payload.purchase_status_id ?? payload.status));
  formData.append('payment_status', String(payload.payment_status));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
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

function purchaseReturnFormData(payload: PurchaseReturnPayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  appendNullableString(formData, 'return_date', payload.return_date);
  formData.append('supplier_id', String(payload.supplier_id));
  formData.append('warehouse_id', String(payload.warehouse_id));
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableStringArray(formData, 'product_code', payload.lines.map((line) => line.product_code));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNullableStringArray(formData, 'batch_no', payload.lines.map((line) => line.batch_no));
  appendNullableStringArray(formData, 'purchase_unit', payload.lines.map((line) => line.purchase_unit));
  appendNumberArray(formData, 'net_unit_cost', payload.lines.map((line) => line.net_unit_cost));
  appendNumberArray(formData, 'discount', payload.lines.map((line) => line.discount));
  appendNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate));
  appendNumberArray(formData, 'tax', payload.lines.map((line) => line.tax));
  appendNumberArray(formData, 'subtotal', payload.lines.map((line) => line.subtotal));
  appendNullableNumber(formData, 'order_tax_rate', payload.order_tax_rate ?? 0);
  appendNullableString(formData, 'return_note', payload.return_note ?? payload.note);
  appendImage(formData, 'document', payload.document);
  return formData;
}

function stockTransferFormData(payload: StockTransferPayload) {
  const formData = new FormData();
  formData.append('reference_no', payload.reference_no);
  appendNullableString(formData, 'transfer_date', payload.transfer_date);
  formData.append('from_warehouse_id', String(payload.from_warehouse_id));
  formData.append('to_warehouse_id', String(payload.to_warehouse_id));
  formData.append('status', String(payload.status));
  appendNullableString(formData, 'expected_delivery_date', payload.expected_delivery_date);
  appendNullableNumber(formData, 'requested_by', payload.requested_by);
  appendNullableString(formData, 'note', payload.note);
  appendNullableString(formData, 'vehicle_courier', payload.vehicle_courier);
  appendNullableString(formData, 'driver_contact', payload.driver_contact);
  appendImage(formData, 'document', payload.document);
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
  appendNullableNumberArray(formData, 'product_batch_id', payload.lines.map((line) => line.product_batch_id));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
  appendNumberArray(formData, 'purchase_unit', payload.lines.map((line) => line.purchase_unit));
  appendNumberArray(formData, 'net_unit_cost', payload.lines.map((line) => line.net_unit_cost ?? 0));
  appendNumberArray(formData, 'tax_rate', payload.lines.map((line) => line.tax_rate ?? 0));
  appendNumberArray(formData, 'tax', payload.lines.map((line) => line.tax ?? 0));
  appendNumberArray(formData, 'subtotal', payload.lines.map((line) => line.subtotal ?? 0));
  appendNullableStringArray(formData, 'line_note', payload.lines.map((line) => line.line_note));
  return formData;
}

function batchStockAdjustmentFormData(payload: BatchStockAdjustmentPayload) {
  const formData = new FormData();
  formData.append('warehouse_id', String(payload.warehouse_id));
  appendNullableString(formData, 'note', payload.note);
  appendImage(formData, 'document', payload.document);
  appendNumberArray(formData, 'product_id', payload.lines.map((line) => line.product_id));
  appendNullableNumberArray(formData, 'variant_id', payload.lines.map((line) => line.variant_id));
  appendNullableNumberArray(formData, 'product_batch_id', payload.lines.map((line) => line.product_batch_id));
  appendNumberArray(formData, 'unit_id', payload.lines.map((line) => line.unit_id));
  payload.lines.forEach((line) => formData.append('direction[]', line.direction));
  appendNumberArray(formData, 'qty', payload.lines.map((line) => line.qty));
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

function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
}

async function download(path: string, filename: string) {
  const token = tokenStorage.get();
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

const putForm = (formData: FormData) => {
  formData.append('_method', 'PUT');
  return formData;
};

export const api = {
  login: (email: string, password: string, billerId?: number) =>
    request<LoginResponse>('/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password, biller_id: billerId }),
    }),
  me: () => request<{ data: unknown }>('/me'),
  logout: () => request<{ message: string }>('/logout', { method: 'POST' }),
  branding: () => request<{ data: Branding }>('/branding'),
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
  supplierStatement: (id: number, params: { page?: number; perPage?: number; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<Payment>>(`/suppliers/${id}/statement${queryString({ page: params.page, per_page: params.perPage, from: params.from, to: params.to })}`),
  categories: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/categories${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createCategory: (payload: CategoryPayload) => request<{ data: unknown }>('/categories', { method: 'POST', body: categoryFormData(payload) }),
  updateCategory: (id: number, payload: CategoryPayload) => request<{ data: unknown }>(`/categories/${id}`, { method: 'POST', body: putForm(categoryFormData(payload)) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),
  units: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/units${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  unitGroups: () => request<{ data: unknown[] }>('/unit-groups'),
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
  accounts: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/accounts${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createAccount: (payload: AccountPayload) => request<{ data: unknown }>('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccount: (id: number, payload: AccountPayload) => request<{ data: unknown }>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (id: number) => request<{ message: string }>(`/accounts/${id}`, { method: 'DELETE' }),
  expenseCategories: (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/expense-categories${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  'expense-categories': (params: { page?: number; perPage?: number; search?: string; activeOnly?: boolean } = {}) =>
    request<PaginatedResponse<unknown>>(`/expense-categories${queryString({ page: params.page, per_page: params.perPage, search: params.search, active_only: params.activeOnly })}`),
  createExpenseCategory: (payload: ExpenseCategoryPayload) =>
    request<{ data: unknown }>('/expense-categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateExpenseCategory: (id: number, payload: ExpenseCategoryPayload) =>
    request<{ data: unknown }>(`/expense-categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExpenseCategory: (id: number) => request<{ message: string }>(`/expense-categories/${id}`, { method: 'DELETE' }),
  expenses: (params: { page?: number; perPage?: number; search?: string; warehouseId?: number | null; accountId?: number | null; expenseCategoryId?: number | null; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<Expense>>(`/expenses${queryString({
      page: params.page,
      per_page: params.perPage,
      search: params.search,
      warehouse_id: params.warehouseId,
      account_id: params.accountId,
      expense_category_id: params.expenseCategoryId,
      from: params.from,
      to: params.to,
    })}`),
  createExpense: (payload: ExpensePayload) =>
    request<{ data: Expense; message: string }>('/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  updateExpense: (id: number, payload: ExpensePayload) =>
    request<{ data: Expense; message: string }>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExpense: (id: number) => request<{ message: string }>(`/expenses/${id}`, { method: 'DELETE' }),
  generalSettings: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/general-settings${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  createGeneralSetting: (payload: GeneralSettingPayload) =>
    request<{ data: unknown }>('/general-settings', { method: 'POST', body: generalSettingFormData(payload) }),
  updateGeneralSetting: (id: number, payload: GeneralSettingPayload) =>
    request<{ data: unknown }>(`/general-settings/${id}`, { method: 'POST', body: putForm(generalSettingFormData(payload)) }),
  emailLogs: (params: { page?: number; perPage?: number; search?: string; status?: string; recordType?: string; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<EmailLog>>(`/email-logs${queryString({
      page: params.page,
      per_page: params.perPage,
      search: params.search,
      status: params.status,
      record_type: params.recordType,
      from: params.from,
      to: params.to,
    })}`),
  smsLogs: (params: { page?: number; perPage?: number; search?: string; status?: string; recordType?: string; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<SmsLog>>(`/sms-logs${queryString({
      page: params.page,
      per_page: params.perPage,
      search: params.search,
      status: params.status,
      record_type: params.recordType,
      from: params.from,
      to: params.to,
    })}`),
  accountStatement: (id: number, params: { page?: number; perPage?: number; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<Payment>>(`/accounts/${id}/statement${queryString({ page: params.page, per_page: params.perPage, from: params.from, to: params.to })}`),
  customers: (params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/customers${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  customerOptions: () => request<{ data: unknown }>('/customers/options'),
  createCustomer: (payload: CustomerPayload) => request<{ data: unknown }>('/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: number, payload: CustomerPayload) => request<{ data: unknown }>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCustomer: (id: number) => request<{ message: string }>(`/customers/${id}`, { method: 'DELETE' }),
  customerStatement: (id: number, params: { page?: number; perPage?: number; from?: string; to?: string } = {}) =>
    request<PaginatedResponse<Payment>>(`/customers/${id}/statement${queryString({ page: params.page, per_page: params.perPage, from: params.from, to: params.to })}`),
  customerLedger: (id: number, params: { from?: string; to?: string } = {}) =>
    request<{ data: CustomerLedgerReport }>(`/customers/${id}/ledger${queryString({ from: params.from, to: params.to })}`),
  productOptions: () => request<{ data: unknown }>('/products/options'),
  products: (params: { page?: number; perPage?: number; search?: string; categoryId?: number; brandId?: number; status?: string; warehouseId?: number } = {}) =>
    request<PaginatedResponse<Product> & { summary: ProductSummary }>(`/products${queryString({ page: params.page, per_page: params.perPage, search: params.search, category_id: params.categoryId, brand_id: params.brandId, status: params.status, warehouse_id: params.warehouseId })}`),
  product: (id: number) => request<{ data: unknown }>(`/products/${id}`),
  productBarcode: (id: number, params: { variantId?: number | null } = {}) =>
    request<{ data: ProductBarcodeLabel }>(`/products/${id}/barcode${queryString({ variant_id: params.variantId })}`),
  productStocks: (params: { page?: number; perPage?: number; search?: string; warehouseId?: number; categoryId?: number } = {}) =>
    request<PaginatedResponse<unknown>>(`/product-stocks${queryString({ page: params.page, per_page: params.perPage, search: params.search, warehouse_id: params.warehouseId, category_id: params.categoryId })}`),
  profitReport: (params: { startDate?: string; endDate?: string; warehouseId?: number; search?: string } = {}) =>
    request<ProfitReport>(`/reports/profit${queryString({ start_date: params.startDate, end_date: params.endDate, warehouse_id: params.warehouseId, search: params.search })}`),
  profitReportDetail: (params: { metric: string; startDate?: string; endDate?: string; warehouseId?: number; search?: string }) =>
    request<ProfitReportDetail>(`/reports/profit/details${queryString({ metric: params.metric, start_date: params.startDate, end_date: params.endDate, warehouse_id: params.warehouseId, search: params.search })}`),
  exportProfitReportPdf: (params: { startDate?: string; endDate?: string; warehouseId?: number; search?: string } = {}) =>
    download(
      `/reports/profit/pdf${queryString({ start_date: params.startDate, end_date: params.endDate, warehouse_id: params.warehouseId, search: params.search })}`,
      `profit-report-${params.startDate ?? 'start'}-to-${params.endDate ?? 'end'}.pdf`
    ),
  datewiseProductReport: (params: { productId: number; startDate?: string; endDate?: string }) =>
    request<DatewiseProductReport>(`/reports/datewise-products${queryString({ product_id: params.productId, start_date: params.startDate, end_date: params.endDate })}`),
  exportDatewiseProductReportPdf: (params: { productId: number; startDate?: string; endDate?: string }) =>
    download(
      `/reports/datewise-products/pdf${queryString({ product_id: params.productId, start_date: params.startDate, end_date: params.endDate })}`,
      `datewise-product-report-${params.startDate ?? 'start'}-to-${params.endDate ?? 'end'}.pdf`
    ),
  productStockHistory: (productId: number, params: { page?: number; perPage?: number; search?: string } = {}) =>
    request<PaginatedResponse<unknown>>(`/products/${productId}/stock-history${queryString({ page: params.page, per_page: params.perPage, search: params.search })}`),
  exportProductStockHistory: (productId: number, search?: string) =>
    download(`/products/${productId}/stock-history${queryString({ export: 'csv', search })}`, `stock-history-${productId}.csv`),
  createStockAdjustment: (productId: number, payload: StockAdjustmentPayload) =>
    request<{ data: unknown; message: string }>(`/products/${productId}/stock-adjustments`, { method: 'POST', body: JSON.stringify(payload) }),
  createBatchStockAdjustment: (payload: BatchStockAdjustmentPayload) =>
    request<{ data: unknown; message: string }>('/stock-adjustments', { method: 'POST', body: batchStockAdjustmentFormData(payload) }),
  updateStockAdjustment: (movementId: number, payload: StockAdjustmentPayload) =>
    request<{ data: unknown; message: string }>(`/stock-adjustments/${movementId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStockAdjustment: (movementId: number) =>
    request<{ message: string }>(`/stock-adjustments/${movementId}`, { method: 'DELETE' }),
  transfers: (params: { page?: number; perPage?: number; search?: string; status?: 'all' | 'pending' | 'completed'; fromWarehouseId?: number | null; toWarehouseId?: number | null } = {}) =>
    request<PaginatedResponse<StockTransfer>>(`/transfers${queryString({
      page: params.page,
      per_page: params.perPage,
      search: params.search,
      status: params.status === 'all' ? undefined : params.status,
      from_warehouse_id: params.fromWarehouseId,
      to_warehouse_id: params.toWarehouseId,
    })}`),
  transfer: (id: number) => request<{ data: StockTransfer }>(`/transfers/${id}`),
  createTransfer: (payload: StockTransferPayload) =>
    request<{ data: StockTransfer; message: string }>('/transfers', { method: 'POST', body: stockTransferFormData(payload) }),
  updateTransfer: (id: number, payload: StockTransferPayload) =>
    request<{ data: StockTransfer; message: string }>(`/transfers/${id}`, { method: 'POST', body: putForm(stockTransferFormData(payload)) }),
  deleteTransfer: (id: number) => request<{ message: string }>(`/transfers/${id}`, { method: 'DELETE' }),
  clearDashboardTransactions: () =>
    request<{ message: string; output?: string }>('/dashboard/clear-transactions', { method: 'POST' }),
  checkBatchAvailability: (productId: number, batchNo: string, warehouseId: number) =>
    request<{ data: BatchAvailabilityResponse }>(
      `/check-batch-availability/${productId}/${encodeURIComponent(batchNo)}/${warehouseId}`
    ),
  createProduct: (payload: ProductPayload) => request<{ data: unknown }>('/products', { method: 'POST', body: productFormData(payload) }),
  updateProduct: (id: number, payload: ProductPayload) => request<{ data: unknown }>(`/products/${id}`, { method: 'POST', body: putForm(productFormData(payload)) }),
  deleteProduct: (id: number) => request<{ message: string }>(`/products/${id}`, { method: 'DELETE' }),
  purchaseStatuses: () => request<{ data: unknown[] }>('/purchase-statuses'),
  salesInvoices: (params: { page?: number; perPage?: number; search?: string; customerId?: number | null; approvedOnly?: boolean; approvalStatus?: 'pending' | 'approved' } = {}) =>
    request<PaginatedResponse<unknown>>(`/sales-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search, customer_id: params.customerId, approved_only: params.approvedOnly, approval_status: params.approvalStatus })}`),
  saleInvoiceOptions: (params: { search?: string; customerId?: number | null; perPage?: number; outstandingOnly?: boolean; approvedOnly?: boolean } = {}) =>
    request<PaginatedResponse<InvoiceOption>>(`/sales-invoices${queryString({ page: 1, per_page: params.perPage ?? 30, search: params.search, customer_id: params.customerId, outstanding_only: params.outstandingOnly, approved_only: params.approvedOnly })}`),
  salesInvoice: (id: number) => request<{ data: unknown }>(`/sales-invoices/${id}`),
  exportSalesInvoicePdf: (id: number, referenceNo?: string) =>
    download(`/sales-invoices/${id}/pdf`, `sales-invoice-${referenceNo || id}.pdf`),
  createSalesInvoice: (payload: SalesInvoicePayload) => request<{ data: unknown; message: string }>('/sales-invoices', { method: 'POST', body: salesInvoiceFormData(payload) }),
  updateSalesInvoice: (id: number, payload: SalesInvoicePayload) =>
    request<{ data: unknown; message: string }>(`/sales-invoices/${id}`, { method: 'POST', body: putForm(salesInvoiceFormData(payload)) }),
  updateSalesInvoiceLineCost: (invoiceId: number, lineId: number, unitCost: number) =>
    request<{ data: unknown; message: string }>(`/sales-invoices/${invoiceId}/lines/${lineId}/cost`, { method: 'PATCH', body: JSON.stringify({ unit_cost: unitCost }) }),
  approveSalesInvoice: (id: number) => request<{ data: unknown; message: string }>(`/sales-invoices/${id}/approve`, { method: 'POST' }),
  returnInvoices: (params: { page?: number; perPage?: number; search?: string; customerId?: number | null; approvedOnly?: boolean; approvalStatus?: 'pending' | 'approved' } = {}) =>
    request<PaginatedResponse<unknown>>(`/return-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search, customer_id: params.customerId, approved_only: params.approvedOnly, approval_status: params.approvalStatus })}`),
  returnInvoiceOptions: (params: { search?: string; customerId?: number | null; perPage?: number; approvedOnly?: boolean } = {}) =>
    request<PaginatedResponse<InvoiceOption>>(`/return-invoices${queryString({ page: 1, per_page: params.perPage ?? 30, search: params.search, customer_id: params.customerId, approved_only: params.approvedOnly })}`),
  returnInvoice: (id: number) => request<{ data: unknown }>(`/return-invoices/${id}`),
  createReturnInvoice: (payload: ReturnInvoicePayload) => request<{ data: unknown; message: string }>('/return-invoices', { method: 'POST', body: returnInvoiceFormData(payload) }),
  updateReturnInvoice: (id: number, payload: ReturnInvoicePayload) =>
    request<{ data: unknown; message: string }>(`/return-invoices/${id}`, { method: 'POST', body: putForm(returnInvoiceFormData(payload)) }),
  approveReturnInvoice: (id: number) => request<{ data: unknown; message: string }>(`/return-invoices/${id}/approve`, { method: 'POST' }),
  purchaseInvoices: (params: { page?: number; perPage?: number; search?: string; supplierId?: number | null; approvedOnly?: boolean; approvalStatus?: 'pending' | 'approved' } = {}) =>
    request<PaginatedResponse<unknown>>(`/purchase-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search, supplier_id: params.supplierId, approved_only: params.approvedOnly, approval_status: params.approvalStatus })}`),
  purchaseInvoiceOptions: (params: { search?: string; supplierId?: number | null; perPage?: number; outstandingOnly?: boolean; approvedOnly?: boolean } = {}) =>
    request<PaginatedResponse<InvoiceOption>>(`/purchase-invoices${queryString({ page: 1, per_page: params.perPage ?? 30, search: params.search, supplier_id: params.supplierId, outstanding_only: params.outstandingOnly, approved_only: params.approvedOnly })}`),
  purchaseInvoice: (id: number) => request<{ data: unknown }>(`/purchase-invoices/${id}`),
  exportPurchaseInvoicePdf: (id: number, referenceNo?: string) =>
    download(`/purchase-invoices/${id}/pdf`, `purchase-invoice-${referenceNo || id}.pdf`),
  createPurchaseInvoice: (payload: PurchaseInvoicePayload) => request<{ data: unknown; message: string }>('/purchase-invoices', { method: 'POST', body: purchaseInvoiceFormData(payload) }),
  updatePurchaseInvoice: (id: number, payload: PurchaseInvoicePayload) =>
    request<{ data: unknown; message: string }>(`/purchase-invoices/${id}`, { method: 'POST', body: putForm(purchaseInvoiceFormData(payload)) }),
  approvePurchaseInvoice: (id: number) => request<{ data: unknown; message: string }>(`/purchase-invoices/${id}/approve`, { method: 'POST' }),
  purchaseReturnInvoices: (params: { page?: number; perPage?: number; search?: string; supplierId?: number | null; approvedOnly?: boolean; approvalStatus?: 'pending' | 'approved' } = {}) =>
    request<PaginatedResponse<unknown>>(`/purchase-return-invoices${queryString({ page: params.page, per_page: params.perPage, search: params.search, supplier_id: params.supplierId, approved_only: params.approvedOnly, approval_status: params.approvalStatus })}`),
  purchaseReturnInvoiceOptions: (params: { search?: string; supplierId?: number | null; perPage?: number; approvedOnly?: boolean } = {}) =>
    request<PaginatedResponse<InvoiceOption>>(`/purchase-return-invoices${queryString({ page: 1, per_page: params.perPage ?? 30, search: params.search, supplier_id: params.supplierId, approved_only: params.approvedOnly })}`),
  purchaseReturnInvoice: (id: number) => request<{ data: unknown }>(`/purchase-return-invoices/${id}`),
  createPurchaseReturnInvoice: (payload: PurchaseReturnPayload) => request<{ data: unknown; message: string }>('/purchase-return-invoices', { method: 'POST', body: purchaseReturnFormData(payload) }),
  updatePurchaseReturnInvoice: (id: number, payload: PurchaseReturnPayload) =>
    request<{ data: unknown; message: string }>(`/purchase-return-invoices/${id}`, { method: 'POST', body: putForm(purchaseReturnFormData(payload)) }),
  approvePurchaseReturnInvoice: (id: number) => request<{ data: unknown; message: string }>(`/purchase-return-invoices/${id}/approve`, { method: 'POST' }),
  payments: (params: { page?: number; perPage?: number; customerId?: number | null; supplierId?: number | null; accountId?: number | null; paymentType?: PaymentType | 'all'; paymentTypes?: PaymentType[]; direction?: PaymentDirection | 'all' } = {}) =>
    request<PaginatedResponse<Payment>>(`/payments${queryString({
      page: params.page,
      per_page: params.perPage,
      customer_id: params.customerId,
      supplier_id: params.supplierId,
      account_id: params.accountId,
      payment_type: params.paymentType === 'all' ? undefined : params.paymentType,
      payment_types: params.paymentTypes?.join(','),
      direction: params.direction === 'all' ? undefined : params.direction,
    })}`),
  createPayment: (payload: PaymentPayload) =>
    request<{ data: Payment; message: string }>('/payments', { method: 'POST', body: JSON.stringify(payload) }),
  updatePayment: (id: number, payload: PaymentPayload) =>
    request<{ data: Payment; message: string }>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  payment: (id: number) => request<{ data: Payment }>(`/payments/${id}`),
  approvePayment: (id: number) => request<{ data: Payment; message: string }>(`/payments/${id}/approve`, { method: 'POST' }),
};
