<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use App\Services\ProductStockService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class BatchStockAdjustmentServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->string('type')->default('standard');
            $table->integer('unit_id')->nullable();
            $table->double('qty')->default(0);
            $table->boolean('is_variant')->default(false);
            $table->boolean('is_batch')->default(false);
            $table->timestamps();
        });
        Schema::create('warehouses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('units', function (Blueprint $table) {
            $table->increments('id');
            $table->string('unit_code');
            $table->string('unit_name');
            $table->integer('base_unit')->nullable();
            $table->string('operator')->nullable();
            $table->double('operation_value')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('adjustments', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->integer('warehouse_id');
            $table->string('document')->nullable();
            $table->double('total_qty');
            $table->integer('item');
            $table->text('note')->nullable();
            $table->timestamps();
        });
        Schema::create('product_adjustments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('adjustment_id');
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->double('qty');
            $table->string('action');
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
        Schema::create('product_stock_movements', function (Blueprint $table) {
            $table->id();
            $table->integer('product_id');
            $table->integer('warehouse_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->integer('variant_id')->nullable();
            $table->integer('unit_id')->nullable();
            $table->integer('user_id')->nullable();
            $table->string('source_type')->nullable();
            $table->integer('source_id')->nullable();
            $table->string('type');
            $table->double('quantity');
            $table->double('quantity_base');
            $table->double('before_quantity');
            $table->double('after_quantity');
            $table->string('reference_no')->nullable();
            $table->text('note')->nullable();
            $table->date('movement_date')->nullable();
            $table->timestamps();
        });
        foreach (['variants', 'product_batches', 'users'] as $tableName) {
            Schema::create($tableName, function (Blueprint $table) use ($tableName) {
                $table->increments('id');
                if ($tableName === 'variants') {
                    $table->string('name')->nullable();
                }
                if ($tableName === 'product_batches') {
                    $table->integer('product_id')->nullable();
                    $table->string('batch_no')->nullable();
                    $table->date('expired_date')->nullable();
                }
                if ($tableName === 'users') {
                    $table->string('name')->nullable();
                    $table->string('email')->nullable();
                }
                $table->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        foreach (['product_stock_movements', 'product_warehouse', 'product_adjustments', 'adjustments', 'product_batches', 'variants', 'users', 'units', 'warehouses', 'products'] as $table) {
            Schema::dropIfExists($table);
        }
        parent::tearDown();
    }

    public function test_batch_adjustment_creates_grouped_movements_and_updates_stock(): void
    {
        $this->seedBaseRows();

        $adjustment = app(ProductStockService::class)->createBatchAdjustment([
            'warehouse_id' => 1,
            'note' => 'Cycle count',
            'product_id' => [1, 2],
            'variant_id' => [null, null],
            'product_batch_id' => [null, null],
            'unit_id' => [1, 1],
            'direction' => ['increase', 'decrease'],
            'qty' => [3, 2],
        ], (new User)->forceFill(['id' => 9]));

        $this->assertSame(2, $adjustment->item);
        $this->assertSame(5.0, $adjustment->total_qty);
        $this->assertDatabaseCount('product_adjustments', 2);
        $this->assertDatabaseCount('product_stock_movements', 2);
        $this->assertSame(13.0, (float) Product::query()->findOrFail(1)->qty);
        $this->assertSame(8.0, (float) Product::query()->findOrFail(2)->qty);
        $this->assertSame(1, DB::table('product_stock_movements')->distinct()->count('reference_no'));
    }

    public function test_invalid_later_line_rolls_back_the_entire_batch(): void
    {
        $this->seedBaseRows();

        try {
            app(ProductStockService::class)->createBatchAdjustment([
                'warehouse_id' => 1,
                'product_id' => [1, 2],
                'variant_id' => [null, null],
                'product_batch_id' => [null, null],
                'unit_id' => [1, 1],
                'direction' => ['increase', 'decrease'],
                'qty' => [3, 20],
            ], (new User)->forceFill(['id' => 9]));
            $this->fail('Expected stock validation to fail.');
        } catch (ValidationException) {
            $this->assertDatabaseCount('adjustments', 0);
            $this->assertDatabaseCount('product_adjustments', 0);
            $this->assertDatabaseCount('product_stock_movements', 0);
            $this->assertSame(10.0, (float) Product::query()->findOrFail(1)->qty);
            $this->assertSame(10.0, (float) Product::query()->findOrFail(2)->qty);
        }
    }

    private function seedBaseRows(): void
    {
        DB::table('warehouses')->insert(['id' => 1, 'name' => 'Main', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('units')->insert(['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        foreach ([1, 2] as $id) {
            DB::table('products')->insert(['id' => $id, 'name' => "Product {$id}", 'code' => "P-{$id}", 'type' => 'standard', 'unit_id' => 1, 'qty' => 10, 'is_variant' => false, 'is_batch' => false, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('product_warehouse')->insert(['product_id' => $id, 'warehouse_id' => 1, 'qty' => 10, 'created_at' => now(), 'updated_at' => now()]);
        }
    }
}
