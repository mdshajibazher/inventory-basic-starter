'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Barcode, Printer, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, type ProductBarcodeLabel } from '@/lib/api';
import type { Product, ProductVariant } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui';
import { EmptyState, TableWrap } from '@/components/resource-shell';

type ProductChoice = {
  key: string;
  productId: number;
  variantId?: number | null;
  label: string;
  detail: string;
};

type SelectedLabel = ProductBarcodeLabel & {
  key: string;
  quantity: number;
};

type PaperSize = '36' | '24' | '18';

const paperSizes: { value: PaperSize; label: string }[] = [
  { value: '36', label: '36 mm (1.4 inch)' },
  { value: '24', label: '24 mm (0.94 inch)' },
  { value: '18', label: '18 mm (0.7 inch)' },
];

export function PrintBarcodePage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<ProductChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [labels, setLabels] = useState<SelectedLabel[]>([]);
  const [paperSize, setPaperSize] = useState<PaperSize>('18');
  const [printName, setPrintName] = useState(true);
  const [printPrice, setPrintPrice] = useState(true);
  const [printPromoPrice, setPrintPromoPrice] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const expandedLabels = useMemo(() => labels.flatMap((label) => Array.from({ length: label.quantity }, () => label)), [labels]);

  useEffect(() => {
    if (!hasPermission('products-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setChoices([]);
      setSearching(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSearching(true);
      api.products({ page: 1, perPage: 20, search: trimmedQuery })
        .then((response) => {
          if (cancelled) return;
          setChoices(flattenProductChoices(response.data as Product[]));
        })
        .catch((error) => {
          if (!cancelled) toast.error('Product search failed', { description: errorMessage(error) });
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const addChoice = useCallback(async (choice: ProductChoice) => {
    if (labels.some((label) => label.key === choice.key)) {
      toast.error('Duplicate input is not allowed');
      return;
    }

    setAddingKey(choice.key);
    try {
      const response = await api.productBarcode(choice.productId, { variantId: choice.variantId });
      const label = response.data;

      if (labels.some((item) => item.code === label.code)) {
        toast.error('Duplicate input is not allowed');
        return;
      }

      setLabels((current) => [...current, { ...label, key: choice.key, quantity: 1 }]);
      setQuery('');
      setChoices([]);
    } catch (error) {
      toast.error('Barcode generation failed', { description: errorMessage(error) });
    } finally {
      setAddingKey(null);
    }
  }, [labels]);

  function submitPreview() {
    if (!labels.length) {
      toast.error('Add at least one product');
      return;
    }
    setPreviewOpen(true);
  }

  function printLabels() {
    const printWindow = window.open('', 'Print-Barcode');
    if (!printWindow) {
      toast.error('Print window blocked');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>Print Barcode</title>${printStyles(paperSize)}</head><body>${labelsHtml(expandedLabels, {
      paperSize,
      printName,
      printPrice,
      printPromoPrice,
    })}<script>window.onload=function(){window.print();setTimeout(function(){window.close();},100);};</script></body></html>`);
    printWindow.document.close();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Print Barcode</h1>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="mb-7 text-sm italic text-neutral-500">The field labels marked with * are required input fields.</p>

        <div className="max-w-2xl">
          <Field label="Add Product *">
            <div className="relative">
              <div className="flex">
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-l-md bg-neutral-400 text-white">
                  <Barcode className="h-6 w-6" />
                </div>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Please type product code and select..."
                  className="h-12 rounded-l-none"
                />
              </div>
              {query.trim() ? (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
                  {searching ? <div className="px-3 py-2 text-sm text-neutral-500">Searching products...</div> : null}
                  {!searching && choices.length === 0 ? <div className="px-3 py-2 text-sm text-neutral-500">No products found.</div> : null}
                  {choices.map((choice) => (
                    <button
                      key={choice.key}
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={addingKey === choice.key}
                      onClick={() => void addChoice(choice)}
                    >
                      <span className="font-medium">{choice.label}</span>
                      <span className="text-xs text-neutral-500">{choice.detail}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>
        </div>

        <div className="mt-8">
          <TableWrap>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white text-neutral-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="w-16 px-4 py-3 text-center font-medium"><Trash2 className="mx-auto h-4 w-4" /></th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label.key} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium">{label.name}</td>
                    <td className="px-4 py-3">{label.code}</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={1}
                        value={label.quantity}
                        onChange={(event) => updateQuantity(label.key, Number(event.target.value))}
                        className="w-28"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button type="button" variant="danger" className="h-9 w-9 px-0" aria-label={`Remove ${label.name}`} onClick={() => removeLabel(label.key)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {!labels.length ? <div className="mt-3"><EmptyState label="No products selected." /></div> : null}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <strong>Print:</strong>
          <label className="inline-flex items-center gap-2 font-semibold">
            <Checkbox checked={printName} onCheckedChange={setPrintName} />
            Product Name
          </label>
          <label className="inline-flex items-center gap-2 font-semibold">
            <Checkbox checked={printPrice} onCheckedChange={setPrintPrice} />
            Price
          </label>
          <label className="inline-flex items-center gap-2 font-semibold">
            <Checkbox checked={printPromoPrice} onCheckedChange={setPrintPromoPrice} />
            Promotional Price
          </label>
        </div>

        <div className="mt-6 max-w-md">
          <Field label="Paper Size *">
            <Select value={paperSize} onValueChange={(value) => setPaperSize(value as PaperSize)} options={paperSizes} />
          </Field>
        </div>

        <Button type="button" className="mt-6" onClick={submitPreview}>Submit</Button>
      </div>

      <Modal title="Barcode" open={previewOpen} onOpenChange={setPreviewOpen}>
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={printLabels}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
        <div className="overflow-x-auto">
          <LabelPreview labels={expandedLabels} paperSize={paperSize} printName={printName} printPrice={printPrice} printPromoPrice={printPromoPrice} />
        </div>
      </Modal>
    </div>
  );

  function updateQuantity(key: string, quantity: number) {
    setLabels((current) => current.map((label) => label.key === key ? { ...label, quantity: Math.max(1, Math.floor(quantity) || 1) } : label));
  }

  function removeLabel(key: string) {
    setLabels((current) => current.filter((label) => label.key !== key));
  }
}

function LabelPreview({
  labels,
  paperSize,
  printName,
  printPrice,
  printPromoPrice,
}: {
  labels: SelectedLabel[];
  paperSize: PaperSize;
  printName: boolean;
  printPrice: boolean;
  printPromoPrice: boolean;
}) {
  return (
    <table className="barcode-list border-separate border-spacing-2" style={{ width: 378 }}>
      <tbody>
        {chunk(labels, 2).map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((label, index) => (
              <td key={`${label.key}-${rowIndex}-${index}`} style={labelPreviewStyle(paperSize)}>
                {printName ? <><span>{label.name}</span><br /></> : null}
                <img className="mx-auto max-w-[150px]" src={barcodeDataUrl(label)} alt={label.code} />
                <span>{label.code}</span>
                {priceLine(label, { printPrice, printPromoPrice })}
              </td>
            ))}
            {row.length === 1 ? <td style={labelPreviewStyle(paperSize)} /> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function flattenProductChoices(products: Product[]): ProductChoice[] {
  return products.flatMap((product) => {
    if (product.variants?.length) {
      return product.variants.map((variant) => choiceForVariant(product, variant));
    }

    return [{
      key: productKey(product.id),
      productId: product.id,
      variantId: null,
      label: `${product.code} (${product.name})`,
      detail: `Price ${money(product.price)} | ${product.barcode_symbology}`,
    }];
  });
}

function choiceForVariant(product: Product, variant: ProductVariant): ProductChoice {
  const variantName = variant.name ? ` - ${variant.name}` : '';

  return {
    key: productKey(product.id, variant.id),
    productId: product.id,
    variantId: variant.id,
    label: `${variant.item_code} (${product.name}${variantName})`,
    detail: `Price ${money(Number(product.price) + Number(variant.additional_price ?? 0))} | ${product.barcode_symbology}`,
  };
}

function productKey(productId: number, variantId?: number | null) {
  return `${productId}:${variantId ?? 'base'}`;
}

function priceLine(label: SelectedLabel, options: { printPrice: boolean; printPromoPrice: boolean }) {
  if (options.printPromoPrice && label.promotion_price !== null && label.promotion_price !== undefined && label.promotion_price !== '') {
    return (
      <>
        <br />
        <span>Price: <span className="line-through">{formatMoney(label.price, label)}</span> {formatMoney(label.promotion_price, label)}</span>
      </>
    );
  }

  if (!options.printPrice) return null;

  return (
    <>
      <br />
      <span>Price: {formatMoney(label.price, label)}</span>
    </>
  );
}

function labelsHtml(labels: SelectedLabel[], options: { paperSize: PaperSize; printName: boolean; printPrice: boolean; printPromoPrice: boolean }) {
  const rows = chunk(labels, 2).map((row) => {
    const cells = row.map((label) => labelHtml(label, options)).join('');
    return `<tr>${cells}${row.length === 1 ? '<td></td>' : ''}</tr>`;
  }).join('');

  return `<table class="barcode-list">${rows}</table>`;
}

function labelHtml(label: SelectedLabel, options: { paperSize: PaperSize; printName: boolean; printPrice: boolean; printPromoPrice: boolean }) {
  const name = options.printName ? `${escapeHtml(label.name)}<br>` : '';
  const price = priceHtml(label, options);

  return `<td>${name}<img src="${escapeHtml(barcodeDataUrl(label))}" alt="${escapeHtml(label.code)}"><br>${escapeHtml(label.code)}${price}</td>`;
}

function priceHtml(label: SelectedLabel, options: { printPrice: boolean; printPromoPrice: boolean }) {
  if (options.printPromoPrice && label.promotion_price !== null && label.promotion_price !== undefined && label.promotion_price !== '') {
    return `<br>Price: <span style="text-decoration:line-through;">${escapeHtml(formatMoney(label.price, label))}</span> ${escapeHtml(formatMoney(label.promotion_price, label))}`;
  }

  if (!options.printPrice) return '';

  return `<br>Price: ${escapeHtml(formatMoney(label.price, label))}`;
}

function printStyles(paperSize: PaperSize) {
  return `<style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
    table.barcode-list { width: 378px; border-collapse: separate; border-spacing: 10px; page-break-inside: auto; }
    table.barcode-list tr { page-break-inside: avoid; page-break-after: auto; }
    table.barcode-list td { ${labelStyle(paperSize)} }
    table.barcode-list img { display: block; max-width: 150px; margin: 0 auto; }
    @page { size: landscape; margin: 0; }
  </style>`;
}

function labelStyle(paperSize: PaperSize) {
  if (paperSize === '36') return 'width:164px;height:88%;padding-top:7px;vertical-align:middle;text-align:center;font-size:12px;line-height:20px;';
  if (paperSize === '24') return 'width:164px;height:100%;vertical-align:middle;text-align:center;font-size:12px;line-height:20px;';
  return 'width:164px;height:100%;vertical-align:middle;text-align:center;font-size:10px;line-height:16px;';
}

function labelPreviewStyle(paperSize: PaperSize): CSSProperties {
  return {
    width: 164,
    height: paperSize === '36' ? '88%' : '100%',
    paddingTop: paperSize === '36' ? 7 : 0,
    verticalAlign: 'middle',
    textAlign: 'center',
    fontSize: paperSize === '18' ? 10 : 12,
    lineHeight: paperSize === '18' ? '16px' : '20px',
  };
}

function formatMoney(value: number | string | null | undefined, label?: Pick<SelectedLabel, 'currency' | 'currency_position'>) {
  const number = Number(value ?? 0);
  const amount = Number.isFinite(number) ? number.toFixed(2) : String(value ?? '');
  const currency = label?.currency;

  if (!currency) return amount;

  return label?.currency_position === 'suffix' ? `${amount} ${currency}` : `${currency} ${amount}`;
}

function barcodeDataUrl(label: Pick<SelectedLabel, 'barcode_image' | 'barcode_mime'>) {
  return `data:${label.barcode_mime || 'image/png'};base64,${label.barcode_image}`;
}

function money(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toFixed(2) : String(value ?? '');
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char] ?? char));
}
