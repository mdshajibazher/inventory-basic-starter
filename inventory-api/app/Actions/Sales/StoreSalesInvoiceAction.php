<?php

namespace App\Actions\Sales;

use App\Models\Account;
use App\Models\CashRegister;
use App\Models\Customer;
use App\Models\GiftCard;
use App\Models\Payment;
use App\Models\PaymentWithCheque;
use App\Models\PaymentWithGiftCard;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductSale;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\Sale;
use App\Models\Unit;
use App\Models\User;
use App\Services\PaymentService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StoreSalesInvoiceAction
{
    public function execute(array $data, User $user, ?UploadedFile $document = null): Sale
    {
        return DB::transaction(function () use ($data, $user, $document) {
            $billerId = $user->requireCurrentBillerId();
            $cashRegister = CashRegister::query()
                ->where('user_id', $user->id)
                ->where('warehouse_id', $data['warehouse_id'])
                ->where('status', true)
                ->first();

            $totals = $this->calculateTotals($data);
            $documentPath = $document?->store('sale/documents', 'public');

            $sale = Sale::create([
                'reference_no' => $data['reference_no'],
                'sale_date' => $data['sale_date'] ?? now()->toDateString(),
                'user_id' => $user->id,
                'cash_register_id' => $cashRegister?->id,
                'customer_id' => $data['customer_id'],
                'warehouse_id' => $data['warehouse_id'],
                'biller_id' => $billerId,
                'item' => $totals['item'],
                'total_qty' => $totals['total_qty'],
                'total_discount' => $totals['total_discount'],
                'total_tax' => $totals['total_tax'],
                'total_price' => $totals['total_price'],
                'order_tax_rate' => $totals['order_tax_rate'],
                'order_tax' => $totals['order_tax'],
                'order_discount' => $totals['order_discount'],
                'coupon_id' => $data['coupon_id'] ?? null,
                'coupon_discount' => $totals['coupon_discount'],
                'shipping_cost' => $totals['shipping_cost'],
                'grand_total' => $totals['grand_total'],
                'sale_status' => $data['sale_status'],
                'payment_status' => 2,
                'paid_amount' => 0,
                'document' => $documentPath,
                'sale_note' => $data['sale_note'] ?? null,
                'staff_note' => $data['staff_note'] ?? null,
                'approval_status' => 'pending',
            ]);

            foreach ($data['product_id'] as $index => $productId) {
                $product = Product::query()->lockForUpdate()->findOrFail($productId);
                $unit = $this->resolveSaleUnit($data['sale_unit'][$index] ?? null, $product);
                $qty = (float) $data['qty'][$index];
                $baseQuantity = $this->baseQuantity($qty, $unit);
                $cost = $this->costSnapshot($product, $qty, $baseQuantity);
                $variantId = null;
                $batchId = null;

                if ($unit === null && (string) ($data['sale_unit'][$index] ?? '') === 'n/a') {
                    $baseQuantity = $qty;
                    $cost = $this->costSnapshot($product, $qty, $baseQuantity);
                }
                [$variantId, $batchId] = $this->resolveItemReferences($product, $data, $index);

                $productSale = ProductSale::create([
                    'sale_id' => $sale->id,
                    'date' => $sale->sale_date?->toDateString(),
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

            $this->createPaymentIfNeeded($sale, $data, $user, $cashRegister);

            return $sale->load($this->relations());
        });
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = 0.0;
        $totalDiscount = 0.0;
        $totalTax = 0.0;
        $totalPrice = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = $this->round(((float) $data['net_unit_price'][$index] * $qty) - $discount + $tax);

            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalPrice += $lineTotal;
        }

        $orderTaxRate = (float) ($data['order_tax_rate'] ?? 0);
        $orderTax = $this->round($totalPrice * $orderTaxRate / 100);
        $orderDiscount = (float) ($data['order_discount'] ?? 0);
        $couponDiscount = (float) ($data['coupon_discount'] ?? 0);
        $shippingCost = (float) ($data['shipping_cost'] ?? 0);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => $this->round($totalQty),
            'total_discount' => $this->round($totalDiscount),
            'total_tax' => $this->round($totalTax),
            'total_price' => $this->round($totalPrice),
            'order_tax_rate' => $this->round($orderTaxRate),
            'order_tax' => $orderTax,
            'order_discount' => $this->round($orderDiscount),
            'coupon_discount' => $this->round($couponDiscount),
            'shipping_cost' => $this->round($shippingCost),
            'grand_total' => $this->round($totalPrice + $orderTax + $shippingCost - $orderDiscount - $couponDiscount),
        ];
    }

    private function resolveSaleUnit(mixed $saleUnit, Product $product): ?Unit
    {
        if ($saleUnit === null || $saleUnit === '') {
            if ($product->sale_unit_id) {
                return Unit::find($product->sale_unit_id);
            }

            return null;
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
        $totalCost = $this->round((float) $product->cost * $baseQuantity);

        return [
            'unit_cost' => $qty > 0 ? $this->round($totalCost / $qty) : 0,
            'total_cost' => $totalCost,
        ];
    }

    private function deductProductStock(Product $product, array $data, int|string $index, float $quantity): array
    {
        $variantId = null;
        $batchId = null;

        $this->deductModelQuantity($product, $quantity, "qty.{$index}", 'Product stock is insufficient.');

        if ($product->is_variant) {
            $selectedVariantId = $data['variant_id'][$index] ?? null;
            $code = $data['product_code'][$index] ?? null;

            if (! $selectedVariantId && ! $code) {
                throw ValidationException::withMessages([
                    "variant_id.{$index}" => ['Variant is required for variant products.'],
                ]);
            }

            $productVariant = ProductVariant::query()
                ->where('product_id', $product->id)
                ->when($selectedVariantId, fn ($query) => $query->where('variant_id', $selectedVariantId), fn ($query) => $query->where('item_code', $code))
                ->lockForUpdate()
                ->first();

            if (! $productVariant) {
                throw ValidationException::withMessages([
                    "variant_id.{$index}" => ['Product variant could not be found.'],
                ]);
            }

            $this->deductModelQuantity($productVariant, $quantity, "qty.{$index}", 'Product variant stock is insufficient.');
            $variantId = $productVariant->variant_id;

            $warehouseStock = ProductWarehouse::query()
                ->where('product_id', $product->id)
                ->where('variant_id', $variantId)
                ->where('warehouse_id', $data['warehouse_id'])
                ->lockForUpdate()
                ->first();
        } elseif (! empty($data['product_batch_id'][$index])) {
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

            $this->deductModelQuantity($batch, $quantity, "qty.{$index}", 'Product batch stock is insufficient.');
            $batchId = $batch->id;

            $warehouseStock = ProductWarehouse::query()
                ->where('product_id', $product->id)
                ->where('product_batch_id', $batch->id)
                ->where('warehouse_id', $data['warehouse_id'])
                ->lockForUpdate()
                ->first();
        } else {
            $warehouseStock = ProductWarehouse::query()
                ->where('product_id', $product->id)
                ->where('warehouse_id', $data['warehouse_id'])
                ->whereNull('variant_id')
                ->whereNull('product_batch_id')
                ->lockForUpdate()
                ->first();
        }

        if (! $warehouseStock) {
            throw ValidationException::withMessages([
                "product_id.{$index}" => ['Warehouse stock could not be found for this product.'],
            ]);
        }

        $this->deductModelQuantity($warehouseStock, $quantity, "qty.{$index}", 'Warehouse stock is insufficient.');

        return [$variantId, $batchId];
    }

    private function resolveItemReferences(Product $product, array $data, int|string $index): array
    {
        $variantId = null;
        $batchId = null;

        if ($product->is_variant && (! empty($data['variant_id'][$index]) || ! empty($data['product_code'][$index]))) {
            $variantId = ProductVariant::query()
                ->where('product_id', $product->id)
                ->when(
                    ! empty($data['variant_id'][$index]),
                    fn ($query) => $query->where('variant_id', $data['variant_id'][$index]),
                    fn ($query) => $query->where('item_code', $data['product_code'][$index])
                )
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

    private function deductComboStock(Product $combo, float $soldQty, int $warehouseId, string $field): void
    {
        $productIds = array_filter(explode(',', (string) $combo->product_list));
        $quantities = array_filter(explode(',', (string) $combo->qty_list), fn ($qty) => $qty !== '');

        foreach ($productIds as $key => $childId) {
            $childQty = $soldQty * (float) ($quantities[$key] ?? 0);

            if ($childQty <= 0) {
                continue;
            }

            $child = Product::query()->lockForUpdate()->find($childId);

            if (! $child) {
                throw ValidationException::withMessages([
                    $field => ['Combo product contains an unavailable child product.'],
                ]);
            }

            $this->deductModelQuantity($child, $childQty, $field, 'Combo child product stock is insufficient.');

            $warehouseStock = ProductWarehouse::query()
                ->where('product_id', $child->id)
                ->where('warehouse_id', $warehouseId)
                ->whereNull('variant_id')
                ->whereNull('product_batch_id')
                ->lockForUpdate()
                ->first();

            if (! $warehouseStock) {
                throw ValidationException::withMessages([
                    $field => ['Combo child warehouse stock could not be found.'],
                ]);
            }

            $this->deductModelQuantity($warehouseStock, $childQty, $field, 'Combo child warehouse stock is insufficient.');
        }
    }

    private function deductModelQuantity(object $model, float $quantity, string $field, string $message): void
    {
        $before = (float) $model->qty;
        $after = $before - $quantity;

        if ($after < 0) {
            throw ValidationException::withMessages([
                $field => [$message],
            ]);
        }

        $model->qty = $after;
        $model->save();
    }

    private function createPaymentIfNeeded(Sale $sale, array $data, User $user, ?CashRegister $cashRegister): void
    {
        $paidAmount = (float) ($data['paid_amount'] ?? 0);

        if ($paidAmount <= 0 && ! in_array((int) $data['payment_status'], [3, 4], true)) {
            return;
        }

        $account = ! empty($data['account_id'])
            ? Account::query()->whereKey($data['account_id'])->first()
            : Account::query()->where('is_default', true)->first();

        if (! $account) {
            throw ValidationException::withMessages([
                'paid_amount' => ['A default account is required before recording sale payments.'],
            ]);
        }

        $payment = app(PaymentService::class)->record([
            'sale_id' => $sale->id,
            'cash_register_id' => $cashRegister?->id,
            'account_id' => $account->id,
            'customer_id' => $sale->customer_id,
            'payment_reference' => 'spr-'.date('Ymd').'-'.date('His'),
            'payment_type' => Payment::TYPE_SALE_PAYMENT,
            'direction' => Payment::DIRECTION_IN,
            'amount' => $paidAmount,
            'change' => (float) ($data['paying_amount'] ?? $paidAmount) - $paidAmount,
            'paying_method' => $this->paymentMethod((int) ($data['paid_by_id'] ?? 1)),
            'payment_note' => $data['payment_note'] ?? null,
        ], $user);

        if ($payment->paying_method === 'Gift Card') {
            if (empty($data['gift_card_id'])) {
                throw ValidationException::withMessages([
                    'gift_card_id' => ['Gift card is required for gift card payments.'],
                ]);
            }

            GiftCard::query()
                ->whereKey($data['gift_card_id'])
                ->lockForUpdate()
                ->increment('expense', $paidAmount);

            PaymentWithGiftCard::create([
                'payment_id' => $payment->id,
                'gift_card_id' => $data['gift_card_id'],
            ]);
        }

        if ($payment->paying_method === 'Cheque') {
            if (empty($data['cheque_no'])) {
                throw ValidationException::withMessages([
                    'cheque_no' => ['Cheque number is required for cheque payments.'],
                ]);
            }

            PaymentWithCheque::create([
                'payment_id' => $payment->id,
                'cheque_no' => $data['cheque_no'],
            ]);
        }

        if ($payment->paying_method === 'Deposit') {
            Customer::query()
                ->whereKey($sale->customer_id)
                ->lockForUpdate()
                ->increment('expense', $paidAmount);
        }
    }

    private function paymentMethod(int $paidById): string
    {
        return match ($paidById) {
            1 => 'Cash',
            2 => 'Gift Card',
            3 => 'Credit Card',
            4 => 'Cheque',
            5 => 'Paypal',
            default => 'Deposit',
        };
    }

    private function relations(): array
    {
        return [
            'customer:id,name,email,phone_number',
            'warehouse:id,name',
            'biller:id,name,company_name',
            'user:id,name,email',
            'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch,is_variant',
            'products.product.variants.variant:id,name',
            'products.unit:id,unit_code,unit_name',
            'products.batch:id,batch_no,expired_date',
            'products.variant:id,name',
            'payments:id,sale_id,customer_id,account_id,payment_reference,payment_type,direction,amount,change,paying_method,payment_note',
        ];
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
