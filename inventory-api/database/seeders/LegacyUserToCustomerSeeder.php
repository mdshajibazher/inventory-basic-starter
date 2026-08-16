<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\CustomerGroup;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyUserToCustomerSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

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

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $customerGroup = CustomerGroup::query()->orderBy('id')->first();

        if (! $customerGroup) {
            throw new RuntimeException('Cannot import legacy users because no customer group exists.');
        }

        Schema::disableForeignKeyConstraints();

        try {
            Customer::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        $imported = 0;

        foreach ($this->extractUsers($dumpPath) as $legacyUser) {
            Customer::query()->updateOrCreate(
                [
                    'name' => $legacyUser['name'],
                    'phone_number' => $legacyUser['phone'],
                ],
                [
                    'customer_group_id' => $customerGroup->id,
                    'user_id' => null,
                    'company_name' => null,
                    'email' => $legacyUser['email'],
                    'tax_no' => null,
                    'address' => $legacyUser['address'],
                    'city' => 'Dhaka',
                    'state' => 'Dhaka',
                    'postal_code' => null,
                    'country' => 'Bangladesh',
                    'deposit' => 0,
                    'expense' => 0,
                    'is_active' => true,
                ]
            );

            $imported++;
        }

        $this->command?->info("Legacy users imported into customers. Imported: {$imported}.");
    }

    /**
     * @return array<int, array{name: string, email: string|null, phone: string, address: string}>
     */
    private function extractUsers(string $dumpPath): array
    {
        $file = new SplFileObject($dumpPath);

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, 'INSERT INTO `users` VALUES ')) {
                continue;
            }

            $values = rtrim(substr($line, strlen('INSERT INTO `users` VALUES ')), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];
            $users = [];

            foreach ($tuples as $tuple) {
                $columns = str_getcsv($tuple, ',', "'", '\\');
                $legacyUser = array_combine(self::USER_COLUMNS, $columns);

                if (! $legacyUser) {
                    throw new RuntimeException('Unable to parse legacy users from SQL dump.');
                }

                $name = trim((string) $legacyUser['name']);

                if ($name === '') {
                    continue;
                }

                $users[] = [
                    'name' => $name,
                    'email' => $this->nullableValue($legacyUser['email']),
                    'phone' => $this->nullableValue($legacyUser['phone']) ?? '',
                    'address' => $this->nullableValue($legacyUser['address']) ?? '',
                ];
            }

            return $users;
        }

        throw new RuntimeException('No INSERT statement found for legacy users.');
    }

    private function nullableValue(?string $value): ?string
    {
        if ($value === null || strtoupper($value) === 'NULL') {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
