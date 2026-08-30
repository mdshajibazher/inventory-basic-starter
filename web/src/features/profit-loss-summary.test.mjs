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
