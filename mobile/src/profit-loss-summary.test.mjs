import assert from 'node:assert/strict';
import test from 'node:test';

const summary = await import('./profit-loss-summary.ts').catch(() => ({}));

test('reports negative profit values as positive loss amounts', () => {
  assert.equal(summary.lossAmount?.(-425.5), 425.5);
});

test('reports zero loss when the result is profitable or missing', () => {
  assert.equal(summary.lossAmount?.(125), 0);
  assert.equal(summary.lossAmount?.(0), 0);
  assert.equal(summary.lossAmount?.(undefined), 0);
});

test('combines sales and purchase return costs into the COGS reduction', () => {
  assert.equal(summary.cogsReduction?.({ return_cost: 8, purchase_return_cost: 6 }), 14);
});

test('treats missing COGS return costs as zero', () => {
  assert.equal(summary.cogsReduction?.(undefined), 0);
  assert.equal(summary.cogsReduction?.({ return_cost: 8 }), 8);
});
