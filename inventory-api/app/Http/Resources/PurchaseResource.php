<?php

namespace App\Http\Resources;

use App\Services\ApprovalService;
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
            'purchase_date' => $this->purchase_date?->toDateString(),
            'user_id' => $this->user_id,
            'warehouse_id' => $this->warehouse_id,
            'biller_id' => $this->biller_id,
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
            'due_amount' => max(round((float) $this->grand_total - (float) ($this->paid_amount ?? 0), 2), 0),
            'paid_amount' => $this->paid_amount,
            'status' => $this->status,
            'purchase_status_id' => $this->status,
            'purchase_status' => $this->whenLoaded('purchaseStatus'),
            'payment_status' => $this->payment_status,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'note' => $this->note,
            'approval_status' => $this->approval_status ?? ApprovalService::APPROVED,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver'),
            'can_approve' => $request->user() ? app(ApprovalService::class)->canApprove($request->user(), 'purchases') && ($this->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING : false,
            'supplier' => $this->whenLoaded('supplier'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'biller' => $this->whenLoaded('biller'),
            'user' => $this->whenLoaded('user'),
            'products' => ProductPurchaseResource::collection($this->whenLoaded('products')),
            'payments' => $this->whenLoaded('payments'),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
