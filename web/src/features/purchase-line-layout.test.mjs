import assert from 'node:assert/strict';
import test from 'node:test';

const { purchaseLineLayout = () => ({}) } = await import('./purchase-line-layout.ts').catch(() => ({}));

test('mixed standard and variant rows fit the twelve-column invoice grid', () => {
  const layout = purchaseLineLayout({ hasVariantLine: true, hasBatchLine: false, showReceived: false });
  const occupiedColumns = layout.product + layout.variant + 1 + 2 + layout.cost + layout.discount + 1 + 1;

  assert.deepEqual(layout, {
    product: 3,
    variant: 2,
    cost: 1,
    discount: 1,
  });
  assert.equal(occupiedColumns, 12);
});

test('standard-only rows keep their wider cost and discount fields', () => {
  assert.deepEqual(
    purchaseLineLayout({ hasVariantLine: false, hasBatchLine: false, showReceived: false }),
    { product: 3, variant: 0, cost: 2, discount: 2 }
  );
});
