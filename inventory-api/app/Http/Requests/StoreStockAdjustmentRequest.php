<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreStockAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'document' => ['nullable', 'file', 'mimes:jpg,jpeg,png,gif,pdf,csv,docx,xlsx,txt'],
            'note' => ['nullable', 'string'],
            'product_id' => ['required', 'array', 'min:1'],
            'product_id.*' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'variant_id' => ['nullable', 'array'],
            'variant_id.*' => ['nullable', 'integer', 'exists:variants,id'],
            'product_batch_id' => ['nullable', 'array'],
            'product_batch_id.*' => ['nullable', 'integer', 'exists:product_batches,id'],
            'unit_id' => ['required', 'array', 'min:1'],
            'unit_id.*' => ['required', 'integer', Rule::exists('units', 'id')->where('is_active', true)],
            'direction' => ['required', 'array', 'min:1'],
            'direction.*' => ['required', Rule::in(['increase', 'decrease'])],
            'qty' => ['required', 'array', 'min:1'],
            'qty.*' => ['required', 'numeric', 'gt:0'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $productIds = $this->input('product_id', []);
            if (! is_array($productIds)) {
                return;
            }

            $indexes = array_keys($productIds);
            foreach (['unit_id', 'direction', 'qty'] as $field) {
                $values = $this->input($field, []);
                if (! is_array($values) || array_keys($values) !== $indexes) {
                    $validator->errors()->add($field, "The {$field} array must match product item indexes.");
                }
            }
            foreach (['variant_id', 'product_batch_id'] as $field) {
                $values = $this->input($field, []);
                if ($values !== [] && (! is_array($values) || array_diff($indexes, array_keys($values)))) {
                    $validator->errors()->add($field, "The {$field} array must include every product item index when provided.");
                }
            }

            $products = Product::query()->whereIn('id', array_filter($productIds))->get()->keyBy('id');
            $units = Unit::query()->get(['id', 'base_unit'])->keyBy('id');
            $buckets = [];

            foreach ($productIds as $index => $productId) {
                $product = $products->get((int) $productId);
                if (! $product) {
                    continue;
                }
                if ($product->type === 'digital') {
                    $validator->errors()->add("product_id.{$index}", 'Digital products do not have stock.');
                }

                $variantId = $this->input("variant_id.{$index}");
                if ($product->is_variant && blank($variantId)) {
                    $validator->errors()->add("variant_id.{$index}", 'The variant is required for this product.');
                } elseif (filled($variantId) && ! ProductVariant::query()->where('product_id', $productId)->where('variant_id', $variantId)->exists()) {
                    $validator->errors()->add("variant_id.{$index}", 'The selected variant does not belong to this product.');
                }

                $batchId = $this->input("product_batch_id.{$index}");
                if ($product->is_batch && blank($batchId)) {
                    $validator->errors()->add("product_batch_id.{$index}", 'The batch is required for this product.');
                } elseif (filled($batchId) && ! ProductBatch::query()->whereKey($batchId)->where('product_id', $productId)->exists()) {
                    $validator->errors()->add("product_batch_id.{$index}", 'The selected batch does not belong to this product.');
                }

                $unitId = (int) $this->input("unit_id.{$index}");
                if ($product->unit_id && $this->rootUnitId($unitId, $units) !== $this->rootUnitId((int) $product->unit_id, $units)) {
                    $validator->errors()->add("unit_id.{$index}", 'The selected unit does not belong to this product unit family.');
                }

                $bucket = implode(':', [(int) $productId, (int) ($variantId ?: 0), (int) ($batchId ?: 0)]);
                if (isset($buckets[$bucket])) {
                    $validator->errors()->add("product_id.{$index}", 'This product, variant, and batch combination is already included.');
                }
                $buckets[$bucket] = true;
            }
        });
    }

    private function rootUnitId(int $unitId, $units): int
    {
        $current = $unitId;
        $visited = [];
        while ($current && ! isset($visited[$current])) {
            $visited[$current] = true;
            $unit = $units->get($current);
            if (! $unit?->base_unit) {
                return $current;
            }
            $current = (int) $unit->base_unit;
        }

        return $current;
    }
}
