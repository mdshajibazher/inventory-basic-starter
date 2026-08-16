<?php

namespace App\Services;

use App\Models\Adjustment;
use App\Models\Product;
use App\Models\ProductAdjustment;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductStockService
{
    public const MANUAL_TYPES = ['stock_increase', 'stock_decrease', 'adjustment', 'opening_stock'];

    public function convertToBase(float $qty, ?Unit $unit): float
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

    public function recordMovement(array $attributes): StockMovement
    {
        $product = Product::query()->findOrFail($attributes['product_id']);
        if ($product->type === 'digital') {
            throw ValidationException::withMessages([
                'product_id' => ['Digital products do not have stock movements.'],
            ]);
        }

        $warehouseId = $attributes['warehouse_id'] ?? null;
        $variantId = $attributes['variant_id'] ?? null;
        $batchId = $attributes['product_batch_id'] ?? null;
        $after = $warehouseId
            ? $this->currentWarehouseQuantity((int) $product->id, (int) $warehouseId, $variantId ? (int) $variantId : null, $batchId ? (int) $batchId : null)
            : (float) $product->qty;
        $quantityBase = (float) $attributes['quantity_base'];

        return StockMovement::create([
            'product_id' => $product->id,
            'warehouse_id' => $warehouseId,
            'product_batch_id' => $batchId,
            'variant_id' => $variantId,
            'unit_id' => $attributes['unit_id'] ?? null,
            'user_id' => $attributes['user_id'] ?? null,
            'source_type' => $attributes['source_type'] ?? null,
            'source_id' => $attributes['source_id'] ?? null,
            'type' => $attributes['type'],
            'quantity' => (float) $attributes['quantity'],
            'quantity_base' => $quantityBase,
            'before_quantity' => $after - $quantityBase,
            'after_quantity' => $after,
            'reference_no' => $attributes['reference_no'] ?? null,
            'note' => $attributes['note'] ?? null,
            'movement_date' => $attributes['movement_date'] ?? now()->toDateString(),
        ]);
    }

    public function createAdjustment(Product $product, array $data, User $user): StockMovement
    {
        return DB::transaction(function () use ($product, $data, $user) {
            $product = Product::query()->lockForUpdate()->findOrFail($product->id);
            $this->assertAdjustableProduct($product, $data);
            $unit = Unit::query()->findOrFail($data['unit_id']);
            $quantity = (float) $data['qty'];
            $signedBase = $this->signedBaseQuantity($quantity, $unit, $data['direction']);

            [$before, $after] = $this->applyAggregateDelta(
                $product,
                (int) $data['warehouse_id'],
                $data['variant_id'] ?? null,
                $data['product_batch_id'] ?? null,
                $signedBase
            );

            return StockMovement::create([
                'product_id' => $product->id,
                'warehouse_id' => $data['warehouse_id'],
                'product_batch_id' => $data['product_batch_id'] ?? null,
                'variant_id' => $data['variant_id'] ?? null,
                'unit_id' => $unit->id,
                'user_id' => $user->id,
                'type' => $data['direction'] === 'increase' ? 'stock_increase' : 'stock_decrease',
                'quantity' => $data['direction'] === 'increase' ? $quantity : -$quantity,
                'quantity_base' => $signedBase,
                'before_quantity' => $before,
                'after_quantity' => $after,
                'reference_no' => 'adj-'.date('Ymd').'-'.date('His'),
                'note' => $data['note'] ?? null,
                'movement_date' => $data['movement_date'] ?? now()->toDateString(),
            ]);
        });
    }

    public function createBatchAdjustment(array $data, User $user, ?string $documentPath = null): Adjustment
    {
        return DB::transaction(function () use ($data, $user, $documentPath) {
            $reference = 'adj-'.now()->format('Ymd-His').'-'.Str::lower(Str::random(4));
            $adjustment = Adjustment::create([
                'reference_no' => $reference,
                'warehouse_id' => $data['warehouse_id'],
                'document' => $documentPath,
                'total_qty' => array_sum(array_map('floatval', $data['qty'])),
                'item' => count($data['product_id']),
                'note' => $data['note'] ?? null,
            ]);

            foreach ($data['product_id'] as $index => $productId) {
                $product = Product::query()->lockForUpdate()->findOrFail($productId);
                $lineData = [
                    'warehouse_id' => $data['warehouse_id'],
                    'product_batch_id' => $data['product_batch_id'][$index] ?? null,
                    'variant_id' => $data['variant_id'][$index] ?? null,
                    'unit_id' => $data['unit_id'][$index],
                    'direction' => $data['direction'][$index],
                    'qty' => (float) $data['qty'][$index],
                    'note' => $data['note'] ?? null,
                ];
                $this->assertAdjustableProduct($product, $lineData);
                $unit = Unit::query()->findOrFail($lineData['unit_id']);
                $signedBase = $this->signedBaseQuantity($lineData['qty'], $unit, $lineData['direction']);

                $productLine = ProductAdjustment::create([
                    'adjustment_id' => $adjustment->id,
                    'product_id' => $product->id,
                    'variant_id' => $lineData['variant_id'],
                    'qty' => $lineData['qty'],
                    'action' => $lineData['direction'],
                ]);

                [$before, $after] = $this->applyAggregateDelta(
                    $product,
                    (int) $lineData['warehouse_id'],
                    $lineData['variant_id'],
                    $lineData['product_batch_id'],
                    $signedBase
                );

                StockMovement::create([
                    'product_id' => $product->id,
                    'warehouse_id' => $lineData['warehouse_id'],
                    'product_batch_id' => $lineData['product_batch_id'],
                    'variant_id' => $lineData['variant_id'],
                    'unit_id' => $unit->id,
                    'user_id' => $user->id,
                    'source_type' => 'product_adjustment',
                    'source_id' => $productLine->id,
                    'type' => $lineData['direction'] === 'increase' ? 'stock_increase' : 'stock_decrease',
                    'quantity' => $lineData['direction'] === 'increase' ? $lineData['qty'] : -$lineData['qty'],
                    'quantity_base' => $signedBase,
                    'before_quantity' => $before,
                    'after_quantity' => $after,
                    'reference_no' => $reference,
                    'note' => $lineData['note'],
                    'movement_date' => now()->toDateString(),
                ]);
            }

            return $adjustment->load([
                'warehouse:id,name',
                'products.product:id,name,code',
                'products.variant:id,name',
                'products.movement.product:id,name,code,type,is_variant,is_batch',
                'products.movement.warehouse:id,name',
                'products.movement.batch:id,batch_no,expired_date',
                'products.movement.variant:id,name',
                'products.movement.unit:id,unit_code,unit_name',
                'products.movement.user:id,name,email',
            ]);
        });
    }

    public function updateAdjustment(StockMovement $movement, array $data, User $user): StockMovement
    {
        return DB::transaction(function () use ($movement, $data, $user) {
            $movement = StockMovement::query()->lockForUpdate()->findOrFail($movement->id);
            $this->assertEditable($movement);

            if ($movement->source_type === 'product_adjustment') {
                $groupWarehouseId = ProductAdjustment::query()
                    ->whereKey($movement->source_id)
                    ->join('adjustments', 'adjustments.id', '=', 'product_adjustments.adjustment_id')
                    ->value('adjustments.warehouse_id');
                if ($groupWarehouseId && (int) $groupWarehouseId !== (int) $data['warehouse_id']) {
                    throw ValidationException::withMessages([
                        'warehouse_id' => ['The warehouse cannot be changed for a grouped stock adjustment.'],
                    ]);
                }
            }

            $product = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
            $this->assertAdjustableProduct($product, $data);
            $unit = Unit::query()->findOrFail($data['unit_id']);
            $newBase = $this->signedBaseQuantity((float) $data['qty'], $unit, $data['direction']);
            $sameStockBucket = (int) $movement->warehouse_id === (int) $data['warehouse_id']
                && (int) ($movement->variant_id ?? 0) === (int) ($data['variant_id'] ?? 0)
                && (int) ($movement->product_batch_id ?? 0) === (int) ($data['product_batch_id'] ?? 0);

            if ($sameStockBucket) {
                [$before, $after] = $this->applyAggregateDelta(
                    $product,
                    (int) $data['warehouse_id'],
                    $data['variant_id'] ?? null,
                    $data['product_batch_id'] ?? null,
                    $newBase - (float) $movement->quantity_base
                );
            } else {
                $this->applyAggregateDelta(
                    $product,
                    (int) $movement->warehouse_id,
                    $movement->variant_id,
                    $movement->product_batch_id,
                    -1 * (float) $movement->quantity_base
                );
                [$before, $after] = $this->applyAggregateDelta(
                    $product,
                    (int) $data['warehouse_id'],
                    $data['variant_id'] ?? null,
                    $data['product_batch_id'] ?? null,
                    $newBase
                );
            }

            $movement->update([
                'warehouse_id' => $data['warehouse_id'],
                'product_batch_id' => $data['product_batch_id'] ?? null,
                'variant_id' => $data['variant_id'] ?? null,
                'unit_id' => $unit->id,
                'user_id' => $user->id,
                'type' => $data['direction'] === 'increase' ? 'stock_increase' : 'stock_decrease',
                'quantity' => $data['direction'] === 'increase' ? (float) $data['qty'] : -(float) $data['qty'],
                'quantity_base' => $newBase,
                'before_quantity' => $before,
                'after_quantity' => $after,
                'note' => $data['note'] ?? null,
                'movement_date' => $data['movement_date'] ?? now()->toDateString(),
            ]);

            $this->syncGroupedAdjustmentLine($movement);

            return $movement;
        });
    }

    public function deleteAdjustment(StockMovement $movement): void
    {
        DB::transaction(function () use ($movement) {
            $movement = StockMovement::query()->lockForUpdate()->findOrFail($movement->id);
            $this->assertEditable($movement);
            $product = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
            $this->applyAggregateDelta(
                $product,
                (int) $movement->warehouse_id,
                $movement->variant_id,
                $movement->product_batch_id,
                -1 * (float) $movement->quantity_base
            );
            $sourceType = $movement->source_type;
            $sourceId = $movement->source_id;
            $movement->delete();

            if ($sourceType === 'product_adjustment' && $sourceId) {
                $line = ProductAdjustment::query()->find($sourceId);
                if ($line) {
                    $adjustmentId = $line->adjustment_id;
                    $line->delete();
                    $this->refreshGroupedAdjustment($adjustmentId);
                }
            }
        });
    }

    public function applyDelta(Product $product, int $warehouseId, ?int $variantId, ?int $batchId, float $delta): array
    {
        return $this->applyAggregateDelta($product, $warehouseId, $variantId, $batchId, $delta);
    }

    public function reverseSourceMovements(string $sourceType, array $sourceIds): void
    {
        if ($sourceIds === []) {
            return;
        }

        StockMovement::query()
            ->where('source_type', $sourceType)
            ->whereIn('source_id', $sourceIds)
            ->lockForUpdate()
            ->get()
            ->each(function (StockMovement $movement) {
                $product = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
                $this->applyAggregateDelta(
                    $product,
                    (int) $movement->warehouse_id,
                    $movement->variant_id,
                    $movement->product_batch_id,
                    -1 * (float) $movement->quantity_base
                );
                $movement->delete();
            });
    }

    private function signedBaseQuantity(float $quantity, Unit $unit, string $direction): float
    {
        $base = $this->convertToBase($quantity, $unit);

        return $direction === 'increase' ? $base : -$base;
    }

    private function syncGroupedAdjustmentLine(StockMovement $movement): void
    {
        if ($movement->source_type !== 'product_adjustment' || ! $movement->source_id) {
            return;
        }

        $line = ProductAdjustment::query()->find($movement->source_id);
        if (! $line) {
            return;
        }

        $line->update([
            'variant_id' => $movement->variant_id,
            'qty' => abs((float) $movement->quantity),
            'action' => (float) $movement->quantity >= 0 ? 'increase' : 'decrease',
        ]);
        $this->refreshGroupedAdjustment($line->adjustment_id);
    }

    private function refreshGroupedAdjustment(int $adjustmentId): void
    {
        $adjustment = Adjustment::query()->find($adjustmentId);
        if (! $adjustment) {
            return;
        }

        $lines = ProductAdjustment::query()->where('adjustment_id', $adjustmentId)->get();
        if ($lines->isEmpty()) {
            if ($adjustment->document) {
                Storage::disk('public')->delete($adjustment->document);
            }
            $adjustment->delete();

            return;
        }

        $adjustment->update([
            'item' => $lines->count(),
            'total_qty' => $lines->sum('qty'),
        ]);
    }

    private function applyAggregateDelta(Product $product, int $warehouseId, ?int $variantId, ?int $batchId, float $delta): array
    {
        if ($delta === 0.0) {
            $current = $this->currentWarehouseQuantity($product->id, $warehouseId, $variantId, $batchId);

            return [$current, $current];
        }

        $product->refresh();
        $before = $this->currentWarehouseQuantity($product->id, $warehouseId, $variantId, $batchId);
        $after = $before + $delta;
        if ($after < 0) {
            throw ValidationException::withMessages([
                'qty' => ['Stock decrease cannot exceed current stock.'],
            ]);
        }

        $productAfter = (float) $product->qty + $delta;
        if ($productAfter < 0) {
            throw ValidationException::withMessages([
                'qty' => ['Product stock cannot become negative.'],
            ]);
        }
        $product->qty = $productAfter;
        $product->save();

        if ($variantId) {
            $variant = ProductVariant::query()
                ->where('product_id', $product->id)
                ->where('variant_id', $variantId)
                ->lockForUpdate()
                ->firstOrFail();
            $variantAfter = (float) $variant->qty + $delta;
            if ($variantAfter < 0) {
                throw ValidationException::withMessages([
                    'qty' => ['Variant stock cannot become negative.'],
                ]);
            }
            $variant->qty = $variantAfter;
            $variant->save();
        }

        if ($batchId) {
            $batch = ProductBatch::query()
                ->whereKey($batchId)
                ->where('product_id', $product->id)
                ->lockForUpdate()
                ->firstOrFail();
            $batchAfter = (float) $batch->qty + $delta;
            if ($batchAfter < 0) {
                throw ValidationException::withMessages([
                    'qty' => ['Batch stock cannot become negative.'],
                ]);
            }
            $batch->qty = $batchAfter;
            $batch->save();
        }

        $warehouseStock = ProductWarehouse::query()
            ->where('product_id', $product->id)
            ->where('warehouse_id', $warehouseId)
            ->when($variantId, fn ($query) => $query->where('variant_id', $variantId), fn ($query) => $query->whereNull('variant_id'))
            ->when($batchId, fn ($query) => $query->where('product_batch_id', $batchId), fn ($query) => $query->whereNull('product_batch_id'))
            ->lockForUpdate()
            ->first();

        if (! $warehouseStock) {
            $warehouseStock = ProductWarehouse::create([
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'variant_id' => $variantId,
                'product_batch_id' => $batchId,
                'qty' => 0,
            ]);
        }

        $warehouseStock->qty = $after;
        $warehouseStock->save();

        return [$before, $after];
    }

    public function currentWarehouseQuantity(int $productId, int $warehouseId, ?int $variantId, ?int $batchId): float
    {
        $quantity = ProductWarehouse::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->when($variantId, fn ($query) => $query->where('variant_id', $variantId), fn ($query) => $query->whereNull('variant_id'))
            ->when($batchId, fn ($query) => $query->where('product_batch_id', $batchId), fn ($query) => $query->whereNull('product_batch_id'))
            ->lockForUpdate()
            ->value('qty');

        if ($quantity !== null) {
            return (float) $quantity;
        }

        if ($variantId || $batchId) {
            return 0.0;
        }

        if (ProductWarehouse::query()->where('product_id', $productId)->exists()) {
            return 0.0;
        }

        $product = Product::query()
            ->whereKey($productId)
            ->where(function ($query) {
                $query->whereNull('is_variant')->orWhere('is_variant', false);
            })
            ->where(function ($query) {
                $query->whereNull('is_batch')->orWhere('is_batch', false);
            })
            ->lockForUpdate()
            ->first(['qty']);

        return (float) ($product?->qty ?? 0);
    }

    private function assertAdjustableProduct(Product $product, array $data): void
    {
        if ($product->type === 'digital') {
            throw ValidationException::withMessages([
                'product_id' => ['Digital products do not have stock.'],
            ]);
        }

        if ($product->is_variant && empty($data['variant_id'])) {
            throw ValidationException::withMessages([
                'variant_id' => ['Variant is required for this product.'],
            ]);
        }

        if (! empty($data['variant_id'])) {
            ProductVariant::query()
                ->where('product_id', $product->id)
                ->where('variant_id', $data['variant_id'])
                ->firstOrFail();
        }

        if (! empty($data['product_batch_id'])) {
            ProductBatch::query()
                ->whereKey($data['product_batch_id'])
                ->where('product_id', $product->id)
                ->firstOrFail();
        }
    }

    private function assertEditable(StockMovement $movement): void
    {
        if (! in_array($movement->type, self::MANUAL_TYPES, true)) {
            throw ValidationException::withMessages([
                'movement' => ['Only manual adjustment rows can be changed.'],
            ]);
        }
    }
}
