<?php

namespace App\Http\Resources;

use App\Services\ApprovalService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class ReturnPurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'return_date' => $this->return_date?->toDateString(),
            'purchase_date' => $this->return_date?->toDateString(),
            'user_id' => $this->user_id,
            'warehouse_id' => $this->warehouse_id,
            'biller_id' => $this->biller_id,
            'supplier_id' => $this->supplier_id,
            'account_id' => $this->account_id,
            'item' => $this->item,
            'total_qty' => $this->total_qty,
            'total_discount' => $this->total_discount,
            'total_tax' => $this->total_tax,
            'total_cost' => $this->total_cost,
            'order_tax_rate' => $this->order_tax_rate,
            'order_tax' => $this->order_tax,
            'grand_total' => $this->grand_total,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'return_note' => $this->return_note,
            'note' => $this->return_note,
            'staff_note' => $this->staff_note,
            'approval_status' => $this->approval_status ?? ApprovalService::APPROVED,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver'),
            'can_approve' => $request->user() ? app(ApprovalService::class)->canApprove($request->user(), 'purchase_returns') && ($this->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING : false,
            'supplier' => $this->whenLoaded('supplier'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'biller' => $this->whenLoaded('biller'),
            'user' => $this->whenLoaded('user'),
            'products' => PurchaseProductReturnResource::collection($this->whenLoaded('products')),
            'payments' => $this->whenLoaded('payments'),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
