<?php

namespace App\Http\Resources;

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
            'change' => $this->change,
            'paying_method' => $this->paying_method,
            'payment_note' => $this->payment_note,
            'account_id' => $this->account_id,
            'customer_id' => $this->customer_id,
            'supplier_id' => $this->supplier_id,
            'sale_id' => $this->sale_id,
            'purchase_id' => $this->purchase_id,
            'sale_return_id' => $this->sale_return_id,
            'purchase_return_id' => $this->purchase_return_id,
            'reference_document' => $this->referenceDocument(),
            'account' => $this->whenLoaded('account'),
            'customer' => $this->whenLoaded('customer'),
            'supplier' => $this->whenLoaded('supplier'),
            'sale' => $this->whenLoaded('sale'),
            'purchase' => $this->whenLoaded('purchase'),
            'sale_return' => $this->whenLoaded('saleReturn'),
            'purchase_return' => $this->whenLoaded('purchaseReturn'),
            'user' => $this->whenLoaded('user'),
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
}
