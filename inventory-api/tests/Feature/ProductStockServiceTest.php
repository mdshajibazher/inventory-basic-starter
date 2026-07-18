<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductWarehouse;
use App\Services\ProductStockService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ProductStockServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->string('type')->default('standard');
            $table->double('qty')->nullable();
            $table->boolean('is_variant')->nullable();
            $table->boolean('is_batch')->nullable();
            $table->timestamps();
        });

        Schema::create('product_warehouse', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('product_id');
            $table->integer('warehouse_id');
            $table->integer('variant_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->double('qty');
            $table->double('price')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('product_warehouse');
        Schema::dropIfExists('products');

        parent::tearDown();
    }

    public function test_simple_product_can_decrease_from_legacy_aggregate_stock(): void
    {
        DB::table('products')->insert([
            'id' => 1,
            'name' => 'Legacy Widget',
            'code' => 'LW-1',
            'type' => 'standard',
            'qty' => 10,
            'is_variant' => false,
            'is_batch' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        [$before, $after] = app(ProductStockService::class)->applyDelta(
            Product::query()->findOrFail(1),
            1,
            null,
            null,
            -3
        );

        $this->assertSame(10.0, $before);
        $this->assertSame(7.0, $after);
        $this->assertSame(7.0, (float) Product::query()->findOrFail(1)->qty);
        $this->assertSame(7.0, (float) ProductWarehouse::query()
            ->where('product_id', 1)
            ->where('warehouse_id', 1)
            ->whereNull('variant_id')
            ->whereNull('product_batch_id')
            ->value('qty'));
    }

    public function test_stock_decrease_still_fails_when_selected_warehouse_has_no_stock(): void
    {
        DB::table('products')->insert([
            'id' => 1,
            'name' => 'Warehouse Widget',
            'code' => 'WW-1',
            'type' => 'standard',
            'qty' => 10,
            'is_variant' => false,
            'is_batch' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        ProductWarehouse::query()->create([
            'product_id' => 1,
            'warehouse_id' => 2,
            'qty' => 10,
        ]);

        $this->expectException(ValidationException::class);

        app(ProductStockService::class)->applyDelta(
            Product::query()->findOrFail(1),
            1,
            null,
            null,
            -3
        );
    }
}
