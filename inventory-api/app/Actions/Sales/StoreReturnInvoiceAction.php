<?php

namespace App\Actions\Sales;

use App\Models\Account;
use App\Models\CashRegister;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductReturn;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\ReturnInvoice;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StoreReturnInvoiceAction
{
    public function execute(array $data, User $user, ?UploadedFile $document = null, ?ReturnInvoice $returnInvoice = null): ReturnInvoice
    {
        return DB::transaction(function () use ($data, $user, $document, $returnInvoice) {
            $billerId = $user->requireCurrentBillerId();
            $cashRegister = CashRegister::query()
                ->where('user_id', $user->id)
                ->where('warehouse_id', $data['warehouse_id'])
                ->where('status', true)
                ->first();
            $account = Account::query()->where('is_default', true)->first();

            if (! $account) {
                throw ValidationException::withMessages([
                    'account_id' => ['A default account is required before recording return invoices.'],
                ]);
            }

            $totals = $this->calculateTotals($data);
            $documentPath = $document?->store('return/documents', 'public') ?? $returnInvoice?->document;

            if ($returnInvoice) {
                ProductReturn::query()->where('return_id', $returnInvoice->id)->delete();
            }

            $attributes = [
                'reference_no' => $data['reference_no'],
                'return_date' => $data['return_date'] ?? now()->toDateString(),
                'user_id' => $user->id,
                'cash_register_id' => $cashRegister?->id,
                'customer_id' => $data['customer_id'],
                'warehouse_id' => $data['warehouse_id'],
                'biller_id' => $billerId,
                'account_id' => $account->id,
                'item' => $totals['item'],
                'total_qty' => $totals['total_qty'],
                'total_discount' => $totals['total_discount'],
                'total_tax' => $totals['total_tax'],
                'total_price' => $totals['total_price'],
                'order_tax_rate' => $totals['order_tax_rate'],
                'order_tax' => $totals['order_tax'],
                'grand_total' => $totals['grand_total'],
                'document' => $documentPath,
                'return_note' => $data['return_note'] ?? $data['sale_note'] ?? null,
                'staff_note' => $data['staff_note'] ?? null,
                'approval_status' => 'pending',
                'approved_by' => null,
                'approved_at' => null,
            ];

            if ($returnInvoice) {
                $returnInvoice->update($attributes);
            } else {
                $returnInvoice = ReturnInvoice::create($attributes);
            }

            foreach ($data['product_id'] as $index => $productId) {
                $product = Product::query()->lockForUpdate()->findOrFail($productId);
                $unit = $this->resolveSaleUnit($data['sale_unit'][$index] ?? null, $product);
                $qty = (float) $data['qty'][$index];
                $baseQuantity = $this->baseQuantity($qty, $unit);
                $cost = $this->costSnapshot($product, $qty, $baseQuantity);
                [$variantId, $batchId] = $this->resolveItemReferences($product, $data, $index);

                $productReturn = ProductReturn::create([
                    'return_id' => $returnInvoice->id,
                    'date' => $returnInvoice->return_date?->toDateString(),
                    'product_id' => $product->id,
                    'variant_id' => $variantId,
                    'product_batch_id' => $batchId,
                    'qty' => $qty,
                    'sale_unit_id' => $unit?->id ?? 0,
                    'net_unit_price' => (float) $data['net_unit_price'][$index],
                    'discount' => (float) $data['discount'][$index],
                    'tax_rate' => (float) ($data['tax_rate'][$index] ?? 0),
                    'tax' => (float) $data['tax'][$index],
                    'total' => $totals['lines'][$index],
                    'unit_cost' => $cost['unit_cost'],
                    'total_cost' => $cost['total_cost'],
                ]);

            }

            return $returnInvoice->load($this->relations());
        });
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = $totalDiscount = $totalTax = $totalPrice = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = round(((float) $data['net_unit_price'][$index] * $qty) - $discount + $tax, 2);
            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalPrice += $lineTotal;
        }

        $orderTaxRate = (float) ($data['order_tax_rate'] ?? 0);
        $orderTax = round($totalPrice * $orderTaxRate / 100, 2);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => round($totalQty, 2),
            'total_discount' => round($totalDiscount, 2),
            'total_tax' => round($totalTax, 2),
            'total_price' => round($totalPrice, 2),
            'order_tax_rate' => round($orderTaxRate, 2),
            'order_tax' => $orderTax,
            'grand_total' => round($totalPrice + $orderTax, 2),
        ];
    }

    private function resolveSaleUnit(mixed $saleUnit, Product $product): ?Unit
    {
        if ($saleUnit === null || $saleUnit === '') {
            return $product->sale_unit_id ? Unit::find($product->sale_unit_id) : null;
        }

        if ((string) $saleUnit === 'n/a') {
            return null;
        }

        if (is_numeric($saleUnit)) {
            return Unit::find((int) $saleUnit);
        }

        return Unit::query()->where('unit_name', $saleUnit)->first();
    }

    private function baseQuantity(float $qty, ?Unit $unit): float
    {
        if (! $unit) {
            return $qty;
        }

        if ($unit->operator === '*') {
            return $qty * (float) $unit->operation_value;
        }

        if ($unit->operator === '/' && (float) $unit->operation_value !== 0.0) {
            return $qty / (float) $unit->operation_value;
        }

        return $qty;
    }

    private function costSnapshot(Product $product, float $qty, float $baseQuantity): array
    {
        $totalCost = round((float) $product->cost * $baseQuantity, 2);

        return [
            'unit_cost' => $qty > 0 ? round($totalCost / $qty, 2) : 0,
            'total_cost' => $totalCost,
        ];
    }

    private function incrementStock(Product $product, array $data, int|string $index, float $quantity): array
    {
        $variantId = null;
        $batchId = null;

        $product->increment('qty', $quantity);

        if ($product->is_variant && ! empty($data['product_code'][$index])) {
            $productVariant = ProductVariant::query()
                ->where('product_id', $product->id)
                ->where('item_code', $data['product_code'][$index])
                ->lockForUpdate()
                ->first();

            if (! $productVariant) {
                throw ValidationException::withMessages([
                    "product_code.{$index}" => ['Product variant could not be found for this code.'],
                ]);
            }

            $productVariant->increment('qty', $quantity);
            $variantId = $productVariant->variant_id;
        }

        if (! empty($data['product_batch_id'][$index])) {
            $batch = ProductBatch::query()
                ->whereKey($data['product_batch_id'][$index])
                ->where('product_id', $product->id)
                ->lockForUpdate()
                ->first();

            if (! $batch) {
                throw ValidationException::withMessages([
                    "product_batch_id.{$index}" => ['Product batch could not be found for this product.'],
                ]);
            }

            $batch->increment('qty', $quantity);
            $batchId = $batch->id;
        }

        $warehouseStock = ProductWarehouse::query()
            ->where('product_id', $product->id)
            ->where('warehouse_id', $data['warehouse_id'])
            ->when($variantId, fn ($query) => $query->where('variant_id', $variantId), fn ($query) => $query->whereNull('variant_id'))
            ->when($batchId, fn ($query) => $query->where('product_batch_id', $batchId), fn ($query) => $query->whereNull('product_batch_id'))
            ->lockForUpdate()
            ->first();

        if ($warehouseStock) {
            $warehouseStock->increment('qty', $quantity);
        } else {
            ProductWarehouse::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['warehouse_id'],
                'variant_id' => $variantId,
                'product_batch_id' => $batchId,
                'qty' => $quantity,
            ]);
        }

        return [$variantId, $batchId];
    }

    private function resolveItemReferences(Product $product, array $data, int|string $index): array
    {
        $variantId = null;
        $batchId = null;

        if ($product->is_variant && ! empty($data['product_code'][$index])) {
            $variantId = ProductVariant::query()
                ->where('product_id', $product->id)
                ->where('item_code', $data['product_code'][$index])
                ->value('variant_id');
        }

        if (! empty($data['product_batch_id'][$index])) {
            $batchId = ProductBatch::query()
                ->whereKey($data['product_batch_id'][$index])
                ->where('product_id', $product->id)
                ->value('id');
        }

        return [$variantId, $batchId];
    }

    private function reverseStock(ReturnInvoice $returnInvoice): void
    {
        $returnInvoice->loadMissing(['products.product', 'products.unit']);

        foreach ($returnInvoice->products as $line) {
            $quantity = $this->baseQuantity((float) $line->qty, $line->unit);
            $line->product?->decrement('qty', $quantity);

            if ($line->variant_id) {
                ProductVariant::query()
                    ->where('product_id', $line->product_id)
                    ->where('variant_id', $line->variant_id)
                    ->decrement('qty', $quantity);
            }

            if ($line->product_batch_id) {
                ProductBatch::query()->whereKey($line->product_batch_id)->decrement('qty', $quantity);
            }

            ProductWarehouse::query()
                ->where('product_id', $line->product_id)
                ->where('warehouse_id', $returnInvoice->warehouse_id)
                ->when($line->variant_id, fn ($query) => $query->where('variant_id', $line->variant_id), fn ($query) => $query->whereNull('variant_id'))
                ->when($line->product_batch_id, fn ($query) => $query->where('product_batch_id', $line->product_batch_id), fn ($query) => $query->whereNull('product_batch_id'))
                ->decrement('qty', $quantity);
        }
    }

    private function relations(): array
    {
        return [
            'customer:id,name,email,phone_number',
            'warehouse:id,name',
            'biller:id,name,company_name',
            'user:id,name,email',
            'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch',
            'products.unit:id,unit_code,unit_name',
            'products.batch:id,batch_no,expired_date',
            'products.variant:id,name',
        ];
    }
}
