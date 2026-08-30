import assert from 'node:assert/strict';
import test from 'node:test';

const { filterMenuGroups = () => [] } = await import('./menu-search.ts').catch(() => ({}));

const groups = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/products', label: 'Products' },
    ],
  },
  {
    label: 'Payments',
    items: [{ href: '/payments/supplier', label: 'Supplier Payments' }],
  },
  {
    label: 'People',
    items: [{ href: '/customers', label: 'Customers' }],
  },
];

test('filters menu items case-insensitively and removes empty groups', () => {
  assert.deepEqual(filterMenuGroups(groups, 'SUPPLIER'), [
    {
      label: 'Payments',
      items: [{ href: '/payments/supplier', label: 'Supplier Payments' }],
    },
  ]);
});

test('removes empty menu groups when the search is blank', () => {
  assert.deepEqual(filterMenuGroups([
    { label: null, items: [{ href: '/dashboard', label: 'Dashboard' }] },
    { label: 'Payments', items: [] },
  ], '  '), [
    { label: null, items: [{ href: '/dashboard', label: 'Dashboard' }] },
  ]);
});
