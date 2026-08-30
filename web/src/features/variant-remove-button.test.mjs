import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { VariantRemoveButton = () => null } = await import('./variant-remove-button.ts').catch(() => ({}));

test('renders a visible and accessible remove-variant control', () => {
  const html = renderToStaticMarkup(createElement(VariantRemoveButton, { onRemove() {} }));

  assert.match(html, /aria-label="Remove variant"/);
  assert.match(html, />Remove<\/span>/);
  assert.match(html, /<svg/);
});
