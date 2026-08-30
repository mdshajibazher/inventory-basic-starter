export function purchaseLineLayout({
  hasVariantLine,
  hasBatchLine,
  showReceived,
}: {
  hasVariantLine: boolean;
  hasBatchLine: boolean;
  showReceived: boolean;
}) {
  const useCompactMoneyFields = hasVariantLine || hasBatchLine || showReceived;

  return {
    product: 3,
    variant: hasVariantLine ? 2 : 0,
    cost: useCompactMoneyFields ? 1 : 2,
    discount: useCompactMoneyFields ? 1 : 2,
  };
}
