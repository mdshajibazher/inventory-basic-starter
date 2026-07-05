<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\ProductBatch;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreReturnInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $returnId = $this->route('returnInvoice')?->id ?? $this->route('returnInvoice');

        return [
            'reference_no' => ['required', 'string', 'max:191', Rule::unique('returns', 'reference_no')->ignore($returnId)],
            'return_date' => ['nullable', 'date'],
            'customer_id' => ['required', 'integer', Rule::exists('customers', 'id')->where('is_active', true)],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'biller_id' => ['nullable', 'integer', Rule::exists('billers', 'id')->where('is_active', true)],

            'product_id' => ['required', 'array', 'min:1'],
            'product_id.*' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'product_code' => ['nullable', 'array'],
            'product_code.*' => ['nullable', 'string', 'max:255'],
            'product_batch_id' => ['nullable', 'array'],
            'product_batch_id.*' => ['nullable', 'integer', 'exists:product_batches,id'],
            'batch_no' => ['nullable', 'array'],
            'batch_no.*' => ['nullable', 'string', 'max:255'],
            'qty' => ['required', 'array', 'min:1'],
            'qty.*' => ['required', 'numeric', 'gt:0'],
            'sale_unit' => ['nullable', 'array'],
            'sale_unit.*' => ['nullable'],
            'net_unit_price' => ['required', 'array', 'min:1'],
            'net_unit_price.*' => ['required', 'numeric', 'min:0'],
            'discount' => ['required', 'array', 'min:1'],
            'discount.*' => ['required', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'array'],
            'tax_rate.*' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['required', 'array', 'min:1'],
            'tax.*' => ['required', 'numeric', 'min:0'],
            'subtotal' => ['required', 'array', 'min:1'],
            'subtotal.*' => ['required', 'numeric', 'min:0'],

            'order_tax_rate' => ['nullable', 'numeric', 'min:0'],
            'return_note' => ['nullable', 'string'],
            'sale_note' => ['nullable', 'string'],
            'staff_note' => ['nullable', 'string'],
            'document' => ['nullable', 'file', 'mimes:jpg,jpeg,png,gif,pdf,csv,docx,xlsx,txt'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $productIds = $this->input('product_id', []);
        $batchNumbers = $this->input('batch_no', []);
        $batchIds = $this->input('product_batch_id', []);

        if (! is_array($productIds) || ! is_array($batchNumbers)) {
            return;
        }

        foreach ($productIds as $index => $productId) {
            if (! blank($batchIds[$index] ?? null) || blank($batchNumbers[$index] ?? null)) {
                continue;
            }

            $batchIds[$index] = ProductBatch::query()
                ->where('product_id', $productId)
                ->where('batch_no', $batchNumbers[$index])
                ->value('id');
        }

        $this->merge([
            'product_batch_id' => $batchIds,
            'return_note' => $this->input('return_note', $this->input('sale_note')),
        ]);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $productIds = $this->input('product_id', []);
            $indexes = array_keys(is_array($productIds) ? $productIds : []);

            foreach (['qty', 'net_unit_price', 'discount', 'tax', 'subtotal'] as $field) {
                $value = $this->input($field, []);

                if (! is_array($value) || array_keys($value) !== $indexes) {
                    $validator->errors()->add($field, "The {$field} array must match product item indexes.");
                }
            }

            foreach (['product_code', 'product_batch_id', 'batch_no', 'sale_unit', 'tax_rate'] as $field) {
                if (! $this->has($field)) {
                    continue;
                }

                $value = $this->input($field, []);

                if (! is_array($value)) {
                    $validator->errors()->add($field, "The {$field} field must be an array.");

                    continue;
                }

                $extraIndexes = array_diff(array_keys($value), $indexes);

                if ($extraIndexes !== []) {
                    $validator->errors()->add($field, "The {$field} array contains indexes without matching product items.");
                }
            }

            $batchProductIds = Product::query()
                ->whereIn('id', array_filter($productIds))
                ->where('is_batch', true)
                ->pluck('id')
                ->all();

            foreach ($productIds as $index => $productId) {
                if (! in_array((int) $productId, $batchProductIds, true)) {
                    continue;
                }

                if (blank($this->input("batch_no.{$index}")) && blank($this->input("product_batch_id.{$index}"))) {
                    $validator->errors()->add("batch_no.{$index}", 'The batch no is required for batch products.');
                    continue;
                }

                if (blank($this->input("product_batch_id.{$index}"))) {
                    $validator->errors()->add("batch_no.{$index}", 'The selected batch no could not be found for this product.');
                }
            }
        });
    }
}
