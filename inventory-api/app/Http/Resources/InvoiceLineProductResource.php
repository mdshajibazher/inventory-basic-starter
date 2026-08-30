<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvoiceLineProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $product = $this->resource->toArray();

        if ($this->resource->relationLoaded('variants')) {
            $product['variants'] = $this->resource->variants->map(fn ($productVariant) => [
                'id' => $productVariant->id,
                'variant_id' => $productVariant->variant_id,
                'name' => $productVariant->variant?->name,
                'position' => $productVariant->position,
                'item_code' => $productVariant->item_code,
                'additional_price' => $productVariant->additional_price,
                'qty' => $productVariant->qty,
            ])->values();
        }

        return $product;
    }
}
