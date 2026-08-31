export type InvoiceTaxMethod = 1 | 2;

export type InvoiceLineCalculationInput = {
  unitPrice: number;
  qty: number;
  discount: number;
  taxRate: number;
  taxMethod?: number | null;
};

export function invoiceTaxRateEditable(taxMethod?: number | null) {
  return taxMethod !== 2;
}

export function calculateInvoiceLine(input: InvoiceLineCalculationInput) {
  const qty = positive(input.qty);
  const unitPrice = positive(input.unitPrice);
  const discount = positive(input.discount);
  const taxRate = positive(input.taxRate);
  const taxMethod: InvoiceTaxMethod = input.taxMethod === 2 ? 2 : 1;
  const enteredTotal = Math.max(0, unitPrice * qty - discount);
  const netTotal = taxMethod === 2 && taxRate > 0
    ? enteredTotal * 100 / (100 + taxRate)
    : enteredTotal;
  const tax = round2(taxMethod === 2 ? enteredTotal - netTotal : netTotal * taxRate / 100);
  const subtotal = round2(taxMethod === 2 ? enteredTotal : netTotal + tax);
  const netUnitPrice = qty > 0 ? round2((netTotal + discount) / qty) : 0;

  return { qty, unitPrice, discount, taxRate, taxMethod, netUnitPrice, tax, subtotal };
}

function positive(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
