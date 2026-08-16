<?php

namespace Database\Seeders;

use App\Models\Biller;
use App\Models\Product;
use App\Models\ProductPurchase;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacySupplierAndPurchaseSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    private const PIECE_UNIT_ID = 1;

    private const PURCHASE_STATUS_RECEIVED = 1;

    private const PAYMENT_STATUS_UNPAID = 3;

    /** @var array<int, string> */
    private const SUPPLIER_COLUMNS = [
        'id', 'name', 'company', 'address', 'email', 'phone', 'created_at', 'updated_at',
    ];

    /** @var array<int, string> */
    private const PURCHASE_COLUMNS = [
        'id', 'supplier_id', 'discount', 'carrying_and_loading', 'purchased_at', 'cost',
        'amount', 'deleted_at', 'created_at', 'updated_at',
    ];

    /** @var array<int, string> */
    private const PRODUCT_PURCHASE_COLUMNS = [
        'id', 'purchase_id', 'product_id', 'supplier_id', 'qty', 'price', 'sales_price',
        'cost', 'purchased_at', 'created_at', 'updated_at',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $warehouseId = Warehouse::query()->orderBy('id')->value('id');
        $billerId = Biller::query()->orderBy('id')->value('id');
        $fallbackUserId = User::query()->where('email', 'admin@example.com')->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (! $warehouseId) {
            throw new RuntimeException('Cannot import legacy purchases because no warehouse exists.');
        }

        if (! $billerId) {
            throw new RuntimeException('Cannot import legacy purchases because no biller exists.');
        }

        if (! Unit::query()->whereKey(self::PIECE_UNIT_ID)->exists()) {
            throw new RuntimeException('Cannot import legacy purchases because Piece unit ID 1 does not exist.');
        }

        if (! $fallbackUserId) {
            throw new RuntimeException('Cannot import legacy purchases because no application user exists.');
        }

        if (! Schema::hasTable('product_warehouse') || ! Schema::hasTable('product_stock_movements')) {
            throw new RuntimeException('Cannot import legacy purchases because stock warehouse or movement tables do not exist.');
        }

        $legacySuppliers = $this->extractRows($dumpPath, 'suppliers', self::SUPPLIER_COLUMNS);
        $legacyPurchases = $this->extractRows($dumpPath, 'purchases', self::PURCHASE_COLUMNS);
        $legacyProductPurchases = $this->extractRows($dumpPath, 'product_purchase', self::PRODUCT_PURCHASE_COLUMNS);
        $suppliers = $this->transformSuppliers($legacySuppliers);
        $supplierIds = collect($suppliers)->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => true]);
        $productIds = Product::query()->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => true]);
        $activePurchases = [];

        foreach ($legacyPurchases as $legacyPurchase) {
            if ($this->nullableValue($legacyPurchase['deleted_at']) !== null) {
                continue;
            }

            $purchaseId = (int) $legacyPurchase['id'];

            if (isset($activePurchases[$purchaseId])) {
                throw new RuntimeException("Duplicate legacy purchase ID [{$purchaseId}] found in SQL dump.");
            }

            $supplierId = (int) $legacyPurchase['supplier_id'];

            if (! $supplierIds->has($supplierId)) {
                throw new RuntimeException("Cannot import legacy purchase [{$purchaseId}] because supplier [{$supplierId}] does not exist.");
            }

            $activePurchases[$purchaseId] = $legacyPurchase;
        }

        $totals = [];
        $productPurchases = [];

        foreach ($legacyProductPurchases as $legacyLine) {
            $purchaseId = (int) $legacyLine['purchase_id'];

            if (! isset($activePurchases[$purchaseId])) {
                continue;
            }

            $productId = (int) $legacyLine['product_id'];
            $supplierId = (int) $legacyLine['supplier_id'];

            if (! $productIds->has($productId)) {
                throw new RuntimeException("Cannot import legacy purchase [{$purchaseId}] because product [{$productId}] does not exist.");
            }

            if ($supplierId !== (int) $activePurchases[$purchaseId]['supplier_id']) {
                throw new RuntimeException("Cannot import legacy purchase [{$purchaseId}] because a product row has supplier [{$supplierId}].");
            }

            $quantity = (float) $legacyLine['qty'];
            $price = (float) $legacyLine['price'];
            $lineTotal = $this->round($quantity * $price);

            $productPurchases[] = [
                'purchase_id' => $purchaseId,
                'date' => $this->dateValue($legacyLine['purchased_at']),
                'product_id' => $productId,
                'product_batch_id' => null,
                'variant_id' => null,
                'batch_no' => null,
                'expired_date' => null,
                'qty' => $quantity,
                'recieved' => $quantity,
                'purchase_unit_id' => self::PIECE_UNIT_ID,
                'net_unit_cost' => $price,
                'discount' => 0,
                'tax_rate' => 0,
                'tax' => 0,
                'total' => $lineTotal,
                'created_at' => $this->nullableValue($legacyLine['created_at']),
                'updated_at' => $this->nullableValue($legacyLine['updated_at']),
            ];

            $totals[$purchaseId] ??= ['item' => 0, 'total_qty' => 0.0, 'total_cost' => 0.0];
            $totals[$purchaseId]['item']++;
            $totals[$purchaseId]['total_qty'] += $quantity;
            $totals[$purchaseId]['total_cost'] += $lineTotal;
        }

        $purchases = [];
        $mismatchedTotals = 0;

        foreach ($activePurchases as $purchaseId => $legacyPurchase) {
            if (! isset($totals[$purchaseId])) {
                throw new RuntimeException("Cannot import legacy purchase [{$purchaseId}] because it has no product rows.");
            }

            $discount = $this->round((float) $legacyPurchase['discount']);
            $shipping = $this->round((float) $legacyPurchase['carrying_and_loading']);
            $grandTotal = $this->round((float) $legacyPurchase['amount']);
            $calculatedGrandTotal = $this->round($totals[$purchaseId]['total_cost'] - $discount + $shipping);

            if (abs($grandTotal - $calculatedGrandTotal) > 0.01) {
                $mismatchedTotals++;
            }

            $purchases[] = [
                'id' => $purchaseId,
                'reference_no' => "LEGACY-P-{$purchaseId}",
                'purchase_date' => $this->dateValue($legacyPurchase['purchased_at']),
                'user_id' => (int) $fallbackUserId,
                'warehouse_id' => (int) $warehouseId,
                'biller_id' => (int) $billerId,
                'supplier_id' => (int) $legacyPurchase['supplier_id'],
                'item' => $totals[$purchaseId]['item'],
                'total_qty' => $this->round($totals[$purchaseId]['total_qty']),
                'total_discount' => 0,
                'total_tax' => 0,
                'total_cost' => $this->round($totals[$purchaseId]['total_cost']),
                'order_tax_rate' => 0,
                'order_tax' => 0,
                'order_discount' => $discount,
                'shipping_cost' => $shipping,
                'grand_total' => $grandTotal,
                'paid_amount' => 0,
                'status' => self::PURCHASE_STATUS_RECEIVED,
                'payment_status' => self::PAYMENT_STATUS_UNPAID,
                'document' => null,
                'note' => null,
                'created_at' => $this->nullableValue($legacyPurchase['created_at']),
                'updated_at' => $this->nullableValue($legacyPurchase['updated_at']),
                'approval_status' => 'approved',
                'approved_by' => (int) $fallbackUserId,
                'approved_at' => $this->nullableValue($legacyPurchase['updated_at'])
                    ?? $this->nullableValue($legacyPurchase['purchased_at']),
            ];
        }

        $existingStockState = $this->existingPurchaseStockState();

        if ($existingStockState['movements'] !== []) {
            DB::transaction(fn () => $this->reverseExistingPurchaseStock($existingStockState));
        }

        DB::transaction(function () use ($suppliers) {
            foreach (array_chunk($suppliers, 25) as $supplierChunk) {
                Supplier::query()->upsert($supplierChunk, ['id'], [
                    'name', 'image', 'company_name', 'vat_number', 'email', 'phone_number', 'address',
                    'city', 'state', 'postal_code', 'country', 'is_active', 'created_at', 'updated_at',
                ]);
            }
        });

        Schema::disableForeignKeyConstraints();

        try {
            ProductPurchase::query()->truncate();
            Purchase::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use ($purchases, $productPurchases, $warehouseId) {
            foreach (array_chunk($purchases, 25) as $purchaseChunk) {
                Purchase::query()->insert($purchaseChunk);
            }

            foreach (array_chunk($productPurchases, 50) as $lineChunk) {
                ProductPurchase::query()->insert($lineChunk);
            }

            $this->applyImportedPurchaseStock((int) $warehouseId);
        });

        $this->command?->info(
            'Legacy suppliers imported: '.count($suppliers).'. Purchases imported: '.count($purchases)
            .'. Product purchase rows imported: '.count($productPurchases).'.'
        );

        if ($mismatchedTotals > 0) {
            $this->command?->warn("Legacy purchases with header/line total differences: {$mismatchedTotals}.");
        }
    }

    /** @return array<int, array<string, bool|int|string|null>> */
    private function transformSuppliers(array $legacySuppliers): array
    {
        $suppliers = [];

        foreach ($legacySuppliers as $legacySupplier) {
            $supplierId = (int) $legacySupplier['id'];
            $email = $this->nullableValue($legacySupplier['email']);

            $suppliers[] = [
                'id' => $supplierId,
                'name' => trim((string) $legacySupplier['name']),
                'image' => null,
                'company_name' => trim((string) $legacySupplier['company']),
                'vat_number' => null,
                'email' => $email ?? "legacy-supplier-{$supplierId}@invalid.local",
                'phone_number' => trim((string) $legacySupplier['phone']),
                'address' => trim((string) $legacySupplier['address']),
                'city' => '',
                'state' => null,
                'postal_code' => null,
                'country' => null,
                'is_active' => true,
                'created_at' => $this->nullableValue($legacySupplier['created_at']),
                'updated_at' => $this->nullableValue($legacySupplier['updated_at']),
            ];
        }

        return $suppliers;
    }

    /** @return array{movements: array<int, int>, effects: array<int, object>} */
    private function existingPurchaseStockState(): array
    {
        $movementQuery = DB::table('product_stock_movements')->where('source_type', 'product_purchase');
        $movementCount = (clone $movementQuery)->count();

        if ($movementCount === 0) {
            return ['movements' => [], 'effects' => []];
        }

        $expectedMovementCount = DB::table('product_purchases as product_purchase')
            ->join('purchases as purchase', 'purchase.id', '=', 'product_purchase.purchase_id')
            ->join('products as product', 'product.id', '=', 'product_purchase.product_id')
            ->where('purchase.approval_status', 'approved')
            ->whereIn('purchase.status', [1, 2])
            ->where('product_purchase.recieved', '>', 0)
            ->where('product.type', '!=', 'digital')
            ->count();
        $matchingMovementCount = (clone $movementQuery)
            ->join('product_purchases as product_purchase', 'product_purchase.id', '=', 'product_stock_movements.source_id')
            ->join('purchases as purchase', 'purchase.id', '=', 'product_purchase.purchase_id')
            ->where('purchase.approval_status', 'approved')
            ->whereIn('purchase.status', [1, 2])
            ->count();

        if ($movementCount !== $expectedMovementCount || $matchingMovementCount !== $expectedMovementCount) {
            throw new RuntimeException(
                "Cannot safely reimport legacy purchases because purchase stock movements are incomplete. Expected {$expectedMovementCount}; found {$movementCount}."
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
            throw new RuntimeException('Cannot safely reimport legacy purchases with variant, batch, or warehouse-less stock movements.');
        }

        return [
            'movements' => (clone $movementQuery)->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'effects' => (clone $movementQuery)
                ->select(['product_id', 'warehouse_id', DB::raw('SUM(quantity_base) as quantity_base')])
                ->groupBy('product_id', 'warehouse_id')
                ->get()
                ->all(),
        ];
    }

    /** @param array{movements: array<int, int>, effects: array<int, object>} $state */
    private function reverseExistingPurchaseStock(array $state): void
    {
        foreach ($state['effects'] as $effect) {
            $quantity = (float) $effect->quantity_base;
            $productUpdated = Product::query()->whereKey((int) $effect->product_id)->decrement('qty', $quantity);

            if ($productUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy purchase stock because product [{$effect->product_id}] does not exist.");
            }

            $warehouseUpdated = DB::table('product_warehouse')
                ->where('product_id', (int) $effect->product_id)
                ->where('warehouse_id', (int) $effect->warehouse_id)
                ->whereNull('variant_id')
                ->whereNull('product_batch_id')
                ->decrement('qty', $quantity);

            if ($warehouseUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy purchase stock because its warehouse row for product [{$effect->product_id}] is missing or duplicated.");
            }
        }

        foreach (array_chunk($state['movements'], 500) as $movementIds) {
            DB::table('product_stock_movements')->whereIn('id', $movementIds)->delete();
        }
    }

    private function applyImportedPurchaseStock(int $warehouseId): void
    {
        $lines = DB::table('product_purchases as product_purchase')
            ->join('purchases as purchase', 'purchase.id', '=', 'product_purchase.purchase_id')
            ->join('products as product', 'product.id', '=', 'product_purchase.product_id')
            ->where('purchase.approval_status', 'approved')
            ->whereIn('purchase.status', [1, 2])
            ->where('product_purchase.recieved', '>', 0)
            ->where('product.type', '!=', 'digital')
            ->orderBy('product_purchase.date')
            ->orderBy('product_purchase.created_at')
            ->orderBy('product_purchase.id')
            ->select([
                'product_purchase.id', 'product_purchase.product_id', 'product_purchase.recieved',
                'product_purchase.purchase_unit_id', 'product_purchase.date', 'product_purchase.created_at',
                'purchase.user_id', 'purchase.reference_no',
            ])
            ->get();

        if ($lines->isEmpty()) {
            return;
        }

        $productIds = $lines->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->values();
        $productQuantities = Product::query()->whereIn('id', $productIds)->pluck('qty', 'id');

        if ($productQuantities->count() !== $productIds->count()) {
            throw new RuntimeException('Cannot update legacy purchase stock because one or more products do not exist.');
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
                throw new RuntimeException("Cannot update legacy purchase stock because product [{$productId}] has duplicate warehouse rows.");
            }

            $warehouseRow = $rows->first();

            if (! $warehouseRow) {
                $startingQuantity = $productsWithWarehouseStock->has($productId)
                    ? 0.0
                    : (float) $productQuantities->get($productId);
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
                $runningQuantities[$productId] = $startingQuantity;
            } else {
                $warehouseRowIds[$productId] = (int) $warehouseRow->id;
                $runningQuantities[$productId] = (float) $warehouseRow->qty;
            }
        }

        $receivedQuantities = [];
        $movements = [];

        foreach ($lines as $line) {
            $productId = (int) $line->product_id;
            $quantity = (float) $line->recieved;
            $before = $runningQuantities[$productId];
            $after = $before + $quantity;
            $runningQuantities[$productId] = $after;
            $receivedQuantities[$productId] = ($receivedQuantities[$productId] ?? 0.0) + $quantity;

            $movements[] = [
                'product_id' => $productId,
                'warehouse_id' => $warehouseId,
                'product_batch_id' => null,
                'variant_id' => null,
                'unit_id' => (int) $line->purchase_unit_id,
                'user_id' => (int) $line->user_id,
                'source_type' => 'product_purchase',
                'source_id' => (int) $line->id,
                'type' => 'purchase',
                'quantity' => $quantity,
                'quantity_base' => $quantity,
                'before_quantity' => $before,
                'after_quantity' => $after,
                'reference_no' => $line->reference_no,
                'note' => 'Imported from legacy purchase.',
                'movement_date' => $line->date,
                'created_at' => $line->created_at ?? $now,
                'updated_at' => $line->created_at ?? $now,
            ];
        }

        foreach ($receivedQuantities as $productId => $quantity) {
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

    /** @param array<int, string> $columns
     * @return array<int, array<string, string|null>>
     */
    private function extractRows(string $dumpPath, string $table, array $columns): array
    {
        $prefix = "INSERT INTO `{$table}` VALUES ";
        $file = new SplFileObject($dumpPath);
        $rows = [];
        $found = false;

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, $prefix)) {
                continue;
            }

            $found = true;
            $values = rtrim(substr($line, strlen($prefix)), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];

            foreach ($tuples as $tuple) {
                $values = str_getcsv($tuple, ',', "'", '\\');

                if (count($values) !== count($columns)) {
                    throw new RuntimeException("Unable to parse legacy {$table} from SQL dump.");
                }

                $row = array_combine($columns, $values);

                if (! $row) {
                    throw new RuntimeException("Unable to parse legacy {$table} from SQL dump.");
                }

                $rows[] = $row;
            }
        }

        if (! $found) {
            throw new RuntimeException("No INSERT statement found for legacy {$table}.");
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

    private function dateValue(mixed $value): string
    {
        $value = $this->nullableValue($value);

        if ($value === null || strlen($value) < 10) {
            throw new RuntimeException('Unable to parse a legacy purchase date from SQL dump.');
        }

        return substr($value, 0, 10);
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
