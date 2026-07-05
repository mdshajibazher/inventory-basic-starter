<?php

namespace App\Services;

use App\Models\GeneralSetting;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductPurchase;
use App\Models\ProductSale;
use App\Models\Purchase;
use App\Models\ReturnInvoice;
use App\Models\ReturnPurchase;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ApprovalService
{
    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public function canApprove(User $user, string $type): bool
    {
        return in_array($user->id, $this->approverIds($type), true);
    }

    public function assertCanApprove(User $user, string $type): void
    {
        if (! $this->canApprove($user, $type)) {
            throw ValidationException::withMessages([
                'approval' => ['You are not allowed to approve this record.'],
            ]);
        }
    }

    public function approveSale(Sale $sale, User $user): Sale
    {
        $this->assertCanApprove($user, 'sales');

        return DB::transaction(function () use ($sale, $user) {
            $sale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            $this->assertPending($sale);
            $sale->loadMissing(['products.product', 'products.unit']);

            foreach ($sale->products as $line) {
                $product = Product::query()->lockForUpdate()->findOrFail($line->product_id);
                if ((int) $sale->sale_status !== 1 || $product->type === 'digital') {
                    continue;
                }

                if ($product->type === 'combo') {
                    $this->approveComboSale($product, (float) $line->qty, $line, $sale, $user);

                    continue;
                }

                $baseQuantity = app(ProductStockService::class)->convertToBase((float) $line->qty, $line->unit);
                $this->applyStockDelta($product, (int) $sale->warehouse_id, $line->variant_id, $line->product_batch_id, -1 * $baseQuantity);

                app(ProductStockService::class)->recordMovement([
                    'product_id' => $product->id,
                    'warehouse_id' => $sale->warehouse_id,
                    'product_batch_id' => $line->product_batch_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->sale_unit_id ?: null,
                    'user_id' => $user->id,
                    'source_type' => 'product_sale',
                    'source_id' => $line->id,
                    'type' => 'product_sale',
                    'quantity' => -1 * (float) $line->qty,
                    'quantity_base' => -1 * $baseQuantity,
                    'reference_no' => $sale->reference_no,
                    'movement_date' => $sale->sale_date?->toDateString(),
                ]);
            }

            $this->markApproved($sale, $user);

            return $sale->load(['customer:id,name,email,phone_number', 'warehouse:id,name', 'biller:id,name,company_name', 'user:id,name,email', 'approver:id,name,email', 'products']);
        });
    }

    public function approveReturn(ReturnInvoice $returnInvoice, User $user): ReturnInvoice
    {
        $this->assertCanApprove($user, 'returns');

        return DB::transaction(function () use ($returnInvoice, $user) {
            $returnInvoice = ReturnInvoice::query()->lockForUpdate()->findOrFail($returnInvoice->id);
            $this->assertPending($returnInvoice);
            $returnInvoice->loadMissing(['products.product', 'products.unit']);

            foreach ($returnInvoice->products as $line) {
                $product = Product::query()->lockForUpdate()->findOrFail($line->product_id);
                if ($product->type === 'digital') {
                    continue;
                }

                $baseQuantity = app(ProductStockService::class)->convertToBase((float) $line->qty, $line->unit);
                $this->applyStockDelta($product, (int) $returnInvoice->warehouse_id, $line->variant_id, $line->product_batch_id, $baseQuantity);

                app(ProductStockService::class)->recordMovement([
                    'product_id' => $product->id,
                    'warehouse_id' => $returnInvoice->warehouse_id,
                    'product_batch_id' => $line->product_batch_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->sale_unit_id ?: null,
                    'user_id' => $user->id,
                    'source_type' => 'product_return',
                    'source_id' => $line->id,
                    'type' => 'product_return',
                    'quantity' => (float) $line->qty,
                    'quantity_base' => $baseQuantity,
                    'reference_no' => $returnInvoice->reference_no,
                    'movement_date' => $returnInvoice->return_date?->toDateString(),
                ]);
            }

            $this->markApproved($returnInvoice, $user);

            return $returnInvoice->load(['customer:id,name,email,phone_number', 'warehouse:id,name', 'biller:id,name,company_name', 'user:id,name,email', 'approver:id,name,email', 'products']);
        });
    }

    public function approvePurchase(Purchase $purchase, User $user): Purchase
    {
        $this->assertCanApprove($user, 'purchases');

        return DB::transaction(function () use ($purchase, $user) {
            $purchase = Purchase::query()->lockForUpdate()->findOrFail($purchase->id);
            $this->assertPending($purchase);
            $purchase->loadMissing(['products.product', 'products.unit']);

            foreach ($purchase->products as $line) {
                $product = Product::query()->lockForUpdate()->findOrFail($line->product_id);
                $received = (float) $line->recieved;
                if ($received <= 0 || $product->type === 'digital') {
                    continue;
                }

                $baseReceived = app(ProductStockService::class)->convertToBase($received, $line->unit);
                $this->ensurePurchaseBatch($product, $line, $baseReceived);
                $this->applyStockDelta($product, (int) $purchase->warehouse_id, $line->variant_id, $line->product_batch_id, $baseReceived);

                app(ProductStockService::class)->recordMovement([
                    'product_id' => $product->id,
                    'warehouse_id' => $purchase->warehouse_id,
                    'product_batch_id' => $line->product_batch_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->purchase_unit_id,
                    'user_id' => $user->id,
                    'source_type' => 'product_purchase',
                    'source_id' => $line->id,
                    'type' => 'purchase',
                    'quantity' => $received,
                    'quantity_base' => $baseReceived,
                    'reference_no' => $purchase->reference_no,
                    'movement_date' => $purchase->purchase_date?->toDateString(),
                ]);
            }

            $this->markApproved($purchase, $user);

            return $purchase->load(['supplier:id,name,email,phone_number', 'warehouse:id,name', 'user:id,name,email', 'approver:id,name,email', 'purchaseStatus:id,value,label', 'products']);
        });
    }

    public function approvePurchaseReturn(ReturnPurchase $returnPurchase, User $user): ReturnPurchase
    {
        $this->assertCanApprove($user, 'purchase_returns');

        return DB::transaction(function () use ($returnPurchase, $user) {
            $returnPurchase = ReturnPurchase::query()->lockForUpdate()->findOrFail($returnPurchase->id);
            $this->assertPending($returnPurchase);
            $returnPurchase->loadMissing(['products.product', 'products.unit']);

            foreach ($returnPurchase->products as $line) {
                $product = Product::query()->lockForUpdate()->findOrFail($line->product_id);
                if ($product->type === 'digital') {
                    continue;
                }

                $baseQuantity = app(ProductStockService::class)->convertToBase((float) $line->qty, $line->unit);
                $this->applyStockDelta($product, (int) $returnPurchase->warehouse_id, $line->variant_id, $line->product_batch_id, -1 * $baseQuantity);

                app(ProductStockService::class)->recordMovement([
                    'product_id' => $product->id,
                    'warehouse_id' => $returnPurchase->warehouse_id,
                    'product_batch_id' => $line->product_batch_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->purchase_unit_id,
                    'user_id' => $user->id,
                    'source_type' => 'purchase_product_return',
                    'source_id' => $line->id,
                    'type' => 'purchase_return',
                    'quantity' => -1 * (float) $line->qty,
                    'quantity_base' => -1 * $baseQuantity,
                    'reference_no' => $returnPurchase->reference_no,
                    'movement_date' => $returnPurchase->return_date?->toDateString(),
                ]);
            }

            $this->markApproved($returnPurchase, $user);

            return $returnPurchase->load(['supplier:id,name,email,phone_number', 'warehouse:id,name', 'user:id,name,email', 'approver:id,name,email', 'products']);
        });
    }

    public function approvePayment(Payment $payment, User $user): Payment
    {
        $this->assertCanApprove($user, 'payments');

        return DB::transaction(function () use ($payment, $user) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $this->assertPending($payment);

            if (($payment->sale_id && $payment->sale?->approval_status !== self::APPROVED)
                || ($payment->purchase_id && $payment->purchase?->approval_status !== self::APPROVED)
                || ($payment->sale_return_id && $payment->saleReturn?->approval_status !== self::APPROVED)
                || ($payment->purchase_return_id && $payment->purchaseReturn?->approval_status !== self::APPROVED)) {
                throw ValidationException::withMessages([
                    'payment' => ['Linked invoice must be approved before approving this payment.'],
                ]);
            }

            $this->markApproved($payment, $user);
            app(PaymentService::class)->recalculateLinkedInvoice($payment);

            return $payment->load(app(PaymentService::class)->relations());
        });
    }

    public function resetSaleApproval(Sale $sale): void
    {
        if ($sale->approval_status !== self::APPROVED) {
            return;
        }

        app(ProductStockService::class)->reverseSourceMovements('product_sale', $sale->products()->pluck('id')->all());
        $this->markPending($sale);
    }

    public function resetReturnApproval(ReturnInvoice $returnInvoice): void
    {
        if ($returnInvoice->approval_status !== self::APPROVED) {
            return;
        }

        app(ProductStockService::class)->reverseSourceMovements('product_return', $returnInvoice->products()->pluck('id')->all());
        $this->markPending($returnInvoice);
    }

    public function resetPurchaseApproval(Purchase $purchase): void
    {
        if ($purchase->approval_status !== self::APPROVED) {
            return;
        }

        app(ProductStockService::class)->reverseSourceMovements('product_purchase', $purchase->products()->pluck('id')->all());
        $this->markPending($purchase);
    }

    public function resetPurchaseReturnApproval(ReturnPurchase $returnPurchase): void
    {
        if ($returnPurchase->approval_status !== self::APPROVED) {
            return;
        }

        app(ProductStockService::class)->reverseSourceMovements('purchase_product_return', $returnPurchase->products()->pluck('id')->all());
        $this->markPending($returnPurchase);
    }

    public function markPending(Model $model): void
    {
        $model->forceFill([
            'approval_status' => self::PENDING,
            'approved_by' => null,
            'approved_at' => null,
        ])->save();
    }

    private function markApproved(Model $model, User $user): void
    {
        $model->forceFill([
            'approval_status' => self::APPROVED,
            'approved_by' => $user->id,
            'approved_at' => now(),
        ])->save();
    }

    private function assertPending(Model $model): void
    {
        if ($model->approval_status !== self::PENDING) {
            throw ValidationException::withMessages([
                'approval_status' => ['Only pending records can be approved.'],
            ]);
        }
    }

    private function approverIds(string $type): array
    {
        $setting = GeneralSetting::query()->latest('id')->first();
        $field = match ($type) {
            'sales' => 'sales_invoice_approver_ids',
            'returns' => 'return_invoice_approver_ids',
            'purchases' => 'purchase_invoice_approver_ids',
            'purchase_returns' => 'purchase_invoice_approver_ids',
            'payments' => 'payment_approver_ids',
            default => null,
        };

        if (! $setting || ! $field) {
            return [];
        }

        return array_values(array_map('intval', $setting->{$field} ?? []));
    }

    private function applyStockDelta(Product $product, int $warehouseId, ?int $variantId, ?int $batchId, float $delta): void
    {
        app(ProductStockService::class)->applyDelta($product, $warehouseId, $variantId, $batchId, $delta);
    }

    private function ensurePurchaseBatch(Product $product, ProductPurchase $line, float $quantity): void
    {
        if (! $product->is_batch || $line->product_batch_id) {
            return;
        }

        if (! $line->batch_no) {
            return;
        }

        $batch = ProductBatch::query()->create([
            'product_id' => $product->id,
            'batch_no' => $line->batch_no,
            'expired_date' => $line->expired_date,
            'qty' => 0,
        ]);

        $line->forceFill(['product_batch_id' => $batch->id])->save();
    }

    private function approveComboSale(Product $combo, float $soldQty, ProductSale $line, Sale $sale, User $user): void
    {
        $productIds = array_filter(explode(',', (string) $combo->product_list));
        $quantities = array_filter(explode(',', (string) $combo->qty_list), fn ($qty) => $qty !== '');

        foreach ($productIds as $key => $childId) {
            $childQty = $soldQty * (float) ($quantities[$key] ?? 0);

            if ($childQty <= 0) {
                continue;
            }

            $child = Product::query()->lockForUpdate()->findOrFail($childId);
            if ($child->type === 'digital') {
                continue;
            }

            $this->applyStockDelta($child, (int) $sale->warehouse_id, null, null, -1 * $childQty);

            app(ProductStockService::class)->recordMovement([
                'product_id' => $child->id,
                'warehouse_id' => $sale->warehouse_id,
                'product_batch_id' => null,
                'variant_id' => null,
                'unit_id' => null,
                'user_id' => $user->id,
                'source_type' => 'product_sale',
                'source_id' => $line->id,
                'type' => 'product_sale',
                'quantity' => -1 * $childQty,
                'quantity_base' => -1 * $childQty,
                'reference_no' => $sale->reference_no,
                'movement_date' => $sale->sale_date?->toDateString(),
            ]);
        }
    }
}
