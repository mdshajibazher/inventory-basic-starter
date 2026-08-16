<?php

namespace Database\Seeders;

use App\Models\Biller;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductSale;
use App\Models\Sale;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacySaleSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    private const PIECE_UNIT_ID = 1;

    /**
     * @var array<int, string>
     */
    private const SALE_COLUMNS = [
        'id',
        'user_id',
        'discount',
        'carrying_and_loading',
        'sales_at',
        'amount',
        'sales_status',
        'provided_by',
        'approved_by',
        'edited',
        'changes_text',
        'delivery_status',
        'delivery_marked_by',
        'deliveryinfo',
        'is_condition',
        'condition_amount',
        'delivered_at',
        'reference',
        'cust_sms',
        'd_agent_sms',
        'deleted_at',
        'created_at',
        'updated_at',
    ];

    /**
     * @var array<int, string>
     */
    private const PRODUCT_SALE_COLUMNS = [
        'id',
        'product_id',
        'sale_id',
        'user_id',
        'qty',
        'free',
        'price',
        'sales_at',
        'created_at',
        'updated_at',
    ];

    /**
     * @var array<int, string>
     */
    private const USER_COLUMNS = [
        'id',
        'name',
        'proprietor',
        'email',
        'inventory_email',
        'phone',
        'custom_email',
        'address',
        'company',
        'division_id',
        'email_verified_at',
        'password',
        'user_type',
        'image',
        'status',
        'pricedata',
        'section_id',
        'provider',
        'deleted_at',
        'remember_token',
        'created_at',
        'updated_at',
    ];

    /**
     * @var array<int, string>
     */
    private const ADMIN_COLUMNS = [
        'id',
        'name',
        'adminname',
        'email',
        'phone',
        'image',
        'email_verified_at',
        'password',
        'signature',
        'remember_token',
        'status',
        'created_at',
        'updated_at',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $warehouseId = Warehouse::query()->orderBy('id')->value('id');
        $billerId = Biller::query()->orderBy('id')->value('id');
        $pieceUnitExists = Unit::query()->whereKey(self::PIECE_UNIT_ID)->exists();
        $fallbackUserId = User::query()->where('email', 'admin@example.com')->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (! $warehouseId) {
            throw new RuntimeException('Cannot import legacy sales because no warehouse exists.');
        }

        if (! $billerId) {
            throw new RuntimeException('Cannot import legacy sales because no biller exists.');
        }

        if (! $pieceUnitExists) {
            throw new RuntimeException('Cannot import legacy sales because Piece unit ID 1 does not exist.');
        }

        if (! $fallbackUserId) {
            throw new RuntimeException('Cannot import legacy sales because no application user exists.');
        }

        if (! Schema::hasTable('product_warehouse') || ! Schema::hasTable('product_stock_movements')) {
            throw new RuntimeException('Cannot import legacy sales because stock warehouse or movement tables do not exist.');
        }

        $legacySales = $this->extractRows($dumpPath, 'sales', self::SALE_COLUMNS);
        $legacyProductSales = $this->extractRows($dumpPath, 'product_sale', self::PRODUCT_SALE_COLUMNS);
        $legacyUsers = $this->extractRows($dumpPath, 'users', self::USER_COLUMNS);
        $legacyAdmins = $this->extractRows($dumpPath, 'admins', self::ADMIN_COLUMNS);

        $customerIds = $this->mapCustomerIds($legacyUsers);
        [$adminIds, $adminIdsByName] = $this->mapAdminIds($legacyAdmins);
        $productCosts = Product::query()->pluck('cost', 'id');

        $activeSales = [];

        foreach ($legacySales as $legacySale) {
            if ($this->nullableValue($legacySale['deleted_at']) !== null) {
                continue;
            }

            $legacySaleId = (int) $legacySale['id'];

            if (isset($activeSales[$legacySaleId])) {
                throw new RuntimeException("Duplicate legacy sale ID [{$legacySaleId}] found in SQL dump.");
            }

            $activeSales[$legacySaleId] = $legacySale;
        }

        $totals = [];
        $productSales = [];

        foreach ($legacyProductSales as $legacyProductSale) {
            $saleId = (int) $legacyProductSale['sale_id'];

            if (! isset($activeSales[$saleId])) {
                continue;
            }

            $productId = (int) $legacyProductSale['product_id'];

            if (! $productCosts->has($productId)) {
                throw new RuntimeException("Cannot import legacy sale [{$saleId}] because product [{$productId}] does not exist.");
            }

            $paidQuantity = (float) $legacyProductSale['qty'];
            $freeQuantity = (float) $legacyProductSale['free'];
            $quantity = $paidQuantity + $freeQuantity;
            $price = (float) $legacyProductSale['price'];
            $discount = $this->round($freeQuantity * $price);
            $lineTotal = $this->round($paidQuantity * $price);
            $unitCost = $this->round((float) $productCosts->get($productId));

            $productSales[] = [
                'sale_id' => $saleId,
                'date' => $this->dateValue($legacyProductSale['sales_at']),
                'product_id' => $productId,
                'variant_id' => null,
                'product_batch_id' => null,
                'qty' => $quantity,
                'sale_unit_id' => self::PIECE_UNIT_ID,
                'net_unit_price' => $price,
                'discount' => $discount,
                'tax_rate' => 0,
                'tax' => 0,
                'total' => $lineTotal,
                'unit_cost' => $unitCost,
                'total_cost' => $this->round($unitCost * $quantity),
                'created_at' => $this->nullableValue($legacyProductSale['created_at']),
                'updated_at' => $this->nullableValue($legacyProductSale['updated_at']),
            ];

            $totals[$saleId] ??= [
                'item' => 0,
                'total_qty' => 0.0,
                'total_discount' => 0.0,
                'total_price' => 0.0,
            ];
            $totals[$saleId]['item']++;
            $totals[$saleId]['total_qty'] += $quantity;
            $totals[$saleId]['total_discount'] += $discount;
            $totals[$saleId]['total_price'] += $lineTotal;
        }

        $sales = [];
        $mismatchedTotals = 0;

        foreach ($activeSales as $legacySaleId => $legacySale) {
            if (! isset($totals[$legacySaleId])) {
                throw new RuntimeException("Cannot import legacy sale [{$legacySaleId}] because it has no product rows.");
            }

            $legacyCustomerId = (int) $legacySale['user_id'];
            $customerId = $customerIds[$legacyCustomerId] ?? null;

            if (! $customerId) {
                throw new RuntimeException("Cannot import legacy sale [{$legacySaleId}] because customer [{$legacyCustomerId}] could not be mapped.");
            }

            $legacyApproverId = (int) $legacySale['approved_by'];
            $approved = (int) $legacySale['sales_status'] === 1;
            $providedBy = $this->normalizeName($legacySale['provided_by']);
            $creatorId = $adminIdsByName[$providedBy]
                ?? $adminIds[$legacyApproverId]
                ?? $fallbackUserId;
            $reference = $this->nullableValue($legacySale['reference']);
            $referenceNo = $reference !== null
                ? mb_substr($reference, 0, 255)
                : "LEGACY-S-{$legacySaleId}";
            $grandTotal = $this->round((float) $legacySale['amount']);
            $calculatedGrandTotal = $this->round(
                $totals[$legacySaleId]['total_price']
                - (float) $legacySale['discount']
                + (float) $legacySale['carrying_and_loading']
            );

            if (abs($grandTotal - $calculatedGrandTotal) > 0.01) {
                $mismatchedTotals++;
            }

            $sales[] = [
                'id' => $legacySaleId,
                'reference_no' => $referenceNo,
                'sale_date' => $this->dateValue($legacySale['sales_at']),
                'user_id' => $creatorId,
                'cash_register_id' => null,
                'customer_id' => $customerId,
                'warehouse_id' => (int) $warehouseId,
                'biller_id' => (int) $billerId,
                'item' => $totals[$legacySaleId]['item'],
                'total_qty' => $this->round($totals[$legacySaleId]['total_qty']),
                'total_discount' => $this->round($totals[$legacySaleId]['total_discount']),
                'total_tax' => 0,
                'total_price' => $this->round($totals[$legacySaleId]['total_price']),
                'order_tax_rate' => 0,
                'order_tax' => 0,
                'order_discount' => $this->round((float) $legacySale['discount']),
                'coupon_id' => null,
                'coupon_discount' => 0,
                'shipping_cost' => $this->round((float) $legacySale['carrying_and_loading']),
                'grand_total' => $grandTotal,
                'sale_status' => 1,
                'payment_status' => 2,
                'document' => null,
                'paid_amount' => 0,
                'sale_note' => $reference === null ? null : $reference,
                'staff_note' => $this->nullableValue($legacySale['changes_text']),
                'created_at' => $this->nullableValue($legacySale['created_at']),
                'updated_at' => $this->nullableValue($legacySale['updated_at']),
                'approval_status' => $approved ? 'approved' : 'pending',
                'approved_by' => $approved ? ($adminIds[$legacyApproverId] ?? null) : null,
                'approved_at' => $approved
                    ? ($this->nullableValue($legacySale['updated_at']) ?? $this->nullableValue($legacySale['sales_at']))
                    : null,
            ];
        }

        $existingStockState = $this->existingSaleStockState();

        if ($existingStockState['movements'] !== []) {
            DB::transaction(fn () => $this->reverseExistingSaleStock($existingStockState));
        }

        Schema::disableForeignKeyConstraints();

        try {
            ProductSale::query()->truncate();
            Sale::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use ($sales, $productSales, $warehouseId) {
            foreach (array_chunk($sales, 25) as $saleChunk) {
                Sale::query()->insert($saleChunk);
            }

            foreach (array_chunk($productSales, 50) as $productSaleChunk) {
                ProductSale::query()->insert($productSaleChunk);
            }

            $this->applyImportedSaleStock((int) $warehouseId);
        });

        $this->command?->info('Legacy sales imported: '.count($sales).'. Product sale rows imported: '.count($productSales).'.');

        if ($mismatchedTotals > 0) {
            $this->command?->warn("Legacy sales with header/line total differences: {$mismatchedTotals}.");
        }
    }

    /**
     * @return array{
     *     movements: array<int, int>,
     *     effects: array<int, object>
     * }
     */
    private function existingSaleStockState(): array
    {
        $approvedLineCount = DB::table('product_sales as product_sale')
            ->join('sales as sale', 'sale.id', '=', 'product_sale.sale_id')
            ->where('sale.approval_status', 'approved')
            ->where('sale.sale_status', 1)
            ->count();

        $movementQuery = DB::table('product_stock_movements as movement')
            ->where('movement.source_type', 'product_sale');
        $movementCount = (clone $movementQuery)->count();

        if ($movementCount === 0) {
            return ['movements' => [], 'effects' => []];
        }

        $approvedMovementCount = (clone $movementQuery)
            ->join('product_sales as product_sale', 'product_sale.id', '=', 'movement.source_id')
            ->join('sales as sale', 'sale.id', '=', 'product_sale.sale_id')
            ->where('sale.approval_status', 'approved')
            ->where('sale.sale_status', 1)
            ->count();

        if ($movementCount !== $approvedLineCount || $approvedMovementCount !== $approvedLineCount) {
            throw new RuntimeException(
                "Cannot safely reimport legacy sales because sale stock movements are incomplete. Expected {$approvedLineCount}; found {$movementCount}."
            );
        }

        $unsupportedMovementCount = (clone $movementQuery)
            ->where(function ($query) {
                $query->whereNotNull('movement.variant_id')
                    ->orWhereNotNull('movement.product_batch_id')
                    ->orWhereNull('movement.warehouse_id');
            })
            ->count();

        if ($unsupportedMovementCount > 0) {
            throw new RuntimeException('Cannot safely reimport legacy sales with variant, batch, or warehouse-less stock movements.');
        }

        return [
            'movements' => (clone $movementQuery)->pluck('movement.id')->map(fn ($id) => (int) $id)->all(),
            'effects' => (clone $movementQuery)
                ->select([
                    'movement.product_id',
                    'movement.warehouse_id',
                    DB::raw('SUM(movement.quantity_base) as quantity_base'),
                ])
                ->groupBy('movement.product_id', 'movement.warehouse_id')
                ->get()
                ->all(),
        ];
    }

    /**
     * @param  array{movements: array<int, int>, effects: array<int, object>}  $state
     */
    private function reverseExistingSaleStock(array $state): void
    {
        foreach ($state['effects'] as $effect) {
            $reverseQuantity = -1 * (float) $effect->quantity_base;
            $productUpdated = Product::query()
                ->whereKey((int) $effect->product_id)
                ->increment('qty', $reverseQuantity);

            if ($productUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy sale stock because product [{$effect->product_id}] does not exist.");
            }

            $warehouseUpdated = DB::table('product_warehouse')
                ->where('product_id', (int) $effect->product_id)
                ->where('warehouse_id', (int) $effect->warehouse_id)
                ->whereNull('variant_id')
                ->whereNull('product_batch_id')
                ->increment('qty', $reverseQuantity);

            if ($warehouseUpdated !== 1) {
                throw new RuntimeException("Cannot reverse legacy sale stock because its warehouse row for product [{$effect->product_id}] is missing or duplicated.");
            }
        }

        foreach (array_chunk($state['movements'], 500) as $movementIds) {
            DB::table('product_stock_movements')->whereIn('id', $movementIds)->delete();
        }
    }

    private function applyImportedSaleStock(int $warehouseId): void
    {
        $lines = DB::table('product_sales as product_sale')
            ->join('sales as sale', 'sale.id', '=', 'product_sale.sale_id')
            ->where('sale.approval_status', 'approved')
            ->where('sale.sale_status', 1)
            ->orderBy('product_sale.date')
            ->orderBy('product_sale.created_at')
            ->orderBy('product_sale.id')
            ->select([
                'product_sale.id',
                'product_sale.product_id',
                'product_sale.qty',
                'product_sale.sale_unit_id',
                'product_sale.date',
                'product_sale.created_at',
                'sale.user_id',
                'sale.reference_no',
            ])
            ->get();

        if ($lines->isEmpty()) {
            return;
        }

        $productIds = $lines->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->values();
        $productQuantities = Product::query()
            ->whereIn('id', $productIds)
            ->pluck('qty', 'id');

        if ($productQuantities->count() !== $productIds->count()) {
            throw new RuntimeException('Cannot update legacy sale stock because one or more products do not exist.');
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
                throw new RuntimeException("Cannot update legacy sale stock because product [{$productId}] has duplicate warehouse rows.");
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

                continue;
            }

            $warehouseRowIds[$productId] = (int) $warehouseRow->id;
            $runningQuantities[$productId] = (float) $warehouseRow->qty;
        }

        $soldQuantities = [];
        $movements = [];

        foreach ($lines as $line) {
            $productId = (int) $line->product_id;
            $quantity = (float) $line->qty;
            $before = $runningQuantities[$productId];
            $after = $before - $quantity;
            $runningQuantities[$productId] = $after;
            $soldQuantities[$productId] = ($soldQuantities[$productId] ?? 0.0) + $quantity;

            $movements[] = [
                'product_id' => $productId,
                'warehouse_id' => $warehouseId,
                'product_batch_id' => null,
                'variant_id' => null,
                'unit_id' => (int) $line->sale_unit_id,
                'user_id' => (int) $line->user_id,
                'source_type' => 'product_sale',
                'source_id' => (int) $line->id,
                'type' => 'product_sale',
                'quantity' => -1 * $quantity,
                'quantity_base' => -1 * $quantity,
                'before_quantity' => $before,
                'after_quantity' => $after,
                'reference_no' => $line->reference_no,
                'note' => 'Imported from legacy sale.',
                'movement_date' => $line->date,
                'created_at' => $line->created_at ?? $now,
                'updated_at' => $line->created_at ?? $now,
            ];
        }

        foreach ($soldQuantities as $productId => $quantity) {
            Product::query()->whereKey($productId)->decrement('qty', $quantity);
            DB::table('product_warehouse')
                ->where('id', $warehouseRowIds[$productId])
                ->update([
                    'qty' => $runningQuantities[$productId],
                    'updated_at' => $now,
                ]);
        }

        foreach (array_chunk($movements, 100) as $movementChunk) {
            DB::table('product_stock_movements')->insert($movementChunk);
        }
    }

    /**
     * @param  array<int, array<string, string|null>>  $legacyUsers
     * @return array<int, int>
     */
    private function mapCustomerIds(array $legacyUsers): array
    {
        $currentCustomers = [];

        foreach (Customer::query()->get(['id', 'name', 'phone_number']) as $customer) {
            $currentCustomers[$this->customerKey($customer->name, $customer->phone_number)] = (int) $customer->id;
        }

        $customerIds = [];

        foreach ($legacyUsers as $legacyUser) {
            $key = $this->customerKey($legacyUser['name'], $this->nullableValue($legacyUser['phone']) ?? '');
            $customerId = $currentCustomers[$key] ?? null;

            if ($customerId) {
                $customerIds[(int) $legacyUser['id']] = $customerId;
            }
        }

        return $customerIds;
    }

    /**
     * @param  array<int, array<string, string|null>>  $legacyAdmins
     * @return array{0: array<int, int>, 1: array<string, int>}
     */
    private function mapAdminIds(array $legacyAdmins): array
    {
        $currentUsers = [];

        foreach (User::query()->get(['id', 'email']) as $user) {
            $currentUsers[mb_strtolower(trim((string) $user->email))] = (int) $user->id;
        }

        $adminIds = [];
        $adminIdsByName = [];

        foreach ($legacyAdmins as $legacyAdmin) {
            $email = mb_strtolower(trim((string) $legacyAdmin['email']));
            $currentUserId = $currentUsers[$email] ?? null;

            if (! $currentUserId) {
                continue;
            }

            $adminIds[(int) $legacyAdmin['id']] = $currentUserId;
            $adminIdsByName[$this->normalizeName($legacyAdmin['name'])] = $currentUserId;
            $adminIdsByName[$this->normalizeName($legacyAdmin['adminname'])] = $currentUserId;
        }

        return [$adminIds, $adminIdsByName];
    }

    /**
     * @param  array<int, string>  $columns
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

    private function customerKey(mixed $name, mixed $phone): string
    {
        return trim((string) $name)."\0".trim((string) $phone);
    }

    private function normalizeName(mixed $value): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/i', ' ', mb_strtolower(trim((string) $value))));
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
            throw new RuntimeException('Unable to parse a legacy sale date from SQL dump.');
        }

        return substr($value, 0, 10);
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
