<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'user_id' => $this->user_id,
            'cash_register_id' => $this->cash_register_id,
            'customer_id' => $this->customer_id,
            'warehouse_id' => $this->warehouse_id,
            'biller_id' => $this->biller_id,
            'item' => $this->item,
            'total_qty' => $this->total_qty,
            'total_discount' => $this->total_discount,
            'total_tax' => $this->total_tax,
            'total_price' => $this->total_price,
            'order_tax_rate' => $this->order_tax_rate,
            'order_tax' => $this->order_tax,
            'order_discount' => $this->order_discount,
            'coupon_id' => $this->coupon_id,
            'coupon_discount' => $this->coupon_discount,
            'shipping_cost' => $this->shipping_cost,
            'grand_total' => $this->grand_total,
            'sale_status' => $this->sale_status,
            'payment_status' => $this->payment_status,
            'paid_amount' => $this->paid_amount,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'sale_note' => $this->sale_note,
            'staff_note' => $this->staff_note,
            'customer' => $this->whenLoaded('customer'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'biller' => $this->whenLoaded('biller'),
            'user' => $this->whenLoaded('user'),
            'products' => ProductSaleResource::collection($this->whenLoaded('products')),
            'payments' => $this->whenLoaded('payments'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
