<?php

namespace App\Actions\Purchases;

use App\Models\Account;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\PurchaseProductReturn;
use App\Models\ReturnPurchase;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StorePurchaseReturnAction
{
    public function execute(array $data, User $user, ?UploadedFile $document = null, ?ReturnPurchase $returnPurchase = null): ReturnPurchase
    {
        return DB::transaction(function () use ($data, $user, $document, $returnPurchase) {
            $billerId = $user->requireCurrentBillerId();
            $account = Account::query()->where('is_default', true)->first();

            if (! $account) {
                throw ValidationException::withMessages([
                    'account_id' => ['A default account is required before recording purchase returns.'],
                ]);
            }

            $totals = $this->calculateTotals($data);
            $documentPath = $document?->store('purchase-return/documents', 'public') ?? $returnPurchase?->document;

            if ($returnPurchase) {
                PurchaseProductReturn::query()->where('return_id', $returnPurchase->id)->delete();
            }

            $attributes = [
                'reference_no' => $data['reference_no'],
                'return_date' => $data['return_date'] ?? now()->toDateString(),
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'biller_id' => $billerId,
                'user_id' => $user->id,
                'account_id' => $account->id,
                'item' => $totals['item'],
                'total_qty' => $totals['total_qty'],
                'total_discount' => $totals['total_discount'],
                'total_tax' => $totals['total_tax'],
                'total_cost' => $totals['total_cost'],
                'order_tax_rate' => $totals['order_tax_rate'],
                'order_tax' => $totals['order_tax'],
                'grand_total' => $totals['grand_total'],
                'document' => $documentPath,
                'return_note' => $data['return_note'] ?? $data['note'] ?? null,
                'staff_note' => $data['staff_note'] ?? null,
                'approval_status' => 'pending',
                'approved_by' => null,
                'approved_at' => null,
            ];

            if ($returnPurchase) {
                $returnPurchase->update($attributes);
            } else {
                $returnPurchase = ReturnPurchase::create($attributes);
            }

            foreach ($data['product_id'] as $index => $productId) {
                $product = Product::query()->lockForUpdate()->findOrFail($productId);
                $unit = $this->resolvePurchaseUnit($data['purchase_unit'][$index] ?? null, $product, $index);
                [$variantId, $batchId] = $this->resolveItemReferences($product, $data, $index);

                PurchaseProductReturn::create([
                    'return_id' => $returnPurchase->id,
                    'date' => $returnPurchase->return_date?->toDateString(),
                    'product_id' => $product->id,
                    'variant_id' => $variantId,
                    'product_batch_id' => $batchId,
                    'qty' => (float) $data['qty'][$index],
                    'purchase_unit_id' => $unit->id,
                    'net_unit_cost' => (float) $data['net_unit_cost'][$index],
                    'discount' => (float) $data['discount'][$index],
                    'tax_rate' => (float) ($data['tax_rate'][$index] ?? 0),
                    'tax' => (float) $data['tax'][$index],
                    'total' => $totals['lines'][$index],
                ]);
            }

            return $returnPurchase->load($this->relations());
        });
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = $totalDiscount = $totalTax = $totalCost = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = round(((float) $data['net_unit_cost'][$index] * $qty) - $discount + $tax, 2);
            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalCost += $lineTotal;
        }

        $orderTaxRate = (float) ($data['order_tax_rate'] ?? 0);
        $orderTax = round($totalCost * $orderTaxRate / 100, 2);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => round($totalQty, 2),
            'total_discount' => round($totalDiscount, 2),
            'total_tax' => round($totalTax, 2),
            'total_cost' => round($totalCost, 2),
            'order_tax_rate' => round($orderTaxRate, 2),
            'order_tax' => $orderTax,
            'grand_total' => round($totalCost + $orderTax, 2),
        ];
    }

    private function resolvePurchaseUnit(mixed $purchaseUnit, Product $product, int|string $index): Unit
    {
        if ($purchaseUnit === null || $purchaseUnit === '') {
            $unit = $product->purchase_unit_id ? Unit::find($product->purchase_unit_id) : null;
        } elseif (is_numeric($purchaseUnit)) {
            $unit = Unit::find((int) $purchaseUnit);
        } else {
            $unit = Unit::query()->where('unit_name', $purchaseUnit)->orWhere('unit_code', $purchaseUnit)->first();
        }

        if (! $unit) {
            throw ValidationException::withMessages([
                "purchase_unit.{$index}" => ['Purchase unit could not be found.'],
            ]);
        }

        return $unit;
    }

    private function resolveItemReferences(Product $product, array $data, int|string $index): array
    {
        $variantId = null;
        $batchId = null;

        if ($product->is_variant) {
            $variant = ProductVariant::query()
                ->where('product_id', $product->id)
                ->when(
                    ! empty($data['variant_id'][$index]),
                    fn ($query) => $query->where('variant_id', $data['variant_id'][$index]),
                    fn ($query) => $query->where('item_code', $data['product_code'][$index] ?? null)
                )
                ->first();

            $variantId = $variant?->variant_id;
        }

        if (! empty($data['product_batch_id'][$index])) {
            $batchId = ProductBatch::query()
                ->whereKey($data['product_batch_id'][$index])
                ->where('product_id', $product->id)
                ->value('id');
        }

        return [$variantId, $batchId];
    }

    private function relations(): array
    {
        return [
            'supplier:id,name,email,phone_number',
            'warehouse:id,name',
            'biller:id,name,company_name',
            'user:id,name,email',
            'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch,is_variant',
            'products.product.variants.variant:id,name',
            'products.unit:id,unit_code,unit_name',
            'products.batch:id,batch_no,expired_date',
            'products.variant:id,name',
        ];
    }
}
