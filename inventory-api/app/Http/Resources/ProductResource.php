<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'sku' => $this->code,
            'type' => $this->type,
            'barcode_symbology' => $this->barcode_symbology,
            'brand_id' => $this->brand_id,
            'category_id' => $this->category_id,
            'unit_id' => $this->unit_id,
            'unit_id_locked' => $this->unitIdLocked(),
            'purchase_unit_id' => $this->purchase_unit_id,
            'sale_unit_id' => $this->sale_unit_id,
            'cost' => $this->cost,
            'purchase_price' => $this->cost,
            'price' => $this->price,
            'selling_price' => $this->price,
            'qty' => $this->qty,
            'quantity' => $this->qty,
            'alert_quantity' => $this->alert_quantity,
            'low_stock_limit' => $this->alert_quantity,
            'promotion' => $this->promotion,
            'promotion_price' => $this->promotion_price,
            'starting_date' => $this->starting_date?->toDateString(),
            'last_date' => $this->last_date?->toDateString(),
            'tax_id' => $this->tax_id,
            'tax_method' => $this->tax_method,
            'image' => $this->image,
            'image_url' => $this->image ? $this->imageUrl($request, $this->primaryImage()) : null,
            'file' => $this->file,
            'featured' => $this->featured,
            'product_details' => $this->product_details,
            'description' => $this->product_details,
            'product_list' => $this->product_list,
            'qty_list' => $this->qty_list,
            'price_list' => $this->price_list,
            'is_variant' => $this->is_variant,
            'is_batch' => $this->is_batch,
            'is_diffPrice' => $this->is_diffPrice,
            'is_active' => $this->is_active,
            'variants' => $this->whenLoaded('variants', fn () => $this->variants->map(fn ($productVariant) => [
                'id' => $productVariant->id,
                'variant_id' => $productVariant->variant_id,
                'name' => $productVariant->variant?->name,
                'position' => $productVariant->position,
                'item_code' => $productVariant->item_code,
                'additional_price' => $productVariant->additional_price,
                'qty' => $productVariant->qty,
            ])->values()),
            'warehouse_prices' => $this->warehousePrices(),
            'brand' => $this->whenLoaded('brand'),
            'category' => $this->whenLoaded('category'),
            'unit' => $this->whenLoaded('unit'),
            'purchase_unit' => $this->whenLoaded('purchaseUnit'),
            'sale_unit' => $this->whenLoaded('saleUnit'),
            'tax' => $this->whenLoaded('tax'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function primaryImage(): string
    {
        return trim(explode(',', (string) $this->image)[0]);
    }

    private function warehousePrices()
    {
        if ($this->is_batch && $this->relationLoaded('warehouseStocks')) {
            return $this->warehouseStocks->map(fn ($warehousePrice) => [
                'warehouse_id' => $warehousePrice->warehouse_id,
                'warehouse_name' => $warehousePrice->warehouse?->name,
                'product_batch_id' => $warehousePrice->product_batch_id,
                'batch_no' => $warehousePrice->batch?->batch_no,
                'expired_date' => $warehousePrice->batch?->expired_date?->toDateString(),
                'qty' => $warehousePrice->qty,
                'price' => $warehousePrice->price,
            ])->values();
        }

        return $this->whenLoaded('warehousePrices', fn () => $this->warehousePrices->map(fn ($warehousePrice) => [
            'warehouse_id' => $warehousePrice->warehouse_id,
            'warehouse_name' => $warehousePrice->warehouse?->name,
            'qty' => $warehousePrice->qty,
            'price' => $warehousePrice->price,
        ])->values());
    }

    private function imageUrl(Request $request, string $path): string
    {
        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        if (Str::contains($path, '/')) {
            return $request->getSchemeAndHttpHost().'/storage/'.$path;
        }

        return $request->getSchemeAndHttpHost().'/storage/products/'.$path;
    }
}
