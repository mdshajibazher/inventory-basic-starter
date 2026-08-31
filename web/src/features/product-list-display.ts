type TaxLike = {
  name?: string | null;
  rate?: string | number | null;
};

type UnitLike = {
  unit_name?: string | null;
  unit_code?: string | null;
};

export function productTaxLabel(tax?: TaxLike | null) {
  if (!tax?.name) return 'No Tax';

  const rate = Number(tax.rate);
  return Number.isFinite(rate) ? `${tax.name} (${rate}%)` : tax.name;
}

export function productTaxMethodLabel(value: number | null | undefined) {
  if (value === 1) return 'Exclusive';
  if (value === 2) return 'Inclusive';

  return 'N/A';
}

export function productUnitLabel(unit?: UnitLike | null) {
  return unit?.unit_name?.trim() || unit?.unit_code?.trim() || 'N/A';
}

export function productVariantLabel(value: unknown) {
  return value === true || value === 1 || value === '1' ? 'Yes' : 'No';
}

export function productBadgeTone(label: string, paletteSize: number) {
  const size = Math.max(1, Math.floor(paletteSize));
  const normalizedLabel = label.trim().toLocaleLowerCase();

  return Array.from(normalizedLabel).reduce(
    (tone, character) => (tone + character.codePointAt(0)!) % size,
    0
  );
}
