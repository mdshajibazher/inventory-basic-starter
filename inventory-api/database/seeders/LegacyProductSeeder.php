<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use SplFileObject;

class LegacyProductSeeder extends Seeder
{
    private const DUMP_PATH = 'legacy-db-dump/mysql-visionmart.sql';

    /**
     * @var array<int, string>
     */
    private const PRODUCT_COLUMNS = [
        'id',
        'product_name',
        'image',
        'price',
        'discount_price',
        'current_price',
        'tp',
        'category_id',
        'product_type_id',
        'brand_id',
        'description',
        'size_id',
        'type',
        'gallery_image',
        'in_stock',
        'unit_id',
        'mfg',
        'exp',
        'is_price_confidential',
        'discontinued',
        'deleted_at',
        'created_at',
        'updated_at',
    ];

    public function run(): void
    {
        $dumpPath = database_path('../'.self::DUMP_PATH);

        if (! is_file($dumpPath)) {
            throw new RuntimeException("Legacy dump not found at [{$dumpPath}].");
        }

        $products = $this->extractProducts($dumpPath);
        logger([
            'products' => $products
        ]);

        Schema::disableForeignKeyConstraints();

        try {
            Product::query()->truncate();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        foreach (array_chunk($products, 25) as $productChunk) {
            Product::query()->insert($productChunk);
        }

        $this->command?->info('Legacy products imported: '.count($products).'.');
    }

    /**
     * @return array<int, array<string, bool|float|int|string|null>>
     */
    private function extractProducts(string $dumpPath): array
    {
        $file = new SplFileObject($dumpPath);

        while (! $file->eof()) {
            $line = trim((string) $file->fgets());

            if (! str_starts_with($line, 'INSERT INTO `products` VALUES ')) {
                continue;
            }

            $values = rtrim(substr($line, strlen('INSERT INTO `products` VALUES ')), ';');
            $tuples = preg_split('/\),\(/', trim($values, '()')) ?: [];
            $products = [];

            foreach ($tuples as $tuple) {
                $columns = str_getcsv($tuple, ',', "'", '\\');

                if (count($columns) !== count(self::PRODUCT_COLUMNS)) {
                    throw new RuntimeException('Unable to parse legacy products from SQL dump.');
                }

                $legacyProduct = array_combine(self::PRODUCT_COLUMNS, $columns);

                if (! $legacyProduct) {
                    throw new RuntimeException('Unable to parse legacy products from SQL dump.');
                }

                $name = trim((string) $legacyProduct['product_name']);

                if ($name === '') {
                    continue;
                }

                $tradePrice = (float) $legacyProduct['tp'];

            

                $products[] = [
                    'id' => (int) $legacyProduct['id'],
                    'name' => $name,
                    'code' => (string) $legacyProduct['id'],
                    'type' => 'standard',
                    'barcode_symbology' => 'C128',
                    'brand_id' => (int) $legacyProduct['brand_id'],
                    'category_id' => (int) $legacyProduct['category_id'],
                    'unit_id' => 1,
                    'purchase_unit_id' => 1,
                    'sale_unit_id' => 1,
                    'cost' => number_format($tradePrice * 0.8, 2, '.', ''),
                    'price' => number_format($tradePrice, 2, '.', ''),
                    'qty' => 0,
                    'alert_quantity' => null,
                    'promotion' => false,
                    'promotion_price' => null,
                    'starting_date' => null,
                    'last_date' => null,
                    'tax_id' => null,
                    'tax_method' => null,
                    'image' => $this->nullableValue($legacyProduct['image']),
                    'file' => null,
                    'featured' => false,
                    'product_details' => $this->nullableValue($legacyProduct['description']),
                    'product_list' => null,
                    'qty_list' => null,
                    'price_list' => null,
                    'is_variant' => false,
                    'is_batch' => false,
                    'is_diffPrice' => false,
                    'is_active' => true,
                    'created_at' => $this->nullableValue($legacyProduct['created_at']),
                    'updated_at' => $this->nullableValue($legacyProduct['updated_at']),
                ];
            }

            return $products;
        }

        throw new RuntimeException('No INSERT statement found for legacy products.');
    }

    private function nullableValue(?string $value): ?string
    {
        return $value === null || strtoupper($value) === 'NULL' ? null : $value;
    }
}
