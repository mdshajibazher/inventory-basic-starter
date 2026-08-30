import assert from 'node:assert/strict';
import test from 'node:test';

const labels = await import('./purchase-variant-label.ts').catch(() => ({}));

test('formats purchase variant names and item codes without undefined text', () => {
  assert.equal(
    labels.purchaseVariantLabel?.({ name: 'Red XL', item_code: '75907281-RED-XL' }),
    'Red XL (75907281-RED-XL)'
  );
  assert.equal(
    labels.purchaseVariantLabel?.({ item_code: '75907281-RED-XL' }),
    '75907281-RED-XL'
  );
  assert.equal(labels.purchaseVariantLabel?.({}), 'Unknown variant');
});
