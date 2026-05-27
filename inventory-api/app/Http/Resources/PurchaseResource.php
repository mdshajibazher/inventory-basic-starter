<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class PurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'user_id' => $this->user_id,
            'warehouse_id' => $this->warehouse_id,
            'supplier_id' => $this->supplier_id,
            'item' => $this->item,
            'total_qty' => $this->total_qty,
            'total_discount' => $this->total_discount,
            'total_tax' => $this->total_tax,
            'total_cost' => $this->total_cost,
            'order_tax_rate' => $this->order_tax_rate,
            'order_tax' => $this->order_tax,
            'order_discount' => $this->order_discount,
            'shipping_cost' => $this->shipping_cost,
            'grand_total' => $this->grand_total,
            'paid_amount' => $this->paid_amount,
            'status' => $this->status,
            'purchase_status_id' => $this->status,
            'purchase_status' => $this->whenLoaded('purchaseStatus'),
            'payment_status' => $this->payment_status,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'note' => $this->note,
            'supplier' => $this->whenLoaded('supplier'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'user' => $this->whenLoaded('user'),
            'products' => ProductPurchaseResource::collection($this->whenLoaded('products')),
            'payments' => $this->whenLoaded('payments'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
