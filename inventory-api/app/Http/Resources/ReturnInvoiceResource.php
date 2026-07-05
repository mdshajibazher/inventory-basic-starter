<?php

namespace App\Http\Resources;

use App\Services\ApprovalService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class ReturnInvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'return_date' => $this->return_date?->toDateString(),
            'user_id' => $this->user_id,
            'cash_register_id' => $this->cash_register_id,
            'customer_id' => $this->customer_id,
            'warehouse_id' => $this->warehouse_id,
            'biller_id' => $this->biller_id,
            'account_id' => $this->account_id,
            'item' => $this->item,
            'total_qty' => $this->total_qty,
            'total_discount' => $this->total_discount,
            'total_tax' => $this->total_tax,
            'total_price' => $this->total_price,
            'order_tax_rate' => $this->order_tax_rate,
            'order_tax' => $this->order_tax,
            'grand_total' => $this->grand_total,
            'document' => $this->document,
            'document_url' => $this->document ? Storage::disk('public')->url($this->document) : null,
            'return_note' => $this->return_note,
            'sale_note' => $this->return_note,
            'staff_note' => $this->staff_note,
            'approval_status' => $this->approval_status ?? ApprovalService::APPROVED,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver'),
            'can_approve' => $request->user() ? app(ApprovalService::class)->canApprove($request->user(), 'returns') && ($this->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING : false,
            'customer' => $this->whenLoaded('customer'),
            'warehouse' => $this->whenLoaded('warehouse'),
            'biller' => $this->whenLoaded('biller'),
            'user' => $this->whenLoaded('user'),
            'products' => ProductReturnResource::collection($this->whenLoaded('products')),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
