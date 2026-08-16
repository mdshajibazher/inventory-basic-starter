<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductPurchase;
use App\Models\Purchase;
use App\Models\Supplier;
use Database\Seeders\LegacyProductSeeder;
use Database\Seeders\LegacySupplierAndPurchaseSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LegacySupplierAndPurchaseSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createPrerequisiteTables();
        $this->createProductTable();
        $this->createPurchaseTables();
        $this->seedPrerequisites();
    }

    public function test_it_imports_suppliers_and_purchases_and_reconciles_stock_idempotently(): void
    {
        DB::table('suppliers')->insert([
            'id' => 1,
            'name' => 'Supplier to overwrite',
            'company_name' => 'Old Company',
            'email' => 'old@example.com',
            'phone_number' => '0',
            'address' => 'Old address',
            'city' => 'Old city',
            'is_active' => true,
        ]);
        DB::table('purchases')->insert($this->existingPurchase());
        DB::table('product_purchases')->insert([
            'id' => 9000,
            'purchase_id' => 9000,
            'date' => '2026-01-01',
            'product_id' => 1,
            'product_batch_id' => null,
            'variant_id' => null,
            'batch_no' => null,
            'expired_date' => null,
            'qty' => 1,
            'recieved' => 1,
            'purchase_unit_id' => 1,
            'net_unit_cost' => 1,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => 1,
        ]);

        $this->seed(LegacySupplierAndPurchaseSeeder::class);

        $this->assertSame(30, Supplier::query()->whereKeyNot(9000)->count());
        $this->assertSame(197, Purchase::query()->count());
        $this->assertSame(661, ProductPurchase::query()->count());
        $this->assertSame(202, Purchase::query()->max('id'));
        $this->assertSame(661, ProductPurchase::query()->max('id'));
        $this->assertDatabaseMissing('purchases', ['id' => 9000]);
        $this->assertDatabaseMissing('product_purchases', ['purchase_id' => 9000]);
        $this->assertDatabaseMissing('purchases', ['id' => 89]);

        $supplier = Supplier::query()->findOrFail(1);

        $this->assertSame('Purchase', $supplier->name);
        $this->assertSame('Demo Comapny', $supplier->company_name);
        $this->assertSame('info@example.com', $supplier->email);
        $this->assertSame('01700554466', $supplier->phone_number);
        $this->assertSame('Dhaka', $supplier->address);
        $this->assertSame('', $supplier->city);
        $this->assertTrue($supplier->is_active);

        $purchase = Purchase::query()->findOrFail(5);

        $this->assertSame('LEGACY-P-5', $purchase->reference_no);
        $this->assertSame('2020-08-10', $purchase->purchase_date->toDateString());
        $this->assertSame(11, $purchase->user_id);
        $this->assertSame(1, $purchase->warehouse_id);
        $this->assertSame(1, $purchase->biller_id);
        $this->assertSame(1, $purchase->supplier_id);
        $this->assertSame(51, $purchase->item);
        $this->assertSame(85547.0, $purchase->total_qty);
        $this->assertSame(85547.0, $purchase->total_cost);
        $this->assertSame(85547.0, $purchase->grand_total);
        $this->assertSame(1, $purchase->status);
        $this->assertSame(3, $purchase->payment_status);
        $this->assertSame(0.0, $purchase->paid_amount);
        $this->assertSame('approved', $purchase->approval_status);
        $this->assertSame(11, $purchase->approved_by);

        $line = ProductPurchase::query()
            ->where('purchase_id', 5)
            ->where('product_id', 1)
            ->firstOrFail();

        $this->assertNotSame(27, $line->id);
        $this->assertSame('2020-08-10', $line->date->toDateString());
        $this->assertSame(42.0, $line->qty);
        $this->assertSame(42.0, $line->recieved);
        $this->assertSame(1, $line->purchase_unit_id);
        $this->assertSame(1.0, $line->net_unit_cost);
        $this->assertSame(42.0, $line->total);
        $this->assertNull($line->variant_id);
        $this->assertNull($line->product_batch_id);
        $this->assertSame(0, ProductPurchase::query()->where('purchase_unit_id', '!=', 1)->count());

        $this->assertSame(661, DB::table('product_stock_movements')->count());
        $this->assertSame(159.0, (float) Product::query()->findOrFail(1)->qty);
        $this->assertSame(159.0, (float) DB::table('product_warehouse')
            ->where('product_id', 1)
            ->where('warehouse_id', 1)
            ->value('qty'));

        $movement = DB::table('product_stock_movements')
            ->where('source_type', 'product_purchase')
            ->where('source_id', $line->id)
            ->first();

        $this->assertNotNull($movement);
        $this->assertSame('purchase', $movement->type);
        $this->assertSame(42.0, (float) $movement->quantity);
        $this->assertSame(42.0, (float) $movement->quantity_base);
        $this->assertSame(1, (int) $movement->unit_id);
        $this->assertSame((float) $movement->before_quantity + 42, (float) $movement->after_quantity);

        $this->seed(LegacySupplierAndPurchaseSeeder::class);

        $this->assertSame(159.0, (float) Product::query()->findOrFail(1)->qty);
        $this->assertSame(159.0, (float) DB::table('product_warehouse')
            ->where('product_id', 1)
            ->where('warehouse_id', 1)
            ->value('qty'));
        $this->assertSame(661, DB::table('product_stock_movements')->count());

        Product::query()->whereKey(1)->increment('qty', 100);
        DB::table('product_warehouse')->where('product_id', 1)->where('warehouse_id', 1)->increment('qty', 100);

        $this->seed(LegacySupplierAndPurchaseSeeder::class);

        $this->assertSame(259.0, (float) Product::query()->findOrFail(1)->qty);
        $this->assertSame(259.0, (float) DB::table('product_warehouse')
            ->where('product_id', 1)
            ->where('warehouse_id', 1)
            ->value('qty'));
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
        Schema::create('billers', function (Blueprint $table) {
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
        Schema::create('suppliers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('image')->nullable();
            $table->string('company_name');
            $table->string('vat_number')->nullable();
            $table->string('email');
            $table->string('phone_number');
            $table->string('address');
            $table->string('city');
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('country')->nullable();
            $table->boolean('is_active')->nullable();
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

    private function createPurchaseTables(): void
    {
        Schema::create('purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('purchase_date')->nullable();
            $table->integer('user_id');
            $table->integer('warehouse_id');
            $table->integer('biller_id')->nullable();
            $table->integer('supplier_id')->nullable();
            $table->integer('item');
            $table->double('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_cost');
            $table->double('order_tax_rate')->nullable();
            $table->double('order_tax')->nullable();
            $table->double('order_discount')->nullable();
            $table->double('shipping_cost')->nullable();
            $table->double('grand_total');
            $table->double('paid_amount');
            $table->integer('status');
            $table->integer('payment_status');
            $table->string('document')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->string('approval_status')->default('approved');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
        });
        Schema::create('product_purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('purchase_id');
            $table->date('date')->nullable();
            $table->integer('product_id');
            $table->integer('product_batch_id')->nullable();
            $table->integer('variant_id')->nullable();
            $table->string('batch_no')->nullable();
            $table->date('expired_date')->nullable();
            $table->double('qty');
            $table->double('recieved');
            $table->integer('purchase_unit_id');
            $table->double('net_unit_cost');
            $table->double('discount');
            $table->double('tax_rate');
            $table->double('tax');
            $table->double('total');
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
        DB::table('billers')->insert(['id' => 1, 'name' => 'Biller One']);
        DB::table('units')->insert(['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece']);
        $this->seed(LegacyProductSeeder::class);
    }

    /** @return array<string, mixed> */
    private function existingPurchase(): array
    {
        return [
            'id' => 9000,
            'reference_no' => 'REMOVE-ME',
            'purchase_date' => '2026-01-01',
            'user_id' => 11,
            'warehouse_id' => 1,
            'biller_id' => 1,
            'supplier_id' => 1,
            'item' => 1,
            'total_qty' => 1,
            'total_discount' => 0,
            'total_tax' => 0,
            'total_cost' => 1,
            'order_tax_rate' => 0,
            'order_tax' => 0,
            'order_discount' => 0,
            'shipping_cost' => 0,
            'grand_total' => 1,
            'paid_amount' => 0,
            'status' => 1,
            'payment_status' => 3,
            'document' => null,
            'note' => null,
            'approval_status' => 'approved',
            'approved_by' => 11,
            'approved_at' => '2026-01-01 00:00:00',
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ];
    }
}
