<?php

namespace Database\Seeders;

use App\Models\Adjustment;
use App\Models\Product;
use App\Models\ProductAdjustment;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyStockAdjustmentSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    private const PIECE_UNIT_ID = 1;

    /** @var array<int, string> */
    private const ADJUST_COLUMNS = [
        'id', 'type', 'product_id', 'qty', 'notes', 'adjusted_at', 'created_at', 'updated_at',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $warehouseId = Warehouse::query()->orderBy('id')->value('id');
        $fallbackUserId = User::query()->where('email', 'admin@example.com')->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (! $warehouseId) {
            throw new RuntimeException('Cannot import legacy stock adjustments because no warehouse exists.');
        }

        if (! $fallbackUserId) {
            throw new RuntimeException('Cannot import legacy stock adjustments because no application user exists.');
        }

        if (! Unit::query()->whereKey(self::PIECE_UNIT_ID)->exists()) {
            throw new RuntimeException('Cannot import legacy stock adjustments because Piece unit ID 1 does not exist.');
        }

        if (! Schema::hasTable('product_warehouse') || ! Schema::hasTable('product_stock_movements')) {
            throw new RuntimeException('Cannot import legacy stock adjustments because stock warehouse or movement tables do not exist.');
        }

        $legacyAdjustments = $this->extractRows($dumpPath);
        $productIds = Product::query()->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => true]);
        $adjustments = [];
        $productAdjustments = [];
        $movementDates = [];
        $directionMismatches = 0;
        $skippedZeroRows = 0;

        foreach ($legacyAdjustments as $legacyAdjustment) {
            $signedQuantity = (float) $legacyAdjustment['qty'];

            if ($signedQuantity == 0.0) {
                $skippedZeroRows++;

                continue;
            }

            $adjustmentId = (int) $legacyAdjustment['id'];
            $productId = (int) $legacyAdjustment['product_id'];

            if (! $productIds->has($productId)) {
                throw new RuntimeException("Cannot import legacy stock adjustment [{$adjustmentId}] because product [{$productId}] does not exist.");
            }

            $action = $signedQuantity > 0 ? 'increase' : 'decrease';
            $legacyType = mb_strtolower(trim((string) $legacyAdjustment['type']));

            if ($legacyType !== $action) {
                $directionMismatches++;
            }

            $adjustedAt = $this->dateTimeValue($legacyAdjustment['adjusted_at']);
            $createdAt = $this->nullableValue($legacyAdjustment['created_at']) ?? $adjustedAt;
            $updatedAt = $this->nullableValue($legacyAdjustment['updated_at']) ?? $createdAt;
            $quantity = abs($signedQuantity);

            $adjustments[] = [
                'id' => $adjustmentId,
                'reference_no' => "LEGACY-ADJ-{$adjustmentId}",
                'warehouse_id' => (int) $warehouseId,
                'document' => null,
                'total_qty' => $quantity,
                'item' => 1,
                'note' => $this->nullableValue($legacyAdjustment['notes']),
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ];
            $productAdjustments[] = [
                'adjustment_id' => $adjustmentId,
                'product_id' => $productId,
                'variant_id' => null,
                'qty' => $quantity,
                'action' => $action,
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ];
            $movementDates[$adjustmentId] = substr($adjustedAt, 0, 10);
        }

        $existingStockState = $this->existingAdjustmentStockState();

        if ($existingStockState['movements'] !== []) {
            DB::transaction(fn () => $this->reverseExistingAdjustmentStock($existingStockState));
        }

        Schema::disableForeignKeyConstraints();

        try {
            ProductAdjustment::query()->truncate();
            Adjustment::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use (
            $adjustments,
            $productAdjustments,
            $warehouseId,
            $fallbackUserId,
            $movementDates
        ) {
            foreach (array_chunk($adjustments, 50) as $adjustmentChunk) {
                Adjustment::query()->insert($adjustmentChunk);
            }

            foreach (array_chunk($productAdjustments, 100) as $lineChunk) {
                ProductAdjustment::query()->insert($lineChunk);
            }

            $this->applyImportedAdjustmentStock(
                (int) $warehouseId,
                (int) $fallbackUserId,
                $movementDates
            );
        });

        $this->command?->info(
            'Legacy stock adjustments imported: '.count($adjustments)
            .'. Product adjustment rows imported: '.count($productAdjustments).'.'
        );
        $this->command?->info("Legacy zero-quantity adjustments skipped: {$skippedZeroRows}.");

        if ($directionMismatches > 0) {
            $this->command?->warn(
                "Legacy adjustments whose type conflicted with signed quantity: {$directionMismatches}. Signed quantity was used."
            );
        }
    }

    /** @return array{movements: array<int, int>, effects: array<int, object>} */
    private function existingAdjustmentStockState(): array
    {
        $movementQuery = DB::table('product_stock_movements')
            ->where('source_type', 'product_adjustment');
        $movementCount = (clone $movementQuery)->count();

        if ($movementCount === 0) {
            return ['movements' => [], 'effects' => []];
        }

        $lineCount = ProductAdjustment::query()->count();
        $matchingMovementCount = (clone $movementQuery)
            ->join('product_adjustments', 'product_adjustments.id', '=', 'product_stock_movements.source_id')
            ->count();

        if ($movementCount !== $lineCount || $matchingMovementCount !== $lineCount) {
            throw new RuntimeException(
                "Cannot safely reimport legacy stock adjustments because movements are incomplete. Expected {$lineCount}; found {$movementCount}."
            );
        }

        $unsupportedMovementCount = (clone $movementQuery)
            ->where(function ($query) {
                $query->whereNotNull('variant_id')
                    ->orWhereNotNull('product_batch_id')
                    ->orWhereNull('warehouse_id');
            })
            ->count();

        if ($unsupportedMovementCount > 0) {
            throw new RuntimeException('Cannot safely reimport legacy stock adjustments with variant, batch, or warehouse-less movements.');
        }

        return [
            'movements' => (clone $movementQuery)->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'effects' => (clone $movementQuery)
                ->select([
                    'product_id',
                    'warehouse_id',
                    DB::raw('SUM(quantity_base) as quantity_base'),
                ])
                ->groupBy('product_id', 'warehouse_id')
                ->get()
                ->all(),
        ];
    }

    /** @param array{movements: array<int, int>, effects: array<int, object>} $state */
    private function reverseExistingAdjustmentStock(array $state): void
    {
        foreach ($state['effects'] as $effect) {
            $reverseQuantity = -1 * (float) $effect->quantity_base;
            $productUpdated = Product::query()
                ->whereKey((int) $effect->product_id)
                ->increment('qty', $reverseQuantity);

            if ($productUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy stock adjustment because product [{$effect->product_id}] does not exist.");
            }

            $warehouseUpdated = DB::table('product_warehouse')
                ->where('product_id', (int) $effect->product_id)
                ->where('warehouse_id', (int) $effect->warehouse_id)
                ->whereNull('variant_id')
                ->whereNull('product_batch_id')
                ->increment('qty', $reverseQuantity);

            if ($warehouseUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy stock adjustment because its warehouse row for product [{$effect->product_id}] is missing or duplicated.");
            }
        }

        foreach (array_chunk($state['movements'], 500) as $movementIds) {
            DB::table('product_stock_movements')->whereIn('id', $movementIds)->delete();
        }
    }

    /** @param array<int, string> $movementDates */
    private function applyImportedAdjustmentStock(int $warehouseId, int $userId, array $movementDates): void
    {
        $lines = DB::table('product_adjustments as product_adjustment')
            ->join('adjustments as adjustment', 'adjustment.id', '=', 'product_adjustment.adjustment_id')
            ->join('products as product', 'product.id', '=', 'product_adjustment.product_id')
            ->where('product.type', '!=', 'digital')
            ->select([
                'product_adjustment.id',
                'product_adjustment.adjustment_id',
                'product_adjustment.product_id',
                'product_adjustment.qty',
                'product_adjustment.action',
                'product_adjustment.created_at',
                'adjustment.reference_no',
                'adjustment.note',
            ])
            ->get()
            ->sortBy(fn ($line) => sprintf(
                '%s-%010d',
                $movementDates[(int) $line->adjustment_id],
                (int) $line->adjustment_id
            ))
            ->values();

        if ($lines->isEmpty()) {
            return;
        }

        $productIds = $lines->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->values();
        $productQuantities = Product::query()->whereIn('id', $productIds)->pluck('qty', 'id');

        if ($productQuantities->count() !== $productIds->count()) {
            throw new RuntimeException('Cannot update legacy stock adjustments because one or more products do not exist.');
        }

        $productsWithWarehouseStock = DB::table('product_warehouse')
            ->whereIn('product_id', $productIds)
            ->distinct()
            ->pluck('product_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true]);
        $warehouseRows = DB::table('product_warehouse')
            ->whereIn('product_id', $productIds)
            ->where('warehouse_id', $warehouseId)
            ->whereNull('variant_id')
            ->whereNull('product_batch_id')
            ->orderBy('id')
            ->get()
            ->groupBy(fn ($row) => (int) $row->product_id);
        $warehouseRowIds = [];
        $runningQuantities = [];
        $now = now();

        foreach ($productIds as $productId) {
            $rows = $warehouseRows->get($productId, collect());

            if ($rows->count() > 1) {
                throw new RuntimeException("Cannot update legacy stock adjustments because product [{$productId}] has duplicate warehouse rows.");
            }

            $warehouseRow = $rows->first();
            $startingQuantity = $warehouseRow
                ? (float) $warehouseRow->qty
                : ($productsWithWarehouseStock->has($productId) ? 0.0 : (float) $productQuantities->get($productId));

            if ($warehouseRow) {
                $warehouseRowIds[$productId] = (int) $warehouseRow->id;
            } else {
                $warehouseRowIds[$productId] = DB::table('product_warehouse')->insertGetId([
                    'product_id' => $productId,
                    'variant_id' => null,
                    'product_batch_id' => null,
                    'warehouse_id' => $warehouseId,
                    'qty' => $startingQuantity,
                    'price' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $runningQuantities[$productId] = $startingQuantity;
        }

        $adjustedQuantities = [];
        $movements = [];

        foreach ($lines as $line) {
            $productId = (int) $line->product_id;
            $quantity = (float) $line->qty;
            $signedQuantity = $line->action === 'increase' ? $quantity : -1 * $quantity;
            $before = $runningQuantities[$productId];
            $after = $before + $signedQuantity;
            $runningQuantities[$productId] = $after;
            $adjustedQuantities[$productId] = ($adjustedQuantities[$productId] ?? 0.0) + $signedQuantity;

            $movements[] = [
                'product_id' => $productId,
                'warehouse_id' => $warehouseId,
                'product_batch_id' => null,
                'variant_id' => null,
                'unit_id' => self::PIECE_UNIT_ID,
                'user_id' => $userId,
                'source_type' => 'product_adjustment',
                'source_id' => (int) $line->id,
                'type' => $signedQuantity > 0 ? 'stock_increase' : 'stock_decrease',
                'quantity' => $signedQuantity,
                'quantity_base' => $signedQuantity,
                'before_quantity' => $before,
                'after_quantity' => $after,
                'reference_no' => $line->reference_no,
                'note' => $line->note,
                'movement_date' => $movementDates[(int) $line->adjustment_id],
                'created_at' => $line->created_at ?? $now,
                'updated_at' => $line->created_at ?? $now,
            ];
        }

        foreach ($adjustedQuantities as $productId => $quantity) {
            Product::query()->whereKey($productId)->increment('qty', $quantity);
            DB::table('product_warehouse')->where('id', $warehouseRowIds[$productId])->update([
                'qty' => $runningQuantities[$productId],
                'updated_at' => $now,
            ]);
        }

        foreach (array_chunk($movements, 100) as $movementChunk) {
            DB::table('product_stock_movements')->insert($movementChunk);
        }
    }

    /** @return array<int, array<string, string|null>> */
    private function extractRows(string $dumpPath): array
    {
        $prefix = 'INSERT INTO `adjusts` VALUES ';
        $file = new SplFileObject($dumpPath);
        $rows = [];
        $found = false;

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, $prefix)) {
                continue;
            }

            $found = true;
            $tuples = preg_split('/\),\(/', trim(rtrim(substr($line, strlen($prefix)), ';'), '()')) ?: [];

            foreach ($tuples as $tuple) {
                $values = str_getcsv($tuple, ',', "'", '\\');

                if (count($values) !== count(self::ADJUST_COLUMNS)) {
                    throw new RuntimeException('Unable to parse legacy adjusts from SQL dump.');
                }

                $row = array_combine(self::ADJUST_COLUMNS, $values);

                if (! $row) {
                    throw new RuntimeException('Unable to parse legacy adjusts from SQL dump.');
                }

                $rows[] = $row;
            }
        }

        if (! $found) {
            throw new RuntimeException('No INSERT statement found for legacy adjusts.');
        }

        return $rows;
    }

    private function nullableValue(mixed $value): ?string
    {
        if ($value === null || strtoupper(trim((string) $value)) === 'NULL') {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function dateTimeValue(mixed $value): string
    {
        $value = $this->nullableValue($value);

        if ($value === null || strlen($value) < 10) {
            throw new RuntimeException('Unable to parse a legacy stock adjustment date.');
        }

        return $value;
    }
}
