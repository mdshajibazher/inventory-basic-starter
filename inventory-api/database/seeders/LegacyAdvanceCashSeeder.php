<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Biller;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyAdvanceCashSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    /**
     * @var array<int, string>
     */
    private const CASH_COLUMNS = [
        'id',
        'amount',
        'discount',
        'user_id',
        'reference',
        'paymentmethod_id',
        'posted_by',
        'received_at',
        'status',
        'approved_by',
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

    /**
     * @var array<int, string>
     */
    private const PAYMENT_DETAIL_TABLES = [
        'payment_with_cheque',
        'payment_with_credit_card',
        'payment_with_gift_card',
        'payment_with_paypal',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $accountId = Account::query()->where('is_default', true)->orderBy('id')->value('id')
            ?? Account::query()->orderBy('id')->value('id');
        $billerId = Biller::query()->orderBy('id')->value('id');
        $fallbackUserId = User::query()->where('email', 'admin@example.com')->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (! $accountId) {
            throw new RuntimeException('Cannot import legacy advance cash because no account exists.');
        }

        if (! $billerId) {
            throw new RuntimeException('Cannot import legacy advance cash because no biller exists.');
        }

        if (! $fallbackUserId) {
            throw new RuntimeException('Cannot import legacy advance cash because no application user exists.');
        }

        $legacyCashes = $this->extractRows($dumpPath, 'cashes', self::CASH_COLUMNS);
        $legacyUsers = $this->extractRows($dumpPath, 'users', self::USER_COLUMNS);
        $legacyAdmins = $this->extractRows($dumpPath, 'admins', self::ADMIN_COLUMNS);
        $customerIds = $this->mapCustomerIds($legacyUsers);
        [$adminIds, $adminIdsByName] = $this->mapAdminIds($legacyAdmins);
        $payments = [];
        $skipped = 0;

        foreach ($legacyCashes as $legacyCash) {
            $legacyCashId = (int) $legacyCash['id'];
            $amount = $this->round((float) $legacyCash['amount'] - (float) $legacyCash['discount']);

            if ($amount <= 0) {
                $skipped++;

                continue;
            }

            $legacyCustomerId = (int) $legacyCash['user_id'];
            $customerId = $customerIds[$legacyCustomerId] ?? null;

            if (! $customerId) {
                throw new RuntimeException("Cannot import legacy advance cash [{$legacyCashId}] because customer [{$legacyCustomerId}] could not be mapped.");
            }

            $legacyApproverId = (int) $legacyCash['approved_by'];
            $creatorId = $adminIdsByName[$this->normalizeName($legacyCash['posted_by'])]
                ?? $adminIds[$legacyApproverId]
                ?? $fallbackUserId;
            $updatedAt = $this->nullableValue($legacyCash['updated_at']);
            $receivedAt = $this->nullableValue($legacyCash['received_at']);

            if ($receivedAt === null) {
                throw new RuntimeException("Cannot import legacy advance cash [{$legacyCashId}] because received_at is missing.");
            }

            $payments[] = [
                'id' => $legacyCashId,
                'purchase_id' => null,
                'sale_id' => null,
                'sale_return_id' => null,
                'purchase_return_id' => null,
                'cash_register_id' => null,
                'account_id' => (int) $accountId,
                'biller_id' => (int) $billerId,
                'customer_id' => $customerId,
                'supplier_id' => null,
                'payment_reference' => "LEGACY-C-{$legacyCashId}",
                'user_id' => $creatorId,
                'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
                'direction' => Payment::DIRECTION_IN,
                'amount' => $amount,
                'discount_amount' => $this->round((float) $legacyCash['discount']),
                'change' => 0,
                'paying_method' => 'Cash',
                'payment_note' => $this->nullableValue($legacyCash['reference']),
                'approval_status' => 'approved',
                'approved_by' => $adminIds[$legacyApproverId] ?? null,
                'approved_at' => $updatedAt ?? $receivedAt,
                'created_at' => $receivedAt,
                'updated_at' => $updatedAt ?? $receivedAt,
            ];
        }

        Schema::disableForeignKeyConstraints();

        try {
            foreach (self::PAYMENT_DETAIL_TABLES as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            Payment::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use ($payments) {
            foreach (array_chunk($payments, 100) as $paymentChunk) {
                Payment::query()->insert($paymentChunk);
            }
        });

        $this->command?->info('Legacy advance cash imported: '.count($payments).". Skipped non-positive payments: {$skipped}.");
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

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
