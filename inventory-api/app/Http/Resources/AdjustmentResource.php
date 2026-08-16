<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class AdjustmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'warehouse_id' => $this->warehouse_id,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'total_qty' => (float) $this->total_qty,
            'item' => (int) $this->item,
            'note' => $this->note,
            'warehouse' => $this->whenLoaded('warehouse'),
            'lines' => $this->whenLoaded('products', fn () => $this->products->map(fn ($line) => [
                'id' => $line->id,
                'product_id' => $line->product_id,
                'variant_id' => $line->variant_id,
                'qty' => (float) $line->qty,
                'direction' => $line->action,
                'product' => $line->relationLoaded('product') ? $line->product : null,
                'variant' => $line->relationLoaded('variant') ? $line->variant : null,
                'movement' => $line->relationLoaded('movement') && $line->movement
                    ? new StockMovementResource($line->movement)
                    : null,
            ])->values()),
            'created_at' => $this->created_at,
        ];
    }
}
