<?php

namespace Database\Seeders;

use App\Models\Biller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use SplFileObject;

class LegacyAdminToUserSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

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
        //User::query()->truncate();

        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $role = Role::query()->orderByDesc('id')->first();
        if (! $role) {
            throw new RuntimeException('Cannot import legacy admins because no role exists.');
        }

        $biller = Biller::query()->orderByDesc('id')->first();
        if (! $biller) {
            throw new RuntimeException('Cannot import legacy admins because no biller exists.');
        }

        $password = Hash::make('password');
        $imported = 0;

        foreach ($this->extractAdmins($dumpPath) as $admin) {
            $user = User::query()->updateOrCreate(
                ['email' => $admin['email']],
                [
                    'name' => $admin['name'],
                    'phone' => $admin['phone'],
                    'is_active' => (int) $admin['status'],
                    'password' => $password,
                    'role_id' => $role->id,
                    'biller_id' => $biller->id,
                    'warehouse_id' => null,
                    'company_name' => null,
                    'is_deleted' => 0,
                ]
            );
            $user->forceFill(['remember_token' => null])->save();

            $imported++;
        }

        // User::query()->updateOrCreate(
        //     ['email' => 'admin@example.com'],
        //     [
        //         'name' => 'Inventory Admin',
        //         'phone' => '01700817934',
        //         'is_active' => 1,
        //         'password' => $password,
        //         'role_id' => $role->id,
        //         'biller_id' => $biller->id,
        //         'warehouse_id' => null,
        //         'company_name' => null,
        //         'is_deleted' => 0,
        //     ]
        // );

        $this->command?->info("Legacy admins imported into users. Imported: {$imported}. Static admin added.");
    }

    /**
     * @return array<int, array{name: string, email: string, phone: string, status: string}>
     */
    private function extractAdmins(string $dumpPath): array
    {
        $file = new SplFileObject($dumpPath);

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, 'INSERT INTO `admins` VALUES ')) {
                continue;
            }

            $values = rtrim(substr($line, strlen('INSERT INTO `admins` VALUES ')), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];
            $admins = [];

            foreach ($tuples as $tuple) {
                $columns = str_getcsv($tuple, ',', "'", '\\');
                $admin = array_combine(self::ADMIN_COLUMNS, $columns);

                if (! $admin) {
                    throw new RuntimeException('Unable to parse legacy admins from SQL dump.');
                }

                $email = trim((string) $admin['email']);

                if ($email === '') {
                    continue;
                }

                $admins[] = [
                    'name' => trim((string) $admin['name']),
                    'email' => $email,
                    'phone' => trim((string) $admin['phone']),
                    'status' => (string) $admin['status'],
                ];
            }

            return $admins;
        }

        throw new RuntimeException('No INSERT statement found for legacy admins.');
    }
}
