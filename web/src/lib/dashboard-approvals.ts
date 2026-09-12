export type ApprovalType = 'sales' | 'returns' | 'purchases' | 'purchase_returns' | 'payments';
export type ApprovalSection = { type: ApprovalType; title: string; modulePermissions: string[]; approvalPermission: string };

export const approvalSections: ApprovalSection[] = [
  { type: 'sales', title: 'Sales invoices', modulePermissions: ['sales-index', 'sales-edit'], approvalPermission: 'approvals-sales-invoice' },
  { type: 'returns', title: 'Sales returns', modulePermissions: ['returns-index', 'returns-edit', 'returns-show'], approvalPermission: 'approvals-sales-return-invoice' },
  { type: 'purchases', title: 'Purchase invoices', modulePermissions: ['purchases-index', 'purchases-edit'], approvalPermission: 'approvals-purchase-invoice' },
  { type: 'purchase_returns', title: 'Purchase returns', modulePermissions: ['purchases-index', 'purchases-edit'], approvalPermission: 'approvals-purchase-return-invoice' },
  { type: 'payments', title: 'Payments', modulePermissions: ['sales-index', 'purchases-index', 'accounts-index'], approvalPermission: 'approvals-payments' },
];

export function canViewApprovalSection(permissions: string[], section: ApprovalSection): boolean {
  return permissions.includes(section.approvalPermission) && section.modulePermissions.some(permission => permissions.includes(permission));
}

export type PendingApprovalRecord = {
  id: number;
  reference_no?: string;
  payment_reference?: string;
  sale_date?: string | null;
  return_date?: string | null;
  purchase_date?: string | null;
  created_at?: string | null;
  grand_total?: string | number;
  amount?: string | number;
  payment_type?: string;
  direction?: string;
  customer?: { name: string } | null;
  supplier?: { name: string } | null;
  account?: { name: string } | null;
  approval_status: string;
  can_approve: boolean;
};
export type ApprovalRow = {
  id: number;
  reference: string;
  date: string;
  party: string;
  amount: string | number;
  paymentType?: string;
  direction?: string;
  account?: string;
  canApprove: boolean;
};
const paymentLabels: Record<string, string> = {
  sale_payment: 'Sales payment', customer_advance: 'Customer advance', purchase_payment: 'Purchase payment',
  supplier_advance: 'Supplier advance', sale_return_refund: 'Sales return refund', purchase_return_refund: 'Purchase return refund',
};
export function approvalRow(type: ApprovalType, record: PendingApprovalRecord): ApprovalRow {
  const payment = type === 'payments';
  return {
    id: record.id,
    reference: (payment ? record.payment_reference : record.reference_no) || `#${record.id}`,
    date: (record.sale_date || record.return_date || record.purchase_date || record.created_at || '').slice(0, 10),
    party: record.customer?.name || record.supplier?.name || '—',
    amount: (payment ? record.amount : record.grand_total) ?? 0,
    paymentType: payment ? paymentLabels[record.payment_type ?? ''] || record.payment_type || '—' : undefined,
    direction: payment ? record.direction === 'in' ? 'Money in' : record.direction === 'out' ? 'Money out' : '—' : undefined,
    account: record.account?.name || '—',
    canApprove: record.can_approve === true && record.approval_status === 'pending',
  };
}
export function approvalDetailPath(type: ApprovalType, id: number): string {
  const paths: Record<ApprovalType, string> = { sales: 'sales-invoices', returns: 'return-invoices', purchases: 'purchase-invoices', purchase_returns: 'purchase-return-invoices', payments: 'payments' };
  return `/${paths[type]}/${id}`;
}
