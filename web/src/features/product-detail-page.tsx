'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Package, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ActivityLogTimeline } from '@/components/activity-log';
import { StatusBadge } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export function ProductDetailPage({ productId }: { productId: number }) {
  const { hasPermission } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.product(productId)
      .then((response) => {
        if (!cancelled) setProduct(response.data as Product);
      })
      .catch((error) => {
        if (!cancelled) toast.error('Unable to load product', { description: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product Details</h1>
          <p className="mt-1 text-sm text-neutral-500">{product ? `${product.name} · ${product.code}` : 'Loading product record'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product && hasPermission('products-edit') ? (
            <Link className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" href={`/products/${product.id}/edit`} aria-label="Edit product" title="Edit product"><Pencil className="h-4 w-4" /></Link>
          ) : null}
          <Link className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium hover:bg-neutral-50" href="/products">Back</Link>
        </div>
      </div>

      {loading ? <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading product...</div> : null}

      {product ? (
        <>
          <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <ProductImage src={product.image_url ?? product.image} alt={product.name} />
            </div>
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">{product.name}</h2>
                  <div className="mt-1 text-sm text-neutral-500">{product.type} · {product.barcode_symbology}</div>
                </div>
                <StatusBadge active={product.is_active} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Summary label="Code" value={product.code} />
                <Summary label="Brand" value={product.brand?.title ?? '-'} />
                <Summary label="Category" value={product.category?.name ?? '-'} />
                <Summary label="Current Stock" value={quantity(product.qty ?? product.quantity)} strong />
                <Summary label="Cost" value={money(product.cost)} />
                <Summary label="Base Unit Price" value={money(product.price)} strong />
                <Summary label="Alert Quantity" value={product.alert_quantity == null ? '-' : quantity(product.alert_quantity)} />
                <Summary label="Tax" value={product.tax ? `${product.tax.name} (${product.tax.rate}%)` : '-'} />
                <Summary label="Base Unit" value={product.unit?.unit_name ?? '-'} />
                <Summary label="Sale Unit" value={product.sale_unit?.unit_name ?? '-'} />
                <Summary label="Purchase Unit" value={product.purchase_unit?.unit_name ?? '-'} />
                <Summary label="Featured" value={product.featured ? 'Yes' : 'No'} />
              </div>
              {product.product_details ? <div className="border-t border-neutral-100 pt-3 text-sm text-neutral-600">{product.product_details}</div> : null}
            </div>
          </section>

          {product.promotion ? (
            <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-3">
              <Summary label="Promotion Price" value={money(product.promotion_price)} strong />
              <Summary label="Starts" value={product.starting_date ?? '-'} />
              <Summary label="Ends" value={product.last_date ?? '-'} />
            </section>
          ) : null}

          <DetailTable title="Variants" empty="No variants configured." headers={['Name', 'Item Code', 'Additional Price', 'Qty']}>
            {(product.variants ?? []).map((variant) => (
              <tr key={variant.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">{variant.name}</td>
                <td className="px-3 py-2">{variant.item_code}</td>
                <td className="px-3 py-2">{money(variant.additional_price)}</td>
                <td className="px-3 py-2">{quantity(variant.qty)}</td>
              </tr>
            ))}
          </DetailTable>

          <DetailTable title="Warehouse Stock" empty="No warehouse stock recorded." headers={['Warehouse', 'Batch', 'Expiry', 'Qty', 'Price']}>
            {(product.warehouse_prices ?? []).map((warehousePrice, index) => (
              <tr key={`${warehousePrice.warehouse_id}-${warehousePrice.variant_id ?? 'base'}-${warehousePrice.product_batch_id ?? index}`} className="border-t border-neutral-100">
                <td className="px-3 py-2">{warehousePrice.warehouse_name ?? `Warehouse ${warehousePrice.warehouse_id}`}</td>
                <td className="px-3 py-2">{warehousePrice.batch_no ?? '-'}</td>
                <td className="px-3 py-2">{warehousePrice.expired_date ?? '-'}</td>
                <td className="px-3 py-2">{quantity(warehousePrice.qty)}</td>
                <td className="px-3 py-2">{warehousePrice.price == null ? '-' : money(warehousePrice.price)}</td>
              </tr>
            ))}
          </DetailTable>

          <ActivityLogTimeline logs={product.activity_logs ?? []} />
        </>
      ) : null}
    </div>
  );
}

function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-400">
        <div className="grid justify-items-center gap-2">
          <Package className="h-10 w-10" />
          <span className="text-sm font-medium text-neutral-500">Product image</span>
        </div>
      </div>
    );
  }

  return <img src={src} alt={alt} className="aspect-square w-full rounded-md border border-neutral-200 object-cover" onError={() => setFailed(true)} />;
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className={strong ? 'text-base font-semibold text-neutral-950' : 'text-sm font-medium text-neutral-900'}>{value}</div>
    </div>
  );
}

function DetailTable({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;

  return (
    <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
      {rows ? (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">{empty}</div>
      )}
    </section>
  );
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quantity(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
