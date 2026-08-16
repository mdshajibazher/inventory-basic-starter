<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\ProductController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ProductIndexSummaryTest extends TestCase
{
    private const TABLES = [
        'product_transfer',
        'purchase_product_return',
        'product_returns',
        'product_sales',
        'product_purchases',
        'product_warehouse',
        'product_variants',
        'product_batches',
        'variants',
        'taxes',
        'units',
        'warehouses',
        'products',
        'brands',
        'categories',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code');
            $table->string('type')->default('standard');
            $table->integer('brand_id')->nullable();
            $table->integer('category_id')->nullable();
            $table->integer('unit_id')->nullable();
            $table->integer('purchase_unit_id')->nullable();
            $table->integer('sale_unit_id')->nullable();
            $table->double('qty')->default(0);
            $table->double('alert_quantity')->nullable();
            $table->double('price')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('unit_code');
            $table->string('unit_name');
            $table->timestamps();
        });
        Schema::create('taxes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->double('rate');
            $table->timestamps();
        });
        Schema::create('variants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('product_batches', function (Blueprint $table) {
            $table->id();
            $table->integer('product_id');
            $table->string('batch_no');
            $table->date('expired_date')->nullable();
            $table->timestamps();
        });
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->integer('position')->default(0);
            $table->string('item_code');
            $table->double('additional_price')->default(0);
            $table->double('qty')->default(0);
            $table->timestamps();
        });
        Schema::create('product_warehouse', function (Blueprint $table) {
            $table->id();
            $table->integer('product_id');
            $table->integer('warehouse_id');
            $table->integer('variant_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->double('qty')->default(0);
            $table->double('price')->nullable();
            $table->timestamps();
        });

        foreach (['product_purchases', 'product_sales', 'product_returns', 'purchase_product_return', 'product_transfer'] as $tableName) {
            Schema::create($tableName, function (Blueprint $table) {
                $table->id();
                $table->integer('product_id');
            });
        }

        DB::table('categories')->insert([
            ['id' => 1, 'name' => 'Category One'],
            ['id' => 2, 'name' => 'Category Two'],
        ]);
    }

    protected function tearDown(): void
    {
        foreach (self::TABLES as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_summary_counts_all_filtered_products_not_only_the_current_page(): void
    {
        $this->insertProduct(1, 'Healthy', 10, 2, true, 1);
        $this->insertProduct(2, 'Low', 2, 3, true, 1);
        $this->insertProduct(3, 'Empty', 0, 3, true, 2);
        $this->insertProduct(4, 'Inactive', 10, 2, false, 2);

        $response = $this->productIndex(['status' => 'all', 'per_page' => 2]);

        $this->assertCount(2, $response['data']);
        $this->assertSame([
            'total' => 4,
            'active' => 3,
            'low_stock' => 1,
            'out_of_stock' => 1,
            'categories' => 2,
        ], $response['summary']);

        $filtered = $this->productIndex(['status' => 'all', 'category_id' => 1, 'per_page' => 1]);
        $this->assertCount(1, $filtered['data']);
        $this->assertSame(2, $filtered['summary']['total']);
        $this->assertSame(1, $filtered['summary']['low_stock']);
        $this->assertSame(1, $filtered['summary']['categories']);

        $lowStock = $this->productIndex(['status' => 'low_stock']);
        $this->assertSame(1, $lowStock['summary']['total']);
        $this->assertSame(1, $lowStock['summary']['active']);
        $this->assertSame(1, $lowStock['summary']['low_stock']);

        $searched = $this->productIndex(['search' => 'Empty']);
        $this->assertSame(1, $searched['summary']['total']);
        $this->assertSame(1, $searched['summary']['out_of_stock']);

        $defaultListing = $this->productIndex([]);
        $this->assertSame(3, $defaultListing['summary']['total']);
        $this->assertSame(3, $defaultListing['summary']['active']);
    }

    public function test_warehouse_filter_uses_warehouse_quantity_and_excludes_unassigned_products(): void
    {
        $this->insertProduct(1, 'Warehouse Low', 100, 5, true, 1);
        $this->insertProduct(2, 'Warehouse Empty', 100, 5, true, 1);
        DB::table('warehouses')->insert(['id' => 1, 'name' => 'Main Warehouse']);
        DB::table('product_warehouse')->insert([
            'product_id' => 1,
            'warehouse_id' => 1,
            'qty' => 2,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->productIndex(['status' => 'all', 'warehouse_id' => 1, 'per_page' => 10]);

        $this->assertSame(1, $response['summary']['total']);
        $this->assertSame(1, $response['summary']['low_stock']);
        $this->assertSame(0, $response['summary']['out_of_stock']);
        $quantities = collect($response['data'])->pluck('qty', 'id')->all();
        $this->assertEquals(2.0, $quantities[1]);
        $this->assertArrayNotHasKey(2, $quantities);
    }

    private function insertProduct(int $id, string $name, float $qty, float $alertQuantity, bool $active, int $categoryId): void
    {
        DB::table('products')->insert([
            'id' => $id,
            'name' => $name,
            'code' => "P-{$id}",
            'category_id' => $categoryId,
            'qty' => $qty,
            'alert_quantity' => $alertQuantity,
            'is_active' => $active,
            'created_at' => now()->addSeconds($id),
            'updated_at' => now()->addSeconds($id),
        ]);
    }

    private function productIndex(array $parameters): array
    {
        $request = Request::create('/api/products', 'GET', $parameters);

        return app(ProductController::class)->index($request)->response()->getData(true);
    }
}
