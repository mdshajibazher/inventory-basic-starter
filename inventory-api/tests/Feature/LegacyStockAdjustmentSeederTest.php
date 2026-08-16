<?php

namespace Tests\Feature;

use App\Models\Adjustment;
use App\Models\Product;
use App\Models\ProductAdjustment;
use Database\Seeders\LegacyProductSeeder;
use Database\Seeders\LegacyStockAdjustmentSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LegacyStockAdjustmentSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createPrerequisiteTables();
        $this->createProductTable();
        $this->createAdjustmentTables();
        $this->seedPrerequisites();
    }

    public function test_it_imports_nonzero_adjustments_using_signed_quantities_and_reconciles_stock(): void
    {
        DB::table('adjustments')->insert([
            'id' => 9000,
            'reference_no' => 'REMOVE-ME',
            'warehouse_id' => 1,
            'total_qty' => 1,
            'item' => 1,
        ]);
        DB::table('product_adjustments')->insert([
            'id' => 9000,
            'adjustment_id' => 9000,
            'product_id' => 1,
            'variant_id' => null,
            'qty' => 1,
            'action' => 'increase',
        ]);

        $this->seed(LegacyStockAdjustmentSeeder::class);

        $this->assertSame(3752, Adjustment::query()->count());
        $this->assertSame(3752, ProductAdjustment::query()->count());
        $this->assertSame(3975, Adjustment::query()->max('id'));
        $this->assertSame(3752, ProductAdjustment::query()->max('id'));
        $this->assertDatabaseMissing('adjustments', ['id' => 14]);
        $this->assertDatabaseMissing('adjustments', ['id' => 9000]);

        $adjustment = Adjustment::query()->findOrFail(1);
        $line = ProductAdjustment::query()->where('adjustment_id', 1)->firstOrFail();

        $this->assertSame('LEGACY-ADJ-1', $adjustment->reference_no);
        $this->assertSame(1, $adjustment->warehouse_id);
        $this->assertSame(360.0, $adjustment->total_qty);
        $this->assertSame(1, $adjustment->item);
        $this->assertNull($adjustment->note);
        $this->assertSame('2021-01-01 00:00:00', $adjustment->created_at->format('Y-m-d H:i:s'));
        $this->assertSame(66, $line->product_id);
        $this->assertSame(360.0, $line->qty);
        $this->assertSame('decrease', $line->action);
        $this->assertNull($line->variant_id);

        $decreaseMovement = DB::table('product_stock_movements')
            ->where('source_type', 'product_adjustment')
            ->where('source_id', $line->id)
            ->first();

        $this->assertNotNull($decreaseMovement);
        $this->assertSame('stock_decrease', $decreaseMovement->type);
        $this->assertSame(-360.0, (float) $decreaseMovement->quantity);
        $this->assertSame(-360.0, (float) $decreaseMovement->quantity_base);
        $this->assertSame(0.0, (float) $decreaseMovement->before_quantity);
        $this->assertSame(-360.0, (float) $decreaseMovement->after_quantity);
        $this->assertSame(1, (int) $decreaseMovement->unit_id);
        $this->assertSame(11, (int) $decreaseMovement->user_id);
        $this->assertSame('2021-01-01', $decreaseMovement->movement_date);

        $positiveLine = ProductAdjustment::query()->where('adjustment_id', 3820)->firstOrFail();
        $positiveMovement = DB::table('product_stock_movements')
            ->where('source_type', 'product_adjustment')
            ->where('source_id', $positiveLine->id)
            ->first();

        $this->assertSame('increase', $positiveLine->action);
        $this->assertSame(230.0, $positiveLine->qty);
        $this->assertSame('stock_increase', $positiveMovement->type);
        $this->assertSame(230.0, (float) $positiveMovement->quantity_base);

        $notedAdjustment = Adjustment::query()->findOrFail(3802);
        $this->assertSame('HAir sol serum', $notedAdjustment->note);
        $this->assertSame(50.0, $notedAdjustment->total_qty);

        $this->assertSame(3752, DB::table('product_stock_movements')
            ->where('source_type', 'product_adjustment')->count());
        $this->assertSame(0, DB::table('product_stock_movements')->where('unit_id', '!=', 1)->count());
        $this->assertSame(9371.0, (float) Product::query()->findOrFail(66)->qty);
        $this->assertSame(9371.0, (float) DB::table('product_warehouse')
            ->where('product_id', 66)->where('warehouse_id', 1)->value('qty'));

        $this->seed(LegacyStockAdjustmentSeeder::class);

        $this->assertSame(9371.0, (float) Product::query()->findOrFail(66)->qty);
        $this->assertSame(9371.0, (float) DB::table('product_warehouse')
            ->where('product_id', 66)->where('warehouse_id', 1)->value('qty'));
        $this->assertSame(3752, DB::table('product_stock_movements')
            ->where('source_type', 'product_adjustment')->count());

        Product::query()->whereKey(66)->increment('qty', 100);
        DB::table('product_warehouse')->where('product_id', 66)->where('warehouse_id', 1)->increment('qty', 100);

        $this->seed(LegacyStockAdjustmentSeeder::class);

        $this->assertSame(9471.0, (float) Product::query()->findOrFail(66)->qty);
        $this->assertSame(9471.0, (float) DB::table('product_warehouse')
            ->where('product_id', 66)->where('warehouse_id', 1)->value('qty'));
    }

    private function createPrerequisiteTables(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->timestamps();
        });
        Schema::create('warehouses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('units', function (Blueprint $table) {
            $table->increments('id');
            $table->string('unit_code');
            $table->string('unit_name');
            $table->timestamps();
        });
        Schema::create('product_warehouse', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->integer('warehouse_id');
            $table->double('qty');
            $table->double('price')->nullable();
            $table->timestamps();
        });
        Schema::create('product_stock_movements', function (Blueprint $table) {
            $table->increments('id');
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
            $table->double('before_quantity')->default(0);
            $table->double('after_quantity')->default(0);
            $table->string('reference_no')->nullable();
            $table->text('note')->nullable();
            $table->date('movement_date')->nullable();
            $table->timestamps();
        });
    }

    private function createProductTable(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->string('type');
            $table->string('barcode_symbology');
            $table->integer('brand_id')->nullable();
            $table->integer('category_id');
            $table->integer('unit_id');
            $table->integer('purchase_unit_id');
            $table->integer('sale_unit_id');
            $table->string('cost');
            $table->string('price');
            $table->double('qty')->nullable();
            $table->double('alert_quantity')->nullable();
            $table->boolean('promotion')->nullable();
            $table->string('promotion_price')->nullable();
            $table->date('starting_date')->nullable();
            $table->date('last_date')->nullable();
            $table->integer('tax_id')->nullable();
            $table->integer('tax_method')->nullable();
            $table->longText('image')->nullable();
            $table->string('file')->nullable();
            $table->boolean('featured')->nullable();
            $table->text('product_details')->nullable();
            $table->string('product_list')->nullable();
            $table->string('qty_list')->nullable();
            $table->string('price_list')->nullable();
            $table->boolean('is_variant')->nullable();
            $table->boolean('is_batch')->nullable();
            $table->boolean('is_diffPrice')->nullable();
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });
    }

    private function createAdjustmentTables(): void
    {
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
    }

    private function seedPrerequisites(): void
    {
        DB::table('users')->insert([
            'id' => 11,
            'name' => 'Inventory Admin',
            'email' => 'admin@example.com',
            'password' => 'password',
        ]);
        DB::table('warehouses')->insert(['id' => 1, 'name' => 'Warehouse One']);
        DB::table('units')->insert(['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece']);
        $this->seed(LegacyProductSeeder::class);
    }
}
