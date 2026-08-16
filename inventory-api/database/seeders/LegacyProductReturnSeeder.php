<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Biller;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductReturn;
use App\Models\ReturnInvoice;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyProductReturnSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    private const PIECE_UNIT_ID = 1;

    /** @var array<int, string> */
    private const RETURN_COLUMNS = [
        'id', 'user_id', 'discount', 'carrying_and_loading', 'amount', 'returned_at', 'type',
        'returned_by', 'return_status', 'approved_by', 'deleted_at', 'created_at', 'updated_at',
    ];

    /** @var array<int, string> */
    private const PRODUCT_RETURN_COLUMNS = [
        'id', 'product_id', 'returnproduct_id', 'user_id', 'qty', 'price', 'returned_at',
        'created_at', 'updated_at',
    ];

    /** @var array<int, string> */
    private const USER_COLUMNS = [
        'id', 'name', 'proprietor', 'email', 'inventory_email', 'phone', 'custom_email', 'address',
        'company', 'division_id', 'email_verified_at', 'password', 'user_type', 'image', 'status',
        'pricedata', 'section_id', 'provider', 'deleted_at', 'remember_token', 'created_at', 'updated_at',
    ];

    /** @var array<int, string> */
    private const ADMIN_COLUMNS = [
        'id', 'name', 'adminname', 'email', 'phone', 'image', 'email_verified_at', 'password',
        'signature', 'remember_token', 'status', 'created_at', 'updated_at',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $warehouseId = Warehouse::query()->orderBy('id')->value('id');
        $billerId = Biller::query()->orderBy('id')->value('id');
        $accountId = Account::query()->where('is_default', true)->orderBy('id')->value('id')
            ?? Account::query()->orderBy('id')->value('id');
        $fallbackUserId = User::query()->where('email', 'admin@example.com')->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (! $warehouseId || ! $billerId || ! $accountId || ! $fallbackUserId) {
            throw new RuntimeException('Cannot import legacy product returns because a warehouse, biller, account, or application user is missing.');
        }

        if (! Unit::query()->whereKey(self::PIECE_UNIT_ID)->exists()) {
            throw new RuntimeException('Cannot import legacy product returns because Piece unit ID 1 does not exist.');
        }

        if (! Schema::hasTable('product_warehouse') || ! Schema::hasTable('product_stock_movements')) {
            throw new RuntimeException('Cannot import legacy product returns because stock warehouse or movement tables do not exist.');
        }

        $legacyReturns = $this->extractRows($dumpPath, 'returnproducts', self::RETURN_COLUMNS);
        $legacyProductReturns = $this->extractRows($dumpPath, 'product_returnproduct', self::PRODUCT_RETURN_COLUMNS);
        $legacyUsers = $this->extractRows($dumpPath, 'users', self::USER_COLUMNS);
        $legacyAdmins = $this->extractRows($dumpPath, 'admins', self::ADMIN_COLUMNS);
        $customerIds = $this->mapCustomerIds($legacyUsers);
        [$adminIds, $adminIdsByName] = $this->mapAdminIds($legacyAdmins);
        $productCosts = Product::query()->pluck('cost', 'id');
        $activeReturns = [];

        foreach ($legacyReturns as $legacyReturn) {
            if ($this->nullableValue($legacyReturn['deleted_at']) !== null) {
                continue;
            }

            $returnId = (int) $legacyReturn['id'];

            if (isset($activeReturns[$returnId])) {
                throw new RuntimeException("Duplicate legacy product return ID [{$returnId}] found in SQL dump.");
            }

            $activeReturns[$returnId] = $legacyReturn;
        }

        $totals = [];
        $productReturns = [];

        foreach ($legacyProductReturns as $legacyLine) {
            $returnId = (int) $legacyLine['returnproduct_id'];

            if (! isset($activeReturns[$returnId])) {
                continue;
            }

            $productId = (int) $legacyLine['product_id'];

            if (! $productCosts->has($productId)) {
                throw new RuntimeException("Cannot import legacy product return [{$returnId}] because product [{$productId}] does not exist.");
            }

            $quantity = (float) $legacyLine['qty'];
            $price = (float) $legacyLine['price'];
            $lineTotal = $this->round($quantity * $price);
            $unitCost = $this->round((float) $productCosts->get($productId));

            $productReturns[] = [
                'return_id' => $returnId,
                'date' => $this->dateValue($legacyLine['returned_at']),
                'product_id' => $productId,
                'variant_id' => null,
                'product_batch_id' => null,
                'qty' => $quantity,
                'sale_unit_id' => self::PIECE_UNIT_ID,
                'net_unit_price' => $price,
                'discount' => 0,
                'tax_rate' => 0,
                'tax' => 0,
                'total' => $lineTotal,
                'unit_cost' => $unitCost,
                'total_cost' => $this->round($unitCost * $quantity),
                'created_at' => $this->nullableValue($legacyLine['created_at']),
                'updated_at' => $this->nullableValue($legacyLine['updated_at']),
            ];

            $totals[$returnId] ??= ['item' => 0, 'total_qty' => 0.0, 'total_price' => 0.0];
            $totals[$returnId]['item']++;
            $totals[$returnId]['total_qty'] += $quantity;
            $totals[$returnId]['total_price'] += $lineTotal;
        }

        $returns = [];
        $mismatchedTotals = 0;

        foreach ($activeReturns as $returnId => $legacyReturn) {
            if (! isset($totals[$returnId])) {
                throw new RuntimeException("Cannot import legacy product return [{$returnId}] because it has no product rows.");
            }

            $legacyCustomerId = (int) $legacyReturn['user_id'];
            $customerId = $customerIds[$legacyCustomerId] ?? null;

            if (! $customerId) {
                throw new RuntimeException("Cannot import legacy product return [{$returnId}] because customer [{$legacyCustomerId}] could not be mapped.");
            }

            $legacyApproverId = (int) $legacyReturn['approved_by'];
            $returnedBy = $this->normalizeName($legacyReturn['returned_by']);
            $creatorId = $adminIdsByName[$returnedBy]
                ?? $adminIds[$legacyApproverId]
                ?? $fallbackUserId;
            $approverId = $adminIds[$legacyApproverId] ?? $creatorId;
            $discount = $this->round((float) $legacyReturn['discount']);
            $grandTotal = $this->round((float) $legacyReturn['amount']);
            $calculatedGrandTotal = $this->round(
                $totals[$returnId]['total_price'] - $discount + (float) $legacyReturn['carrying_and_loading']
            );

            if (abs($grandTotal - $calculatedGrandTotal) > 0.01) {
                $mismatchedTotals++;
            }

            $returns[] = [
                'id' => $returnId,
                'reference_no' => "LEGACY-R-{$returnId}",
                'return_date' => $this->dateValue($legacyReturn['returned_at']),
                'user_id' => $creatorId,
                'cash_register_id' => null,
                'customer_id' => $customerId,
                'warehouse_id' => (int) $warehouseId,
                'biller_id' => (int) $billerId,
                'account_id' => (int) $accountId,
                'item' => $totals[$returnId]['item'],
                'total_qty' => $this->round($totals[$returnId]['total_qty']),
                'total_discount' => $discount,
                'total_tax' => 0,
                'total_price' => $this->round($totals[$returnId]['total_price']),
                'order_tax_rate' => 0,
                'order_tax' => 0,
                'grand_total' => $grandTotal,
                'document' => null,
                'return_note' => null,
                'staff_note' => null,
                'created_at' => $this->nullableValue($legacyReturn['created_at']),
                'updated_at' => $this->nullableValue($legacyReturn['updated_at']),
                'approval_status' => 'approved',
                'approved_by' => $approverId,
                'approved_at' => $this->nullableValue($legacyReturn['updated_at'])
                    ?? $this->nullableValue($legacyReturn['returned_at']),
            ];
        }

        $existingStockState = $this->existingReturnStockState();

        if ($existingStockState['movements'] !== []) {
            DB::transaction(fn () => $this->reverseExistingReturnStock($existingStockState));
        }

        Schema::disableForeignKeyConstraints();

        try {
            ProductReturn::query()->truncate();
            ReturnInvoice::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use ($returns, $productReturns, $warehouseId) {
            foreach (array_chunk($returns, 25) as $returnChunk) {
                ReturnInvoice::query()->insert($returnChunk);
            }

            foreach (array_chunk($productReturns, 50) as $lineChunk) {
                ProductReturn::query()->insert($lineChunk);
            }

            $this->applyImportedReturnStock((int) $warehouseId);
        });

        $this->command?->info(
            'Legacy product returns imported: '.count($returns).'. Product return rows imported: '.count($productReturns).'.'
        );

        if ($mismatchedTotals > 0) {
            $this->command?->warn("Legacy product returns with header/line total differences: {$mismatchedTotals}.");
        }
    }

    /** @return array{movements: array<int, int>, effects: array<int, object>} */
    private function existingReturnStockState(): array
    {
        $movementQuery = DB::table('product_stock_movements')->where('source_type', 'product_return');
        $movementCount = (clone $movementQuery)->count();

        if ($movementCount === 0) {
            return ['movements' => [], 'effects' => []];
        }

        $expectedMovementCount = DB::table('product_returns as product_return')
            ->join('returns as return_invoice', 'return_invoice.id', '=', 'product_return.return_id')
            ->join('products as product', 'product.id', '=', 'product_return.product_id')
            ->where('return_invoice.approval_status', 'approved')
            ->where('product.type', '!=', 'digital')
            ->count();
        $matchingMovementCount = (clone $movementQuery)
            ->join('product_returns as product_return', 'product_return.id', '=', 'product_stock_movements.source_id')
            ->join('returns as return_invoice', 'return_invoice.id', '=', 'product_return.return_id')
            ->where('return_invoice.approval_status', 'approved')
            ->count();

        if ($movementCount !== $expectedMovementCount || $matchingMovementCount !== $expectedMovementCount) {
            throw new RuntimeException(
                "Cannot safely reimport legacy product returns because stock movements are incomplete. Expected {$expectedMovementCount}; found {$movementCount}."
            );
        }

        if ((clone $movementQuery)->where(function ($query) {
            $query->whereNotNull('variant_id')->orWhereNotNull('product_batch_id')->orWhereNull('warehouse_id');
        })->exists()) {
            throw new RuntimeException('Cannot safely reimport legacy product returns with variant, batch, or warehouse-less stock movements.');
        }

        return [
            'movements' => (clone $movementQuery)->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'effects' => (clone $movementQuery)
                ->select(['product_id', 'warehouse_id', DB::raw('SUM(quantity_base) as quantity_base')])
                ->groupBy('product_id', 'warehouse_id')
                ->get()->all(),
        ];
    }

    /** @param array{movements: array<int, int>, effects: array<int, object>} $state */
    private function reverseExistingReturnStock(array $state): void
    {
        foreach ($state['effects'] as $effect) {
            $quantity = (float) $effect->quantity_base;

            if (Product::query()->whereKey((int) $effect->product_id)->decrement('qty', $quantity) !== 1) {
                throw new RuntimeException("Cannot reverse legacy product return stock because product [{$effect->product_id}] does not exist.");
            }

            $updated = DB::table('product_warehouse')
                ->where('product_id', (int) $effect->product_id)
                ->where('warehouse_id', (int) $effect->warehouse_id)
                ->whereNull('variant_id')->whereNull('product_batch_id')
                ->decrement('qty', $quantity);

            if ($updated !== 1) {
                throw new RuntimeException("Cannot reverse legacy product return stock because its warehouse row for product [{$effect->product_id}] is missing or duplicated.");
            }
        }

        foreach (array_chunk($state['movements'], 500) as $movementIds) {
            DB::table('product_stock_movements')->whereIn('id', $movementIds)->delete();
        }
    }

    private function applyImportedReturnStock(int $warehouseId): void
    {
        $lines = DB::table('product_returns as product_return')
            ->join('returns as return_invoice', 'return_invoice.id', '=', 'product_return.return_id')
            ->join('products as product', 'product.id', '=', 'product_return.product_id')
            ->where('return_invoice.approval_status', 'approved')
            ->where('product.type', '!=', 'digital')
            ->orderBy('product_return.date')->orderBy('product_return.created_at')->orderBy('product_return.id')
            ->select([
                'product_return.id', 'product_return.product_id', 'product_return.qty', 'product_return.sale_unit_id',
                'product_return.date', 'product_return.created_at', 'return_invoice.user_id', 'return_invoice.reference_no',
            ])->get();

        if ($lines->isEmpty()) {
            return;
        }

        $productIds = $lines->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->values();
        $productQuantities = Product::query()->whereIn('id', $productIds)->pluck('qty', 'id');
        $productsWithWarehouseStock = DB::table('product_warehouse')->whereIn('product_id', $productIds)
            ->distinct()->pluck('product_id')->mapWithKeys(fn ($id) => [(int) $id => true]);
        $warehouseRows = DB::table('product_warehouse')->whereIn('product_id', $productIds)
            ->where('warehouse_id', $warehouseId)->whereNull('variant_id')->whereNull('product_batch_id')
            ->orderBy('id')->get()->groupBy(fn ($row) => (int) $row->product_id);
        $warehouseRowIds = [];
        $runningQuantities = [];
        $now = now();

        foreach ($productIds as $productId) {
            $rows = $warehouseRows->get($productId, collect());

            if ($rows->count() > 1) {
                throw new RuntimeException("Cannot update legacy product return stock because product [{$productId}] has duplicate warehouse rows.");
            }

            $warehouseRow = $rows->first();
            $startingQuantity = $warehouseRow
                ? (float) $warehouseRow->qty
                : ($productsWithWarehouseStock->has($productId) ? 0.0 : (float) $productQuantities->get($productId));

            if ($warehouseRow) {
                $warehouseRowIds[$productId] = (int) $warehouseRow->id;
            } else {
                $warehouseRowIds[$productId] = DB::table('product_warehouse')->insertGetId([
                    'product_id' => $productId, 'variant_id' => null, 'product_batch_id' => null,
                    'warehouse_id' => $warehouseId, 'qty' => $startingQuantity, 'price' => null,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            $runningQuantities[$productId] = $startingQuantity;
        }

        $returnedQuantities = [];
        $movements = [];

        foreach ($lines as $line) {
            $productId = (int) $line->product_id;
            $quantity = (float) $line->qty;
            $before = $runningQuantities[$productId];
            $after = $before + $quantity;
            $runningQuantities[$productId] = $after;
            $returnedQuantities[$productId] = ($returnedQuantities[$productId] ?? 0.0) + $quantity;
            $movements[] = [
                'product_id' => $productId, 'warehouse_id' => $warehouseId, 'product_batch_id' => null,
                'variant_id' => null, 'unit_id' => (int) $line->sale_unit_id, 'user_id' => (int) $line->user_id,
                'source_type' => 'product_return', 'source_id' => (int) $line->id, 'type' => 'product_return',
                'quantity' => $quantity, 'quantity_base' => $quantity, 'before_quantity' => $before,
                'after_quantity' => $after, 'reference_no' => $line->reference_no,
                'note' => 'Imported from legacy product return.', 'movement_date' => $line->date,
                'created_at' => $line->created_at ?? $now, 'updated_at' => $line->created_at ?? $now,
            ];
        }

        foreach ($returnedQuantities as $productId => $quantity) {
            Product::query()->whereKey($productId)->increment('qty', $quantity);
            DB::table('product_warehouse')->where('id', $warehouseRowIds[$productId])->update([
                'qty' => $runningQuantities[$productId], 'updated_at' => $now,
            ]);
        }

        foreach (array_chunk($movements, 100) as $movementChunk) {
            DB::table('product_stock_movements')->insert($movementChunk);
        }
    }

    /** @param array<int, array<string, string|null>> $legacyUsers
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

            if (isset($currentCustomers[$key])) {
                $customerIds[(int) $legacyUser['id']] = $currentCustomers[$key];
            }
        }

        return $customerIds;
    }

    /** @return array{0: array<int, int>, 1: array<string, int>} */
    private function mapAdminIds(array $legacyAdmins): array
    {
        $currentUsers = User::query()->get(['id', 'email'])->mapWithKeys(
            fn ($user) => [mb_strtolower(trim((string) $user->email)) => (int) $user->id]
        );
        $adminIds = [];
        $adminIdsByName = [];

        foreach ($legacyAdmins as $legacyAdmin) {
            $userId = $currentUsers->get(mb_strtolower(trim((string) $legacyAdmin['email'])));

            if (! $userId) {
                continue;
            }

            $adminIds[(int) $legacyAdmin['id']] = $userId;
            $adminIdsByName[$this->normalizeName($legacyAdmin['name'])] = $userId;
            $adminIdsByName[$this->normalizeName($legacyAdmin['adminname'])] = $userId;
        }

        return [$adminIds, $adminIdsByName];
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
            $tuples = preg_split('/\),\(/', trim(rtrim(substr($line, strlen($prefix)), ';'), '()')) ?: [];

            foreach ($tuples as $tuple) {
                $values = str_getcsv($tuple, ',', "'", '\\');

                if (count($values) !== count($columns) || ! ($row = array_combine($columns, $values))) {
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
            throw new RuntimeException('Unable to parse a legacy product return date from SQL dump.');
        }

        return substr($value, 0, 10);
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
