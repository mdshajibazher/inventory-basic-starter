<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StockAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'product_batch_id' => ['nullable', 'integer', 'exists:product_batches,id'],
            'variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'unit_id' => ['required', 'integer', 'exists:units,id'],
            'direction' => ['required', 'string', Rule::in(['increase', 'decrease'])],
            'qty' => ['required', 'numeric', 'gt:0'],
            'movement_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
        ];
    }
}
