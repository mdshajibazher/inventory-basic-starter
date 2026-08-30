<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StorePurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $purchaseId = $this->route('purchase')?->id ?? $this->route('purchase');

        return [
            'reference_no' => ['required', 'string', 'max:191', Rule::unique('purchases', 'reference_no')->ignore($purchaseId)],
            'purchase_date' => ['nullable', 'date'],
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')->where('is_active', true)],
            'warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'status' => ['required_without:purchase_status_id', 'integer', 'exists:purchase_statuses,id', Rule::notIn([4])],
            'purchase_status_id' => ['required_without:status', 'integer', 'exists:purchase_statuses,id', Rule::notIn([4])],
            'payment_status' => ['required', 'integer'],

            'product_id' => ['required', 'array', 'min:1'],
            'product_id.*' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'product_code' => ['required', 'array', 'min:1'],
            'product_code.*' => ['nullable', 'string', 'max:255'],
            'variant_id' => ['nullable', 'array'],
            'variant_id.*' => ['nullable', 'integer', 'exists:variants,id'],
            'qty' => ['required', 'array', 'min:1'],
            'qty.*' => ['required', 'numeric', 'gt:0'],
            'received' => ['required_without:recieved', 'array', 'min:1'],
            'received.*' => ['required_with:received', 'numeric', 'min:0'],
            'recieved' => ['required_without:received', 'array', 'min:1'],
            'recieved.*' => ['required_with:recieved', 'numeric', 'min:0'],
            'batch_no' => ['required', 'array', 'min:1'],
            'batch_no.*' => ['nullable', 'string', 'max:255'],
            'expired_date' => ['required', 'array', 'min:1'],
            'expired_date.*' => ['nullable', 'date'],
            'purchase_unit' => ['required', 'array', 'min:1'],
            'purchase_unit.*' => ['required'],
            'net_unit_cost' => ['required', 'array', 'min:1'],
            'net_unit_cost.*' => ['required', 'numeric', 'min:0'],
            'discount' => ['required', 'array', 'min:1'],
            'discount.*' => ['required', 'numeric', 'min:0'],
            'tax_rate' => ['required', 'array', 'min:1'],
            'tax_rate.*' => ['required', 'numeric', 'min:0'],
            'tax' => ['required', 'array', 'min:1'],
            'tax.*' => ['required', 'numeric', 'min:0'],
            'subtotal' => ['required', 'array', 'min:1'],
            'subtotal.*' => ['required', 'numeric', 'min:0'],

            'total_qty' => ['nullable', 'numeric', 'min:0'],
            'total_discount' => ['nullable', 'numeric', 'min:0'],
            'total_tax' => ['nullable', 'numeric', 'min:0'],
            'total_cost' => ['nullable', 'numeric', 'min:0'],
            'item' => ['nullable', 'integer', 'min:1'],
            'order_tax' => ['nullable', 'numeric', 'min:0'],
            'order_tax_rate' => ['nullable', 'numeric', 'min:0'],
            'order_discount' => ['nullable', 'numeric', 'min:0'],
            'shipping_cost' => ['nullable', 'numeric', 'min:0'],
            'grand_total' => ['nullable', 'numeric', 'min:0'],

            'paid_by_id' => ['nullable', 'integer', Rule::in([1, 2, 4])],
            'paying_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'cheque_no' => ['nullable', 'string', 'max:255'],
            'payment_note' => ['nullable', 'string'],
            'note' => ['nullable', 'string'],
            'document' => ['nullable', 'file', 'mimes:jpg,jpeg,png,gif,pdf,csv,docx,xlsx,txt'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('received') && $this->has('recieved')) {
            $this->merge(['received' => $this->input('recieved')]);
        }

        if (! $this->has('status') && $this->has('purchase_status_id')) {
            $this->merge(['status' => $this->input('purchase_status_id')]);
        }
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $productIds = $this->input('product_id', []);
            $indexes = array_keys(is_array($productIds) ? $productIds : []);

            foreach ([
                'qty',
                'received',
                'batch_no',
                'expired_date',
                'product_code',
                'variant_id',
                'purchase_unit',
                'net_unit_cost',
                'discount',
                'tax_rate',
                'tax',
                'subtotal',
            ] as $field) {
                $value = $this->input($field, []);

                if (! is_array($value) || array_keys($value) !== $indexes) {
                    $validator->errors()->add($field, "The {$field} array must match product item indexes.");
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
            $isPartialPurchase = (int) $this->input('status') === 2;
            $hasReceivedQuantity = false;
            $hasIncompleteLine = false;

            foreach ($productIds as $index => $productId) {
                $requiresBatch = in_array((int) $productId, $batchProductIds, true);
                $requiresVariant = in_array((int) $productId, $variantProductIds, true);
                $qty = (float) $this->input("qty.{$index}", 0);
                $received = (float) $this->input("received.{$index}", 0);

                if ($isPartialPurchase) {
                    $hasReceivedQuantity = $hasReceivedQuantity || $received > 0;
                    $hasIncompleteLine = $hasIncompleteLine || $received < $qty;

                    if ($received > $qty) {
                        $validator->errors()->add("received.{$index}", 'Line '.((int) $index + 1).' received quantity cannot exceed ordered quantity.');
                    }
                }

                if ($requiresVariant) {
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

                if ($requiresBatch && blank($this->input("batch_no.{$index}"))) {
                    $validator->errors()->add("batch_no.{$index}", 'The batch no is required for batch products.');
                }

                if ($requiresBatch && blank($this->input("expired_date.{$index}"))) {
                    $validator->errors()->add("expired_date.{$index}", 'The expired date is required for batch products.');
                }
            }

            if ($isPartialPurchase && ! $hasReceivedQuantity) {
                $validator->errors()->add('received', 'For partial purchases, at least one line must have a received quantity greater than zero.');
            }

            if ($isPartialPurchase && ! $hasIncompleteLine) {
                $validator->errors()->add('received', 'For partial purchases, at least one line must have a received quantity less than ordered quantity.');
            }
        });
    }
}
