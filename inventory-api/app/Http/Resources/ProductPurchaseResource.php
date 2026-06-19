<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductPurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'purchase_id' => $this->purchase_id,
            'date' => $this->date?->toDateString(),
            'product_id' => $this->product_id,
            'variant_id' => $this->variant_id,
            'product_batch_id' => $this->product_batch_id,
            'qty' => $this->qty,
            'received' => $this->recieved,
            'purchase_unit_id' => $this->purchase_unit_id,
            'net_unit_cost' => $this->net_unit_cost,
            'discount' => $this->discount,
            'tax_rate' => $this->tax_rate,
            'tax' => $this->tax,
            'total' => $this->total,
            'product' => $this->whenLoaded('product'),
            'unit' => $this->whenLoaded('unit'),
            'batch' => $this->whenLoaded('batch'),
            'variant' => $this->whenLoaded('variant'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
