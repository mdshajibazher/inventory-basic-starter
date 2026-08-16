<?php

namespace Database\Seeders;

use App\Models\Brand;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyBrandSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $brands = $this->extractBrands($dumpPath);

        Schema::disableForeignKeyConstraints();

        try {
            Brand::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        Brand::query()->insert($brands);

        $this->command?->info('Legacy brands imported: '.count($brands).'.');
    }

    /**
     * @return array<int, array{
     *     id: int,
     *     title: string,
     *     image: string|null,
     *     is_active: bool,
     *     created_at: string|null,
     *     updated_at: string|null
     * }>
     */
    private function extractBrands(string $dumpPath): array
    {
        $file = new SplFileObject($dumpPath);

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, 'INSERT INTO `brands` VALUES ')) {
                continue;
            }

            $values = rtrim(substr($line, strlen('INSERT INTO `brands` VALUES ')), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];
            $brands = [];

            foreach ($tuples as $tuple) {
                $columns = str_getcsv($tuple, ',', "'", '\\');
                $title = trim((string) ($columns[1] ?? ''));

                if ($title !== '') {
                    $brands[] = [
                        'id' => (int) $columns[0],
                        'title' => $title,
                        'image' => $this->nullableValue($columns[2] ?? null),
                        'is_active' => true,
                        'created_at' => $this->nullableValue($columns[4] ?? null),
                        'updated_at' => $this->nullableValue($columns[5] ?? null),
                    ];
                }
            }

            return $brands;
        }

        throw new RuntimeException('No INSERT statement found for legacy brands.');
    }

    private function nullableValue(?string $value): ?string
    {
        return $value === null || strtoupper($value) === 'NULL' ? null : $value;
    }
}
