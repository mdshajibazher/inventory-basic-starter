type PurchaseReceivedLine = {
  qty: number;
  received: number;
};

export function partialReceivedError(lines: PurchaseReceivedLine[]) {
  const negativeIndex = lines.findIndex((line) => line.received < 0);
  if (negativeIndex >= 0) return `Line ${negativeIndex + 1} received quantity cannot be negative.`;

  const overReceivedIndex = lines.findIndex((line) => line.received > line.qty);
  if (overReceivedIndex >= 0) return `Line ${overReceivedIndex + 1} received quantity cannot exceed ordered quantity.`;

  if (!lines.some((line) => line.received > 0)) {
    return 'For partial purchases, at least one line must have a received quantity greater than zero.';
  }

  if (!lines.some((line) => line.received < line.qty)) {
    return 'For partial purchases, at least one line must have a received quantity less than ordered quantity.';
  }

  return null;
}
