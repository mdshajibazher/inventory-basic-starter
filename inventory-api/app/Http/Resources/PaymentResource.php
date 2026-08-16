<?php

namespace App\Http\Resources;

use App\Models\Payment;
use App\Services\ApprovalService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'payment_reference' => $this->payment_reference,
            'payment_type' => $this->payment_type,
            'direction' => $this->direction,
            'amount' => $this->amount,
            'discount_amount' => $this->discount_amount ?? 0,
            'settled_amount' => $this->settledAmount(),
            'change' => $this->change,
            'paying_method' => $this->paying_method,
            'payment_note' => $this->payment_note,
            'approval_status' => $this->approval_status ?? ApprovalService::APPROVED,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver'),
            'can_approve' => $request->user() ? app(ApprovalService::class)->canApprove($request->user(), 'payments') && ($this->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING : false,
            'account_id' => $this->account_id,
            'biller_id' => $this->biller_id,
            'customer_id' => $this->customer_id,
            'supplier_id' => $this->supplier_id,
            'sale_id' => $this->sale_id,
            'purchase_id' => $this->purchase_id,
            'sale_return_id' => $this->sale_return_id,
            'purchase_return_id' => $this->purchase_return_id,
            'reference_document' => $this->referenceDocument(),
            'account' => $this->whenLoaded('account'),
            'biller' => $this->whenLoaded('biller'),
            'customer' => $this->whenLoaded('customer'),
            'supplier' => $this->whenLoaded('supplier'),
            'sale' => $this->whenLoaded('sale'),
            'purchase' => $this->whenLoaded('purchase'),
            'sale_return' => $this->whenLoaded('saleReturn'),
            'purchase_return' => $this->whenLoaded('purchaseReturn'),
            'user' => $this->whenLoaded('user'),
            'activity_logs' => ActivityLogResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function referenceDocument(): array
    {
        if ($this->sale_id) {
            return [
                'type' => 'sale',
                'id' => $this->sale_id,
                'reference_no' => $this->relationLoaded('sale') ? $this->sale?->reference_no : null,
            ];
        }

        if ($this->purchase_id) {
            return [
                'type' => 'purchase',
                'id' => $this->purchase_id,
                'reference_no' => $this->relationLoaded('purchase') ? $this->purchase?->reference_no : null,
            ];
        }

        if ($this->sale_return_id) {
            return [
                'type' => 'sale_return',
                'id' => $this->sale_return_id,
                'reference_no' => $this->relationLoaded('saleReturn') ? $this->saleReturn?->reference_no : null,
            ];
        }

        if ($this->purchase_return_id) {
            return [
                'type' => 'purchase_return',
                'id' => $this->purchase_return_id,
                'reference_no' => $this->relationLoaded('purchaseReturn') ? $this->purchaseReturn?->reference_no : null,
            ];
        }

        return [
            'type' => $this->payment_type,
            'id' => null,
            'reference_no' => null,
        ];
    }

    private function settledAmount(): float
    {
        $amount = (float) $this->amount;
        $discount = (float) ($this->discount_amount ?? 0);

        return round($this->payment_type === Payment::TYPE_CUSTOMER_ADVANCE
            ? max($amount - $discount, 0)
            : $amount + $discount, 2);
    }
}
