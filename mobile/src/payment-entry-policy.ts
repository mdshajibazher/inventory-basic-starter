import type { PaymentType } from './types';

export type PaymentPartyKind = 'customer' | 'supplier';

export function initialPaymentType(partyKind: PaymentPartyKind): PaymentType {
  return partyKind === 'customer' ? 'customer_advance' : 'supplier_advance';
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
