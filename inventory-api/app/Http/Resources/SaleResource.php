<?php

namespace App\Http\Resources;

use App\Services\ApprovalService;
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
            'sale_date' => $this->sale_date?->toDateString(),
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
            'due_amount' => max(round((float) $this->grand_total - (float) ($this->paid_amount ?? 0), 2), 0),
            'sale_status' => $this->sale_status,
            'payment_status' => $this->payment_status,
            'paid_amount' => $this->paid_amount,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'sale_note' => $this->sale_note,
            'staff_note' => $this->staff_note,
            'approval_status' => $this->approval_status ?? ApprovalService::APPROVED,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver'),
            'can_approve' => $request->user() ? app(ApprovalService::class)->canApprove($request->user(), 'sales') && ($this->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING : false,
            'customer' => $this->whenLoaded('customer'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'biller' => $this->whenLoaded('biller'),
            'user' => $this->whenLoaded('user'),
            'products' => ProductSaleResource::collection($this->whenLoaded('products')),
            'payments' => $this->whenLoaded('payments'),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
