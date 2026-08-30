type PurchaseVariantLabelInput = {
  name?: unknown;
  item_code?: unknown;
};

export function purchaseVariantLabel(variant: PurchaseVariantLabelInput) {
  const name = typeof variant.name === 'string' ? variant.name.trim() : '';
  const itemCode = typeof variant.item_code === 'string' ? variant.item_code.trim() : '';

  if (name && itemCode) return `${name} (${itemCode})`;

  return name || itemCode || 'Unknown variant';
}
