<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'warehouse_id' => $this->warehouse_id,
            'product_batch_id' => $this->product_batch_id,
            'variant_id' => $this->variant_id,
            'unit_id' => $this->unit_id,
            'source_type' => $this->source_type,
            'source_id' => $this->source_id,
            'type' => $this->type,
            'quantity' => (float) $this->quantity,
            'quantity_base' => (float) $this->quantity_base,
            'before_quantity' => (float) $this->before_quantity,
            'after_quantity' => (float) $this->after_quantity,
            'reference_no' => $this->reference_no,
            'note' => $this->note,
            'movement_date' => $this->movement_date?->toDateString(),
            'is_editable' => in_array($this->type, ['stock_increase', 'stock_decrease', 'adjustment', 'opening_stock'], true),
            'product' => $this->whenLoaded('product'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'batch' => $this->whenLoaded('batch'),
            'variant' => $this->whenLoaded('variant'),
            'unit' => $this->whenLoaded('unit'),
            'user' => $this->whenLoaded('user'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
