import type { PaymentType } from '@/lib/types';

export type PaymentPartyKind = 'customer' | 'supplier';

export function initialPaymentType(partyKind: PaymentPartyKind): PaymentType {
  return partyKind === 'customer' ? 'customer_advance' : 'purchase_payment';
}

export function canChoosePaymentType(partyKind: PaymentPartyKind): boolean {
  return partyKind === 'supplier';
}

export function selectablePaymentTypes(partyKind: PaymentPartyKind): PaymentType[] {
  return partyKind === 'customer'
    ? ['customer_advance']
    : ['purchase_payment', 'supplier_advance'];
}

export function canEditPaymentType(partyKind: PaymentPartyKind, paymentType: PaymentType): boolean {
  return selectablePaymentTypes(partyKind).includes(paymentType);
}
