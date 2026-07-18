<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\Transfer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreTransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $transferId = $this->route('transfer')?->id ?? $this->route('transfer');

        return [
            'reference_no' => ['required', 'string', 'max:191', Rule::unique('transfers', 'reference_no')->ignore($transferId)],
            'transfer_date' => ['nullable', 'date'],
            'from_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'to_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true), 'different:from_warehouse_id'],
            'status' => ['required', Rule::in([Transfer::STATUS_PENDING, Transfer::STATUS_COMPLETED, 'pending', 'completed'])],
            'expected_delivery_date' => ['nullable', 'date'],
            'requested_by' => ['nullable', 'integer', 'exists:users,id'],
            'note' => ['nullable', 'string'],
            'vehicle_courier' => ['nullable', 'string', 'max:191'],
            'driver_contact' => ['nullable', 'string', 'max:191'],
            'document' => ['nullable', 'file', 'mimes:jpg,jpeg,png,gif,pdf,csv,docx,xlsx,txt'],

            'product_id' => ['required', 'array', 'min:1'],
            'product_id.*' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'variant_id' => ['nullable', 'array'],
            'variant_id.*' => ['nullable', 'integer', 'exists:variants,id'],
            'product_batch_id' => ['nullable', 'array'],
            'product_batch_id.*' => ['nullable', 'integer', 'exists:product_batches,id'],
            'qty' => ['required', 'array', 'min:1'],
            'qty.*' => ['required', 'numeric', 'gt:0'],
            'purchase_unit' => ['required', 'array', 'min:1'],
            'purchase_unit.*' => ['required', 'integer', 'exists:units,id'],
            'net_unit_cost' => ['nullable', 'array'],
            'net_unit_cost.*' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'array'],
            'tax_rate.*' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'array'],
            'tax.*' => ['nullable', 'numeric', 'min:0'],
            'subtotal' => ['nullable', 'array'],
            'subtotal.*' => ['nullable', 'numeric', 'min:0'],
            'line_note' => ['nullable', 'array'],
            'line_note.*' => ['nullable', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $status = $this->input('status');
        if ($status === 'pending') {
            $this->merge(['status' => Transfer::STATUS_PENDING]);
        } elseif ($status === 'completed') {
            $this->merge(['status' => Transfer::STATUS_COMPLETED]);
        }
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $productIds = $this->input('product_id', []);
            $indexes = array_keys(is_array($productIds) ? $productIds : []);

            foreach (['qty', 'purchase_unit'] as $field) {
                $value = $this->input($field, []);
                if (! is_array($value) || array_keys($value) !== $indexes) {
                    $validator->errors()->add($field, "The {$field} array must match product item indexes.");
                }
            }

            foreach (['variant_id', 'product_batch_id', 'net_unit_cost', 'tax_rate', 'tax', 'subtotal', 'line_note'] as $field) {
                $value = $this->input($field, []);
                if ($value !== [] && (! is_array($value) || array_diff($indexes, array_keys($value)))) {
                    $validator->errors()->add($field, "The {$field} array must include every product item index when provided.");
                }
            }

            $products = Product::query()
                ->whereIn('id', array_filter($productIds))
                ->get(['id', 'type', 'is_variant', 'is_batch'])
                ->keyBy('id');

            foreach ($productIds as $index => $productId) {
                $product = $products->get((int) $productId);
                if (! $product) {
                    continue;
                }

                if ($product->type === 'digital') {
                    $validator->errors()->add("product_id.{$index}", 'Digital products cannot be transferred.');
                }

                if ($product->is_variant) {
                    $variantId = $this->input("variant_id.{$index}");
                    if (blank($variantId)) {
                        $validator->errors()->add("variant_id.{$index}", 'The variant is required for variant products.');
                    } elseif (! ProductVariant::query()->where('product_id', $productId)->where('variant_id', $variantId)->exists()) {
                        $validator->errors()->add("variant_id.{$index}", 'The selected variant does not belong to this product.');
                    }
                }

                if ($product->is_batch) {
                    $batchId = $this->input("product_batch_id.{$index}");
                    if (blank($batchId)) {
                        $validator->errors()->add("product_batch_id.{$index}", 'The batch is required for batch products.');
                    } elseif (! ProductBatch::query()->whereKey($batchId)->where('product_id', $productId)->exists()) {
                        $validator->errors()->add("product_batch_id.{$index}", 'The selected batch does not belong to this product.');
                    }
                }
            }
        });
    }
}
