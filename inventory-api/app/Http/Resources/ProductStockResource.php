<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductStockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product_id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'type' => $this->type,
            'current_stock' => $this->displayQuantity((float) ($this->selected_warehouse_stock ?? $this->qty)),
            'unit' => $this->whenLoaded('unit'),
            'is_variant' => $this->is_variant,
            'is_batch' => $this->is_batch,
            'variants' => $this->whenLoaded('variants', fn () => $this->variants->map(fn ($productVariant) => [
                'id' => $productVariant->id,
                'variant_id' => $productVariant->variant_id,
                'name' => $productVariant->variant?->name,
                'item_code' => $productVariant->item_code,
                'qty' => (float) $productVariant->qty,
            ])->values()),
            'stocks' => $this->whenLoaded('warehouseStocks', fn () => $this->warehouseStocks->map(fn ($stock) => [
                'warehouse_id' => $stock->warehouse_id,
                'warehouse_name' => $stock->warehouse?->name,
                'variant_id' => $stock->variant_id,
                'product_batch_id' => $stock->product_batch_id,
                'batch_no' => $stock->batch?->batch_no,
                'expired_date' => $stock->batch?->expired_date?->toDateString(),
                'qty' => (float) $stock->qty,
            ])->values()),
        ];
    }

    private function displayQuantity(float $baseQuantity): float
    {
        $unit = $this->whenLoaded('unit', fn () => $this->unit, $this->unit);
        $operationValue = (float) ($unit?->operation_value ?? 0);

        if (! $unit || $operationValue === 0.0) {
            return $baseQuantity;
        }

        if ($unit->operator === '*') {
            return $baseQuantity / $operationValue;
        }

        if ($unit->operator === '/') {
            return $baseQuantity * $operationValue;
        }

        return $baseQuantity;
    }
}
