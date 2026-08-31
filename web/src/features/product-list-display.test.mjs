import assert from 'node:assert/strict';
import test from 'node:test';

const display = await import('./product-list-display.ts').catch(() => ({}));

test('formats product list values consistently', () => {
  assert.equal(display.productTaxLabel?.({ name: 'VAT', rate: '15.00' }), 'VAT (15%)');
  assert.equal(display.productTaxLabel?.(null), 'No Tax');
  assert.equal(display.productTaxMethodLabel?.(1), 'Exclusive');
  assert.equal(display.productTaxMethodLabel?.(2), 'Inclusive');
  assert.equal(display.productTaxMethodLabel?.(null), 'N/A');
  assert.equal(display.productTaxMethodLabel?.(99), 'N/A');
  assert.equal(display.productUnitLabel?.({ unit_name: 'Piece', unit_code: 'pc' }), 'Piece');
  assert.equal(display.productUnitLabel?.(null), 'N/A');
  assert.equal(display.productVariantLabel?.(1), 'Yes');
  assert.equal(display.productVariantLabel?.(false), 'No');
});

test('assigns stable badge tones within the available palette', () => {
  const first = display.productBadgeTone?.('standard', 6);
  assert.equal(first, display.productBadgeTone?.('standard', 6));
  assert.ok(Number.isInteger(first));
  assert.ok(first >= 0 && first < 6);
});
