import assert from 'node:assert/strict';
import test from 'node:test';

const display = await import('./payment-list-display.ts').catch(() => ({}));

const payments = [
  {
    id: 1,
    payment_reference: 'PAY-JULY',
    payment_type: 'sale_payment',
    direction: 'in',
    amount: 100,
    paying_method: 'Cash',
    account_id: 1,
    customer: { id: 1, name: 'July Customer' },
    created_at: '2026-07-15T08:00:00.000000Z',
  },
  {
    id: 2,
    payment_reference: 'PAY-SEPTEMBER',
    payment_type: 'customer_advance',
    direction: 'in',
    amount: 200,
    paying_method: 'Cash',
    account_id: 1,
    customer: { id: 2, name: 'September Customer' },
    created_at: '2026-09-01T05:26:53.000000Z',
  },
];

test('keeps every fetched payment when optional date filters are empty', () => {
  const fallbackStaleDefaults = {
    searchTerm: '',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
  };
  const result = display.filterPayments?.(
    payments,
    display.defaultPaymentListFilters ?? fallbackStaleDefaults
  ) ?? [];

  assert.deepEqual(result.map((payment) => payment.id), [1, 2]);
});

test('applies explicit date boundaries inclusively', () => {
  const result = display.filterPayments?.(payments, {
    searchTerm: '',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-01',
  }) ?? [];

  assert.deepEqual(result.map((payment) => payment.id), [2]);
});

test('matches payment references and customer names case-insensitively', () => {
  const byReference = display.filterPayments?.(payments, {
    searchTerm: 'september',
    dateFrom: '',
    dateTo: '',
  }) ?? [];
  const byCustomer = display.filterPayments?.(payments, {
    searchTerm: 'JULY CUSTOMER',
    dateFrom: '',
    dateTo: '',
  }) ?? [];

  assert.deepEqual(byReference.map((payment) => payment.id), [2]);
  assert.deepEqual(byCustomer.map((payment) => payment.id), [1]);
});

test('keeps payment type labels searchable', () => {
  const result = display.filterPayments?.(payments, {
    searchTerm: 'sale payment',
    dateFrom: '',
    dateTo: '',
  }) ?? [];

  assert.deepEqual(result.map((payment) => payment.id), [1]);
});
