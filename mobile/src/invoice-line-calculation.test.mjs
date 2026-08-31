import assert from 'node:assert/strict';
import test from 'node:test';

const calculation = await import('./invoice-line-calculation.ts').catch(() => ({}));

test('exclusive tax is added to the entered unit price', () => {
  assert.deepEqual(calculation.calculateInvoiceLine?.({ unitPrice: 100, qty: 1, discount: 0, taxRate: 10, taxMethod: 1 }), {
    qty: 1,
    unitPrice: 100,
    discount: 0,
    taxRate: 10,
    taxMethod: 1,
    netUnitPrice: 100,
    tax: 10,
    subtotal: 110,
  });
});

test('inclusive tax is extracted from the entered unit price', () => {
  assert.deepEqual(calculation.calculateInvoiceLine?.({ unitPrice: 100, qty: 1, discount: 0, taxRate: 10, taxMethod: 2 }), {
    qty: 1,
    unitPrice: 100,
    discount: 0,
    taxRate: 10,
    taxMethod: 2,
    netUnitPrice: 90.91,
    tax: 9.09,
    subtotal: 100,
  });
});

test('inclusive tax keeps quantity and line discount inside the entered total', () => {
  const result = calculation.calculateInvoiceLine?.({ unitPrice: 100, qty: 2, discount: 20, taxRate: 10, taxMethod: 2 });
  assert.equal(result?.netUnitPrice, 91.82);
  assert.equal(result?.tax, 16.36);
  assert.equal(result?.subtotal, 180);
});

test('inclusive tax rate cannot be edited from an invoice line', () => {
  assert.equal(calculation.invoiceTaxRateEditable?.(2), false);
});

test('exclusive and legacy tax rates remain editable from an invoice line', () => {
  assert.equal(calculation.invoiceTaxRateEditable?.(1), true);
  assert.equal(calculation.invoiceTaxRateEditable?.(null), true);
});
