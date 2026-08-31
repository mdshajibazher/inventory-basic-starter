<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductSaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sale_id' => $this->sale_id,
            'date' => $this->date?->toDateString(),
            'product_id' => $this->product_id,
            'variant_id' => $this->variant_id,
            'product_batch_id' => $this->product_batch_id,
            'qty' => $this->qty,
            'sale_unit_id' => $this->sale_unit_id,
            'net_unit_price' => $this->net_unit_price,
            'discount' => $this->discount,
            'tax_rate' => $this->tax_rate,
            'tax_method' => $this->tax_method,
            'entered_unit_price' => $this->enteredUnitPrice(),
            'tax' => $this->tax,
            'total' => $this->total,
            'unit_cost' => $this->unit_cost,
            'total_cost' => $this->total_cost,
            'product' => $this->whenLoaded('product'),
            'unit' => $this->whenLoaded('unit'),
            'batch' => $this->whenLoaded('batch'),
            'variant' => $this->whenLoaded('variant'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function enteredUnitPrice(): float
    {
        $qty = (float) $this->qty;

        if ((int) $this->tax_method === 2 && $qty > 0) {
            return round(((float) $this->total + (float) $this->discount) / $qty, 2);
        }

        return round((float) $this->net_unit_price, 2);
    }
}
