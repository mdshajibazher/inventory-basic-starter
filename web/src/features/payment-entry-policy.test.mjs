import assert from 'node:assert/strict';
import test from 'node:test';

const policy = await import('./payment-entry-policy.ts').catch(() => ({}));

test('customer payment entry is fixed to customer advance', () => {
  assert.equal(policy.initialPaymentType?.('customer'), 'customer_advance');
  assert.equal(policy.canChoosePaymentType?.('customer'), false);
});

test('supplier payment entry offers only supported manual payment types', () => {
  assert.equal(policy.initialPaymentType?.('supplier'), 'purchase_payment');
  assert.equal(policy.canChoosePaymentType?.('supplier'), true);
  assert.deepEqual(policy.selectablePaymentTypes?.('supplier'), [
    'purchase_payment',
    'supplier_advance',
  ]);
});

test('legacy invoice and refund types are view-only when manual entry no longer supports them', () => {
  assert.equal(policy.canEditPaymentType?.('customer', 'customer_advance'), true);
  assert.equal(policy.canEditPaymentType?.('customer', 'sale_payment'), false);
  assert.equal(policy.canEditPaymentType?.('customer', 'sale_return_refund'), false);
  assert.equal(policy.canEditPaymentType?.('supplier', 'purchase_payment'), true);
  assert.equal(policy.canEditPaymentType?.('supplier', 'purchase_return_refund'), false);
});
