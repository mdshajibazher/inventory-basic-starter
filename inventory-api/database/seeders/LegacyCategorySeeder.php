<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use RuntimeException;
use SplFileObject;

class LegacyCategorySeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $names = $this->extractCategoryNames($dumpPath);
        $created = 0;
        $existing = 0;

        foreach ($names as $name) {
            $category = Category::query()->firstOrCreate(['name' => $name]);

            $category->wasRecentlyCreated ? $created++ : $existing++;
        }

        $this->command?->info("Legacy categories imported. Created: {$created}. Existing: {$existing}.");
    }

    /**
     * @return array<int, string>
     */
    private function extractCategoryNames(string $dumpPath): array
    {
        $file = new SplFileObject($dumpPath);

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, 'INSERT INTO `categories` VALUES ')) {
                continue;
            }

            $values = rtrim(substr($line, strlen('INSERT INTO `categories` VALUES ')), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];
            $names = [];

            foreach ($tuples as $tuple) {
                $columns = str_getcsv($tuple, ',', "'", '\\');
                $name = trim((string) ($columns[1] ?? ''));

                if ($name !== '') {
                    $names[$name] = $name;
                }
            }

            return array_values($names);
        }

        throw new RuntimeException('No INSERT statement found for legacy categories.');
    }
}
