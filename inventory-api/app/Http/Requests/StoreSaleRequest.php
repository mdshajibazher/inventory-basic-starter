<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $saleId = $this->route('sale')?->id ?? $this->route('sale');

        logger([
            'this request' => $this->request,
        ]);

        return [
            'reference_no' => ['required', 'string', 'max:191', Rule::unique('sales', 'reference_no')->ignore($saleId)],
            'sale_date' => ['nullable', 'date'],
            'customer_id' => ['required', 'integer', Rule::exists('customers', 'id')->where('is_active', true)],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'biller_id' => ['nullable', 'integer', Rule::exists('billers', 'id')->where('is_active', true)],
            'sale_status' => ['required', 'integer'],
            'payment_status' => ['required', 'integer'],

            'product_id' => ['required', 'array', 'min:1'],
            'product_id.*' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'product_code' => ['nullable', 'array'],
            'product_code.*' => ['nullable', 'string', 'max:255'],
            'variant_id' => ['nullable', 'array'],
            'variant_id.*' => ['nullable', 'integer', 'exists:variants,id'],
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

            'total_qty' => ['nullable', 'numeric', 'min:0'],
            'total_discount' => ['nullable', 'numeric', 'min:0'],
            'total_tax' => ['nullable', 'numeric', 'min:0'],
            'total_price' => ['nullable', 'numeric', 'min:0'],
            'item' => ['nullable', 'integer', 'min:1'],
            'order_tax' => ['nullable', 'numeric', 'min:0'],
            'order_tax_rate' => ['nullable', 'numeric', 'min:0'],
            'order_discount' => ['nullable', 'numeric', 'min:0'],
            'coupon_id' => ['nullable', 'integer', 'exists:coupons,id'],
            'coupon_discount' => ['nullable', 'numeric', 'min:0'],
            'coupon_active' => ['nullable', 'boolean'],
            'shipping_cost' => ['nullable', 'numeric', 'min:0'],
            'grand_total' => ['nullable', 'numeric', 'min:0'],

            'paid_by_id' => ['nullable', 'integer'],
            'paying_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'gift_card_id' => ['nullable', 'integer', 'exists:gift_cards,id'],
            'cheque_no' => ['nullable', 'string', 'max:255'],
            'payment_note' => ['nullable', 'string'],
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

        $this->merge(['product_batch_id' => $batchIds]);
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

            foreach (['product_code', 'variant_id', 'product_batch_id', 'batch_no', 'sale_unit', 'tax_rate'] as $field) {
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
            $variantProductIds = Product::query()
                ->whereIn('id', array_filter($productIds))
                ->where('is_variant', true)
                ->pluck('id')
                ->all();

            foreach ($productIds as $index => $productId) {
                if (in_array((int) $productId, $variantProductIds, true)) {
                    $variantId = $this->input("variant_id.{$index}");
                    $productCode = $this->input("product_code.{$index}");

                    if (blank($variantId) && blank($productCode)) {
                        $validator->errors()->add("variant_id.{$index}", 'The variant is required for variant products.');
                    } elseif (! blank($variantId)) {
                        $exists = ProductVariant::query()
                            ->where('product_id', $productId)
                            ->where('variant_id', $variantId)
                            ->exists();

                        if (! $exists) {
                            $validator->errors()->add("variant_id.{$index}", 'The selected variant does not belong to this product.');
                        }
                    }
                }

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
