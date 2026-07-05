<?php

namespace Database\Seeders;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\Tax;
use App\Models\Unit;
use App\Models\Variant;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class StandardProductDemoSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $this->clearExistingDemoProducts();

            $brandIds = Brand::query()->where('is_active', true)->pluck('id')->values();
            $categoryIds = Category::query()->where('is_active', true)->pluck('id')->values();
            $taxIds = Tax::query()->where('is_active', true)->pluck('id')->values();
            $unitId = Unit::query()->where('unit_code', 'pc')->value('id')
                ?? Unit::query()->where('is_active', true)->value('id')
                ?? Unit::query()->value('id');
            $warehouseIds = Warehouse::query()->where('is_active', true)->pluck('id')->values();

            if (! $unitId || $warehouseIds->count() < 2 || $categoryIds->isEmpty()) {
                throw new \RuntimeException('StandardProductDemoSeeder requires at least one unit, one category, and two active warehouses.');
            }

            $variantIds = [
                'Small' => Variant::query()->firstOrCreate(['name' => 'Small'])->id,
                'Medium' => Variant::query()->firstOrCreate(['name' => 'Medium'])->id,
                'Large' => Variant::query()->firstOrCreate(['name' => 'Large'])->id,
            ];

            for ($index = 1; $index <= 30; $index++) {
                $cost = 90 + ($index * 8);
                $price = $cost + 35 + ($index % 5) * 4;
                $isDiffPrice = $index <= 12;
                $isBatch = $index >= 13 && $index <= 20;
                $isVariant = $index >= 21;

                $product = Product::query()->create([
                    'name' => $isVariant
                        ? sprintf('variant Standard Demo Product %02d', $index)
                        : sprintf('Standard Demo Product %02d', $index),
                    'code' => sprintf('STD-DEMO-%02d', $index),
                    'type' => 'standard',
                    'barcode_symbology' => 'C128',
                    'brand_id' => $brandIds->isNotEmpty() ? $brandIds[($index - 1) % $brandIds->count()] : null,
                    'category_id' => $categoryIds[($index - 1) % $categoryIds->count()],
                    'unit_id' => $unitId,
                    'purchase_unit_id' => $unitId,
                    'sale_unit_id' => $unitId,
                    'cost' => (string) $cost,
                    'price' => (string) $price,
                    'qty' => 0,
                    'alert_quantity' => 10,
                    'promotion' => false,
                    'promotion_price' => null,
                    'starting_date' => null,
                    'last_date' => null,
                    'tax_id' => $taxIds->isNotEmpty() ? $taxIds[($index - 1) % $taxIds->count()] : null,
                    'tax_method' => 1,
                    'image' => null,
                    'file' => null,
                    'featured' => $index <= 6,
                    'product_details' => 'Seeded standard product for demo inventory workflows.',
                    'product_list' => null,
                    'qty_list' => null,
                    'price_list' => null,
                    'is_variant' => $isVariant,
                    'is_batch' => $isBatch,
                    'is_diffPrice' => $isDiffPrice,
                    'is_active' => true,
                ]);

                if ($isVariant) {
                    $this->seedVariantProduct($product, $warehouseIds->all(), $variantIds, $price);

                    continue;
                }

                if ($isBatch) {
                    $this->seedBatchProduct($product, $warehouseIds->all(), $index);

                    continue;
                }

                $this->seedWarehouseStock($product, $warehouseIds->all(), $index, $isDiffPrice, $price);
            }
        });
    }

    private function clearExistingDemoProducts(): void
    {
        $productIds = Product::query()
            ->where('code', 'like', 'STD-DEMO-%')
            ->pluck('id');

        if ($productIds->isEmpty()) {
            return;
        }

        ProductWarehouse::query()->whereIn('product_id', $productIds)->delete();
        ProductBatch::query()->whereIn('product_id', $productIds)->delete();
        ProductVariant::query()->whereIn('product_id', $productIds)->delete();
        Product::query()->whereIn('id', $productIds)->delete();
    }

    private function seedWarehouseStock(Product $product, array $warehouseIds, int $index, bool $isDiffPrice, float $basePrice): void
    {
        $totalQty = 0;

        foreach ($warehouseIds as $position => $warehouseId) {

            ProductWarehouse::query()->create([
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'variant_id' => null,
                'product_batch_id' => null,
                'qty' => 0,
                'price' => $isDiffPrice ? $basePrice + (($position + 1) * 6) : null,
            ]);
        }
    }

    private function seedBatchProduct(Product $product, array $warehouseIds, int $index): void
    {
        $totalQty = 0;

        foreach ([1, 2] as $batchPosition) {
            $batchQty = 40 + ($index * 2) + ($batchPosition * 10);
            $batch = ProductBatch::query()->create([
                'product_id' => $product->id,
                'batch_no' => sprintf('BATCH-%02d-%02d', $index, $batchPosition),
                'expired_date' => now()->addMonths(6 + $index + $batchPosition)->toDateString(),
                'qty' => 0,
            ]);

            foreach ($warehouseIds as $position => $warehouseId) {
                ProductWarehouse::query()->create([
                    'product_id' => $product->id,
                    'warehouse_id' => $warehouseId,
                    'variant_id' => null,
                    'product_batch_id' => $batch->id,
                    'qty' => 0,
                    'price' => null,
                ]);
            }

            $totalQty += $batchQty;
        }
    }

    private function seedVariantProduct(Product $product, array $warehouseIds, array $variantIds, float $basePrice): void
    {
        $totalQty = 0;
        $additionalPrices = [
            'Small' => 0,
            'Medium' => 12,
            'Large' => 24,
        ];

        foreach (array_keys($variantIds) as $position => $variantName) {
            ProductVariant::query()->create([
                'product_id' => $product->id,
                'variant_id' => $variantIds[$variantName],
                'position' => $position + 1,
                'item_code' => sprintf('%s-%s', $product->code, strtoupper(substr($variantName, 0, 1))),
                'additional_price' => $additionalPrices[$variantName],
                'qty' => 0,
            ]);

            foreach ($warehouseIds as $warehousePosition => $warehouseId) {

                ProductWarehouse::query()->create([
                    'product_id' => $product->id,
                    'warehouse_id' => $warehouseId,
                    'variant_id' => $variantIds[$variantName],
                    'product_batch_id' => null,
                    'qty' => 0,
                    'price' => $basePrice + $additionalPrices[$variantName],
                ]);
            }
        }
    }
}
