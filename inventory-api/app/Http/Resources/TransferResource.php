<?php

namespace App\Http\Resources;

use App\Models\Transfer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class TransferResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'transfer_date' => $this->transfer_date?->toDateString() ?? $this->created_at?->toDateString(),
            'user_id' => $this->user_id,
            'status' => $this->status,
            'status_key' => (int) $this->status === Transfer::STATUS_COMPLETED ? 'completed' : 'pending',
            'status_label' => (int) $this->status === Transfer::STATUS_COMPLETED ? 'Completed' : 'Pending',
            'from_warehouse_id' => $this->from_warehouse_id,
            'to_warehouse_id' => $this->to_warehouse_id,
            'expected_delivery_date' => $this->expected_delivery_date?->toDateString(),
            'requested_by' => $this->requested_by,
            'item' => $this->item,
            'total_qty' => $this->total_qty,
            'total_tax' => $this->total_tax,
            'total_cost' => $this->total_cost,
            'shipping_cost' => $this->shipping_cost,
            'grand_total' => $this->grand_total,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'vehicle_courier' => $this->vehicle_courier,
            'driver_contact' => $this->driver_contact,
            'note' => $this->note,
            'from_warehouse' => $this->whenLoaded('fromWarehouse'),
            'to_warehouse' => $this->whenLoaded('toWarehouse'),
            'user' => $this->whenLoaded('user'),
            'requested_user' => $this->whenLoaded('requestedBy'),
            'products' => $this->whenLoaded('products', fn () => $this->products->map(fn ($line) => [
                'id' => $line->id,
                'transfer_id' => $line->transfer_id,
                'product_id' => $line->product_id,
                'product_batch_id' => $line->product_batch_id,
                'variant_id' => $line->variant_id,
                'qty' => $line->qty,
                'purchase_unit_id' => $line->purchase_unit_id,
                'net_unit_cost' => $line->net_unit_cost,
                'tax_rate' => $line->tax_rate,
                'tax' => $line->tax,
                'total' => $line->total,
                'note' => $line->note,
                'product' => $line->relationLoaded('product') ? $line->product : null,
                'unit' => $line->relationLoaded('unit') ? $line->unit : null,
                'batch' => $line->relationLoaded('batch') ? $line->batch : null,
                'variant' => $line->relationLoaded('variant') ? $line->variant : null,
            ])->values()),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
