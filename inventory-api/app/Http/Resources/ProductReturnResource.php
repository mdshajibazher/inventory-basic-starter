<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductReturnResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'return_id' => $this->return_id,
            'product_id' => $this->product_id,
            'variant_id' => $this->variant_id,
            'product_batch_id' => $this->product_batch_id,
            'qty' => $this->qty,
            'sale_unit_id' => $this->sale_unit_id,
            'net_unit_price' => $this->net_unit_price,
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
