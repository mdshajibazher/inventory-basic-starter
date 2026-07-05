<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_no' => $this->reference_no,
            'expense_category_id' => $this->expense_category_id,
            'category_name' => $this->whenLoaded('category', fn () => $this->category?->name),
            'warehouse_id' => $this->warehouse_id,
            'warehouse_name' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'account_id' => $this->account_id,
            'account_name' => $this->whenLoaded('account', fn () => $this->account?->name),
            'biller_id' => $this->biller_id,
            'biller_name' => $this->whenLoaded('biller', fn () => $this->biller?->name),
            'user_id' => $this->user_id,
            'user_name' => $this->whenLoaded('user', fn () => $this->user?->name),
            'cash_register_id' => $this->cash_register_id,
            'amount' => $this->amount,
            'note' => $this->note,
            'expense_date' => $this->created_at?->toDateString(),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
