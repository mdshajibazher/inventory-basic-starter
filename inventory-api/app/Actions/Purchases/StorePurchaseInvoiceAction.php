<?php

namespace App\Actions\Purchases;

use App\Models\Account;
use App\Models\Payment;
use App\Models\PaymentWithCheque;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductPurchase;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\Purchase;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PaymentService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StorePurchaseInvoiceAction
{
    private const STATUS_RECEIVED = 1;

    private const STATUS_PARTIAL = 2;

    private const STATUS_PENDING = 3;

    private const STATUS_ORDERED = 4;

    public function execute(array $data, User $user, ?UploadedFile $document = null): Purchase
    {
        return DB::transaction(function () use ($data, $user, $document) {
            $billerId = $user->requireCurrentBillerId();
            $warehouseId = $this->resolveWarehouseId($data, $user);
            $totals = $this->calculateTotals($data);
            $paidAmount = min((float) ($data['paid_amount'] ?? 0), $totals['grand_total']);
            $documentPath = $document?->store('purchase/documents', 'public');

            $purchase = Purchase::create([
                'reference_no' => $data['reference_no'],
                'purchase_date' => $data['purchase_date'] ?? now()->toDateString(),
                'user_id' => $user->id,
                'warehouse_id' => $warehouseId,
                'biller_id' => $billerId,
                'supplier_id' => $data['supplier_id'],
                'item' => $totals['item'],
                'total_qty' => $totals['total_qty'],
                'total_discount' => $totals['total_discount'],
                'total_tax' => $totals['total_tax'],
                'total_cost' => $totals['total_cost'],
                'order_tax_rate' => $totals['order_tax_rate'],
                'order_tax' => $totals['order_tax'],
                'order_discount' => $totals['order_discount'],
                'shipping_cost' => $totals['shipping_cost'],
                'grand_total' => $totals['grand_total'],
                'paid_amount' => 0,
                'status' => $data['status'],
                'payment_status' => 3,
                'document' => $documentPath,
                'note' => $data['note'] ?? null,
                'approval_status' => 'pending',
            ]);

            logger([
                'data' => $data,
            ]);

            foreach ($data['product_id'] as $index => $productId) {
                $product = Product::query()->lockForUpdate()->findOrFail($productId);
                $unit = $this->resolvePurchaseUnit($data['purchase_unit'][$index] ?? null, $product, $index);
                $qty = (float) $data['qty'][$index];
                $received = $this->receivedQuantity((int) $data['status'], $qty, (float) $data['received'][$index]);
                $baseReceived = $this->baseQuantity($received, $unit);
                $lineTotal = $this->receivedLineTotal((int) $data['status'], $qty, $received, $totals['lines'][$index]);
                $batchId = null;
                $variantId = null;

                $batchId = $this->findBatchId($product, $data, $index);
                $variantId = $this->findVariantId($product, $data, $index);

                $productPurchase = ProductPurchase::create([
                    'purchase_id' => $purchase->id,
                    'date' => $purchase->purchase_date?->toDateString(),
                    'product_id' => $product->id,
                    'product_batch_id' => $batchId,
                    'variant_id' => $variantId,
                    'batch_no' => $data['batch_no'][$index] ?? null,
                    'expired_date' => $data['expired_date'][$index] ?? null,
                    'qty' => $qty,
                    'recieved' => $received,
                    'purchase_unit_id' => $unit->id,
                    'net_unit_cost' => (float) $data['net_unit_cost'][$index],
                    'discount' => (float) $data['discount'][$index],
                    'tax_rate' => (float) $data['tax_rate'][$index],
                    'tax' => (float) $data['tax'][$index],
                    'total' => $lineTotal,
                ]);

            }

            $this->createPaymentIfNeeded($purchase, $data, $user, $paidAmount);

            return $purchase->load($this->relations());
        });
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = 0.0;
        $totalDiscount = 0.0;
        $totalTax = 0.0;
        $totalCost = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = $this->round(((float) $data['net_unit_cost'][$index] * $qty) - $discount + $tax);

            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalCost += $lineTotal;
        }

        if ((int) $data['status'] === self::STATUS_ORDERED) {
            return [
                'lines' => array_fill_keys(array_keys($lines), 0.0),
                'item' => count($data['product_id']),
                'total_qty' => $this->round($totalQty),
                'total_discount' => 0.0,
                'total_tax' => 0.0,
                'total_cost' => 0.0,
                'order_tax_rate' => 0.0,
                'order_tax' => 0.0,
                'order_discount' => 0.0,
                'shipping_cost' => 0.0,
                'grand_total' => 0.0,
            ];
        }

        $orderTaxRate = (float) ($data['order_tax_rate'] ?? 0);
        $orderDiscount = (float) ($data['order_discount'] ?? 0);
        $shippingCost = (float) ($data['shipping_cost'] ?? 0);
        $orderTax = $this->round(max($totalCost - $orderDiscount, 0) * $orderTaxRate / 100);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => $this->round($totalQty),
            'total_discount' => $this->round($totalDiscount),
            'total_tax' => $this->round($totalTax),
            'total_cost' => $this->round($totalCost),
            'order_tax_rate' => $this->round($orderTaxRate),
            'order_tax' => $orderTax,
            'order_discount' => $this->round($orderDiscount),
            'shipping_cost' => $this->round($shippingCost),
            'grand_total' => $this->round($totalCost + $orderTax + $shippingCost - $orderDiscount),
        ];
    }

    private function receivedQuantity(int $status, float $qty, float $requestedReceived): float
    {
        return match ($status) {
            self::STATUS_RECEIVED => $qty,
            self::STATUS_PENDING, self::STATUS_ORDERED => 0.0,
            default => $requestedReceived,
        };
    }

    private function receivedLineTotal(int $status, float $qty, float $received, float $lineTotal): float
    {
        if (in_array($status, [self::STATUS_PENDING, self::STATUS_ORDERED], true)) {
            return 0.0;
        }

        if ($status === self::STATUS_PARTIAL) {
            return $qty > 0 ? $this->round($lineTotal * ($received / $qty)) : 0.0;
        }

        return $lineTotal;
    }

    private function resolveWarehouseId(array $data, User $user): int
    {
        $warehouseId = $data['warehouse_id'] ?? $user->warehouse_id;

        if (! $warehouseId) {
            $warehouseId = Warehouse::query()->where('is_active', true)->value('id');
        }

        if (! $warehouseId) {
            throw ValidationException::withMessages([
                'warehouse_id' => ['A warehouse is required before creating purchase invoices.'],
            ]);
        }

        return (int) $warehouseId;
    }

    private function resolvePurchaseUnit(mixed $purchaseUnit, Product $product, int|string $index): Unit
    {
        logger([
            'purchaseUnit' => $purchaseUnit,
        ]);
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

    private function baseQuantity(float $qty, Unit $unit): float
    {
        if ($unit->operator === '*') {
            return $qty * (float) $unit->operation_value;
        }

        if ($unit->operator === '/' && (float) $unit->operation_value !== 0.0) {
            return $qty / (float) $unit->operation_value;
        }

        return $qty;
    }

    private function upsertBatch(Product $product, array $data, int|string $index, float $quantity): ?int
    {
        if (! $product->is_batch) {
            return null;
        }

        $batchNo = $data['batch_no'][$index] ?? null;

        if (! $batchNo) {
            return null;
        }

        $batch = ProductBatch::query()
            ->where('product_id', $product->id)
            ->where('batch_no', $batchNo)
            ->lockForUpdate()
            ->first();

        if ($batch) {
            $batch->expired_date = $data['expired_date'][$index];
            $batch->qty = (float) $batch->qty + $quantity;
            $batch->save();

            return $batch->id;
        }

        return ProductBatch::create([
            'product_id' => $product->id,
            'batch_no' => $batchNo,
            'expired_date' => $data['expired_date'][$index],
            'qty' => $quantity,
        ])->id;
    }

    private function increaseProductStock(Product $product, array $data, int|string $index, int $warehouseId, float $quantity, ?int $batchId): ?int
    {
        $variantId = null;

        if ($product->is_variant) {
            $selectedVariantId = $data['variant_id'][$index] ?? null;
            $variant = ProductVariant::query()
                ->where('product_id', $product->id)
                ->when(
                    $selectedVariantId,
                    fn ($query) => $query->where('variant_id', $selectedVariantId),
                    fn ($query) => $query->where('item_code', $data['product_code'][$index] ?? null)
                )
                ->lockForUpdate()
                ->first();

            if (! $variant) {
                throw ValidationException::withMessages([
                    "variant_id.{$index}" => ['Product variant could not be found.'],
                ]);
            }

            $variant->qty = (float) $variant->qty + $quantity;
            $variant->save();
            $variantId = $variant->variant_id;
        }

        $product->qty = (float) $product->qty + $quantity;
        $product->save();

        $warehouseStock = $this->warehouseStockQuery($product->id, $warehouseId, $variantId, $batchId)
            ->lockForUpdate()
            ->first();

        if ($warehouseStock) {
            $warehouseStock->qty = (float) $warehouseStock->qty + $quantity;
            $warehouseStock->save();
        } else {
            ProductWarehouse::create([
                'product_id' => $product->id,
                'variant_id' => $variantId,
                'product_batch_id' => $batchId,
                'warehouse_id' => $warehouseId,
                'qty' => $quantity,
            ]);
        }

        return $variantId;
    }

    private function warehouseStockQuery(int $productId, int $warehouseId, ?int $variantId, ?int $batchId)
    {
        $query = ProductWarehouse::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId);

        $variantId ? $query->where('variant_id', $variantId) : $query->whereNull('variant_id');
        $batchId ? $query->where('product_batch_id', $batchId) : $query->whereNull('product_batch_id');

        return $query;
    }

    private function findBatchId(Product $product, array $data, int|string $index): ?int
    {
        if (! $product->is_batch) {
            return null;
        }

        if (empty($data['batch_no'][$index])) {
            return null;
        }

        return ProductBatch::query()
            ->where('product_id', $product->id)
            ->where('batch_no', $data['batch_no'][$index])
            ->value('id');
    }

    private function findVariantId(Product $product, array $data, int|string $index): ?int
    {
        if (! $product->is_variant || (empty($data['variant_id'][$index]) && empty($data['product_code'][$index]))) {
            return null;
        }

        return ProductVariant::query()
            ->where('product_id', $product->id)
            ->when(
                ! empty($data['variant_id'][$index]),
                fn ($query) => $query->where('variant_id', $data['variant_id'][$index]),
                fn ($query) => $query->where('item_code', $data['product_code'][$index])
            )
            ->value('variant_id');
    }

    private function createPaymentIfNeeded(Purchase $purchase, array $data, User $user, float $paidAmount): void
    {
        if ($paidAmount <= 0) {
            return;
        }

        $account = ! empty($data['account_id'])
            ? Account::query()->whereKey($data['account_id'])->first()
            : Account::query()->where('is_default', true)->first();

        if (! $account) {
            throw ValidationException::withMessages([
                'paid_amount' => ['A default account is required before recording purchase payments.'],
            ]);
        }

        $payment = app(PaymentService::class)->record([
            'purchase_id' => $purchase->id,
            'account_id' => $account->id,
            'supplier_id' => $purchase->supplier_id,
            'payment_reference' => 'ppr-'.date('Ymd').'-'.date('His'),
            'payment_type' => Payment::TYPE_PURCHASE_PAYMENT,
            'direction' => Payment::DIRECTION_OUT,
            'amount' => $paidAmount,
            'change' => (float) ($data['paying_amount'] ?? $paidAmount) - $paidAmount,
            'paying_method' => $this->paymentMethod((int) ($data['paid_by_id'] ?? 1)),
            'payment_note' => $data['payment_note'] ?? null,
        ], $user);

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
    }

    private function paymentStatus(float $paidAmount, float $grandTotal, int $requestedStatus): int
    {
        if ($paidAmount <= 0 && $requestedStatus !== 2) {
            return $requestedStatus;
        }

        return abs($grandTotal - $paidAmount) < 0.01 ? 2 : 1;
    }

    private function paymentMethod(int $paidById): string
    {
        return match ($paidById) {
            1 => 'Cash',
            2 => 'Gift Card',
            default => 'Cheque',
        };
    }

    private function relations(): array
    {
        return [
            'supplier:id,name,email,phone_number',
            'warehouse:id,name',
            'biller:id,name,company_name',
            'user:id,name,email',
            'purchaseStatus:id,value,label',
            'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch,is_variant',
            'products.product.variants.variant:id,name',
            'products.unit:id,unit_code,unit_name',
            'products.batch:id,batch_no,expired_date',
            'products.variant:id,name',
            'payments:id,purchase_id,supplier_id,account_id,payment_reference,payment_type,direction,amount,change,paying_method,payment_note',
        ];
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
