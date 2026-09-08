import type { Payment } from '@/lib/types';

export type PaymentListFilters = {
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
};

export const defaultPaymentListFilters: PaymentListFilters = {
  searchTerm: '',
  dateFrom: '',
  dateTo: '',
};

export function filterPayments(payments: Payment[], filters: PaymentListFilters): Payment[] {
  const query = filters.searchTerm.trim().toLowerCase();

  return payments.filter((payment) => {
    if (query) {
      const haystack = [
        payment.payment_reference,
        payment.customer?.name,
        payment.supplier?.name,
        payment.account?.name,
        payment.payment_type.replaceAll('_', ' '),
        payment.reference_document?.reference_no,
        payment.sale?.reference_no,
        payment.purchase?.reference_no,
        payment.sale_return?.reference_no,
        payment.purchase_return?.reference_no,
      ].filter(Boolean).join(' ').toLowerCase();

      if (!haystack.includes(query)) return false;
    }

    const paymentDate = String(payment.created_at ?? payment.updated_at ?? '').slice(0, 10);
    if (filters.dateFrom && paymentDate && paymentDate < filters.dateFrom) return false;
    if (filters.dateTo && paymentDate && paymentDate > filters.dateTo) return false;

    return true;
  });
}
