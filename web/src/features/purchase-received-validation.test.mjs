import assert from 'node:assert/strict';
import test from 'node:test';

const validation = await import('./purchase-received-validation.ts').catch(() => ({}));

test('accepts partial purchases with mixed incomplete and fully received lines', () => {
  assert.equal(validation.partialReceivedError?.([
    { qty: 10, received: 5 },
    { qty: 10, received: 10 },
  ]), null);
});

test('rejects partial purchases with no received quantity', () => {
  assert.equal(
    validation.partialReceivedError?.([{ qty: 10, received: 0 }]),
    'For partial purchases, at least one line must have a received quantity greater than zero.'
  );
});

test('rejects partial purchases when every line is fully received', () => {
  assert.equal(
    validation.partialReceivedError?.([
      { qty: 10, received: 10 },
      { qty: 5, received: 5 },
    ]),
    'For partial purchases, at least one line must have a received quantity less than ordered quantity.'
  );
});

test('identifies a partial purchase line received above its ordered quantity', () => {
  assert.equal(
    validation.partialReceivedError?.([{ qty: 10, received: 11 }]),
    'Line 1 received quantity cannot exceed ordered quantity.'
  );
});

test('identifies a negative received quantity', () => {
  assert.equal(
    validation.partialReceivedError?.([{ qty: 10, received: -1 }]),
    'Line 1 received quantity cannot be negative.'
  );
});
