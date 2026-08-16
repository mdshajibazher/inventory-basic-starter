<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductReturn;
use App\Models\ProductSale;
use App\Models\ReturnInvoice;
use App\Models\Sale;
use Database\Seeders\LegacyAdvanceCashSeeder;
use Database\Seeders\LegacyProductReturnSeeder;
use Database\Seeders\LegacyProductSeeder;
use Database\Seeders\LegacySaleSeeder;
use Database\Seeders\LegacyUserToCustomerSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LegacySaleSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createPrerequisiteTables();
        $this->createProductTable();
        $this->createSalesTables();
        $this->createReturnTables();
        $this->createPaymentTables();
        $this->seedPrerequisites();
    }

    public function test_it_replaces_product_returns_and_reconciles_approved_return_stock(): void
    {
        $this->seed(LegacyProductReturnSeeder::class);

        $this->assertSame(565, ReturnInvoice::query()->count());
        $this->assertSame(1015, ProductReturn::query()->count());
        $this->assertSame(0, ReturnInvoice::query()->where('approval_status', '!=', 'approved')->count());
        $this->assertSame(574, ReturnInvoice::query()->max('id'));
        $this->assertSame(1015, ProductReturn::query()->max('id'));
        $this->assertDatabaseMissing('returns', ['id' => 16]);

        $return = ReturnInvoice::query()->findOrFail(1);

        $this->assertSame('LEGACY-R-1', $return->reference_no);
        $this->assertSame('2020-08-13', $return->return_date->toDateString());
        $this->assertSame(5, $return->customer_id);
        $this->assertSame(10, $return->user_id);
        $this->assertSame(1, $return->warehouse_id);
        $this->assertSame(1, $return->biller_id);
        $this->assertSame(1, $return->account_id);
        $this->assertSame(1, $return->item);
        $this->assertSame(10.0, $return->total_qty);
        $this->assertSame(1600.0, $return->total_price);
        $this->assertSame(1600.0, $return->grand_total);
        $this->assertSame('approved', $return->approval_status);
        $this->assertSame(12, $return->approved_by);

        $line = ProductReturn::query()->where('return_id', 1)->firstOrFail();
        $productCost = (float) Product::query()->findOrFail(33)->cost;

        $this->assertSame('2020-08-13', $line->date->toDateString());
        $this->assertSame(33, $line->product_id);
        $this->assertSame(10.0, $line->qty);
        $this->assertSame(1, $line->sale_unit_id);
        $this->assertSame(160.0, $line->net_unit_price);
        $this->assertSame(1600.0, $line->total);
        $this->assertSame($productCost, $line->unit_cost);
        $this->assertSame(round($productCost * 10, 2), $line->total_cost);
        $this->assertNull($line->variant_id);
        $this->assertNull($line->product_batch_id);

        $this->assertSame('approved', ReturnInvoice::query()->findOrFail(574)->approval_status);
        $this->assertSame(1015, DB::table('product_stock_movements')->where('source_type', 'product_return')->count());
        $this->assertSame(80.0, (float) Product::query()->findOrFail(33)->qty);
        $this->assertSame(80.0, (float) DB::table('product_warehouse')
            ->where('product_id', 33)->where('warehouse_id', 1)->value('qty'));

        $movement = DB::table('product_stock_movements')
            ->where('source_type', 'product_return')->where('source_id', $line->id)->first();

        $this->assertNotNull($movement);
        $this->assertSame('product_return', $movement->type);
        $this->assertSame(10.0, (float) $movement->quantity);
        $this->assertSame((float) $movement->before_quantity + 10, (float) $movement->after_quantity);

        $lastReturnMovementCount = DB::table('product_stock_movements as movement')
            ->join('product_returns as product_return', 'product_return.id', '=', 'movement.source_id')
            ->where('movement.source_type', 'product_return')
            ->where('product_return.return_id', 574)
            ->count();
        $this->assertSame(1, $lastReturnMovementCount);
        $this->assertSame(317.0, (float) Product::query()->findOrFail(442)->qty);

        $this->seed(LegacyProductReturnSeeder::class);

        $this->assertSame(80.0, (float) Product::query()->findOrFail(33)->qty);
        $this->assertSame(317.0, (float) Product::query()->findOrFail(442)->qty);
        $this->assertSame(1015, DB::table('product_stock_movements')->where('source_type', 'product_return')->count());
    }

    public function test_it_replaces_sales_while_preserving_sale_ids_and_generating_product_sale_ids(): void
    {
        DB::table('sales')->insert($this->existingSale());
        DB::table('product_sales')->insert([
            'id' => 9000,
            'sale_id' => 9000,
            'date' => '2026-01-01',
            'product_id' => 1,
            'variant_id' => null,
            'product_batch_id' => null,
            'qty' => 1,
            'sale_unit_id' => 1,
            'net_unit_price' => 1,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => 1,
            'unit_cost' => 1,
            'total_cost' => 1,
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ]);

        $this->seed(LegacySaleSeeder::class);

        $this->assertSame(6757, Sale::query()->count());
        $this->assertSame(13330, ProductSale::query()->count());
        $this->assertSame(7127, Sale::query()->max('id'));
        $this->assertSame(13330, ProductSale::query()->max('id'));
        $this->assertDatabaseMissing('sales', ['id' => 9000]);
        $this->assertDatabaseMissing('product_sales', ['sale_id' => 9000]);
        $this->assertDatabaseMissing('sales', ['id' => 79]);

        $sale = Sale::query()->findOrFail(21);

        $this->assertSame('LEGACY-S-21', $sale->reference_no);
        $this->assertSame('2020-08-13', $sale->sale_date->toDateString());
        $this->assertSame(10, $sale->user_id);
        $this->assertSame(1, $sale->warehouse_id);
        $this->assertSame(1, $sale->biller_id);
        $this->assertSame(7, $sale->item);
        $this->assertSame(143.0, $sale->total_qty);
        $this->assertSame(330.0, $sale->total_discount);
        $this->assertSame(15760.0, $sale->total_price);
        $this->assertSame(1576.0, $sale->order_discount);
        $this->assertSame(14184.0, $sale->grand_total);
        $this->assertSame(1, $sale->sale_status);
        $this->assertSame(2, $sale->payment_status);
        $this->assertSame(0.0, $sale->paid_amount);
        $this->assertSame('approved', $sale->approval_status);
        $this->assertSame(12, $sale->approved_by);

        $freeLine = ProductSale::query()
            ->where('sale_id', 21)
            ->where('product_id', 97)
            ->firstOrFail();
        $productCost = (float) Product::query()->findOrFail(97)->cost;

        $this->assertNotSame(52, $freeLine->id);
        $this->assertSame('2020-08-13', $freeLine->date->toDateString());
        $this->assertSame(39.0, $freeLine->qty);
        $this->assertSame(1, $freeLine->sale_unit_id);
        $this->assertSame(110.0, $freeLine->net_unit_price);
        $this->assertSame(330.0, $freeLine->discount);
        $this->assertSame(3960.0, $freeLine->total);
        $this->assertSame($productCost, $freeLine->unit_cost);
        $this->assertSame(round($productCost * 39, 2), $freeLine->total_cost);
        $this->assertNull($freeLine->variant_id);
        $this->assertNull($freeLine->product_batch_id);
        $this->assertSame(0, ProductSale::query()->where('sale_unit_id', '!=', 1)->count());

        $this->assertSame('pending', Sale::query()->findOrFail(7090)->approval_status);

        $this->assertSame(13314, DB::table('product_stock_movements')->count());
        $this->assertSame(-120463.0, (float) Product::query()->findOrFail(237)->qty);
        $this->assertSame(-120463.0, (float) DB::table('product_warehouse')
            ->where('product_id', 237)
            ->where('warehouse_id', 1)
            ->value('qty'));

        $movement = DB::table('product_stock_movements')
            ->where('source_type', 'product_sale')
            ->where('source_id', $freeLine->id)
            ->first();

        $this->assertNotNull($movement);
        $this->assertSame('product_sale', $movement->type);
        $this->assertSame(-39.0, (float) $movement->quantity);
        $this->assertSame(-39.0, (float) $movement->quantity_base);
        $this->assertSame(1, (int) $movement->unit_id);
        $this->assertSame(
            (float) $movement->before_quantity - 39,
            (float) $movement->after_quantity
        );

        $pendingMovementCount = DB::table('product_stock_movements as movement')
            ->join('product_sales as product_sale', 'product_sale.id', '=', 'movement.source_id')
            ->where('movement.source_type', 'product_sale')
            ->where('product_sale.sale_id', 7090)
            ->count();
        $this->assertSame(0, $pendingMovementCount);

        $this->seed(LegacySaleSeeder::class);

        $this->assertSame(-120463.0, (float) Product::query()->findOrFail(237)->qty);
        $this->assertSame(-120463.0, (float) DB::table('product_warehouse')
            ->where('product_id', 237)
            ->where('warehouse_id', 1)
            ->value('qty'));
        $this->assertSame(13314, DB::table('product_stock_movements')->count());

        Product::query()->whereKey(237)->increment('qty', 100);
        DB::table('product_warehouse')
            ->where('product_id', 237)
            ->where('warehouse_id', 1)
            ->increment('qty', 100);

        $this->assertSame(-120363.0, (float) Product::query()->findOrFail(237)->qty);
        $this->assertSame(-120363.0, (float) DB::table('product_warehouse')
            ->where('product_id', 237)
            ->where('warehouse_id', 1)
            ->value('qty'));
    }

    public function test_it_replaces_payments_with_legacy_customer_advances_and_splits_cash_from_discount(): void
    {
        DB::table('payments')->insert([
            'id' => 9000,
            'payment_reference' => 'REMOVE-ME',
            'user_id' => 11,
            'account_id' => 1,
            'biller_id' => 1,
            'customer_id' => 1,
            'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 1,
            'discount_amount' => 0,
            'change' => 0,
            'paying_method' => 'Cheque',
            'approval_status' => 'approved',
        ]);
        DB::table('payment_with_cheque')->insert([
            'id' => 1,
            'payment_id' => 9000,
        ]);

        $this->seed(LegacyAdvanceCashSeeder::class);

        $this->assertSame(5683, Payment::query()->count());
        $this->assertSame(5953, Payment::query()->max('id'));
        $this->assertDatabaseMissing('payments', ['id' => 9000]);
        $this->assertDatabaseMissing('payments', ['id' => 20]);
        $this->assertDatabaseMissing('payments', ['id' => 2965]);
        $this->assertDatabaseMissing('payments', ['id' => 4623]);
        $this->assertDatabaseMissing('payments', ['id' => 3844]);
        $this->assertDatabaseCount('payment_with_cheque', 0);
        $this->assertSame(0, Payment::query()->where('paying_method', '!=', 'Cash')->count());

        $payment = Payment::query()->findOrFail(1);

        $this->assertSame('LEGACY-C-1', $payment->payment_reference);
        $this->assertSame(10, $payment->user_id);
        $this->assertSame(4, $payment->customer_id);
        $this->assertSame(1, $payment->account_id);
        $this->assertSame(1, $payment->biller_id);
        $this->assertSame(Payment::TYPE_CUSTOMER_ADVANCE, $payment->payment_type);
        $this->assertSame(Payment::DIRECTION_IN, $payment->direction);
        $this->assertSame(200000.0, $payment->amount);
        $this->assertSame(0.0, $payment->discount_amount);
        $this->assertSame(0.0, $payment->change);
        $this->assertSame('Cash', $payment->paying_method);
        $this->assertSame('undefined', $payment->payment_note);
        $this->assertSame('approved', $payment->approval_status);
        $this->assertSame(12, $payment->approved_by);
        $this->assertSame('2020-08-18 15:44:45', $payment->approved_at->format('Y-m-d H:i:s'));
        $this->assertSame('2020-08-12 17:34:25', $payment->created_at->format('Y-m-d H:i:s'));
        $this->assertSame('2020-08-18 15:44:45', $payment->updated_at->format('Y-m-d H:i:s'));

        $discountedPayment = Payment::query()->findOrFail(1515);

        $this->assertSame(158400.0, $discountedPayment->amount);
        $this->assertSame(14400.0, $discountedPayment->discount_amount);
        $this->assertSame(172800.0, $discountedPayment->amount + $discountedPayment->discount_amount);

        $this->seed(LegacyAdvanceCashSeeder::class);

        $this->assertSame(5683, Payment::query()->count());
        $this->assertSame(5953, Payment::query()->max('id'));
        $this->assertSame(158400.0, Payment::query()->findOrFail(1515)->amount);
        $this->assertSame(14400.0, Payment::query()->findOrFail(1515)->discount_amount);
    }

    private function createPrerequisiteTables(): void
    {
        Schema::create('customer_groups', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->double('percentage');
            $table->boolean('is_active');
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('customer_group_id');
            $table->integer('user_id')->nullable();
            $table->string('name');
            $table->string('company_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone_number');
            $table->string('tax_no')->nullable();
            $table->text('address');
            $table->string('city');
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('country')->nullable();
            $table->double('deposit')->default(0);
            $table->double('expense')->default(0);
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });

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

    private function createSalesTables(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('sale_date')->nullable();
            $table->integer('user_id');
            $table->integer('cash_register_id')->nullable();
            $table->integer('customer_id');
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->integer('item');
            $table->double('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_price');
            $table->double('grand_total');
            $table->double('order_tax_rate')->nullable();
            $table->double('order_tax')->nullable();
            $table->double('order_discount')->nullable();
            $table->integer('coupon_id')->nullable();
            $table->double('coupon_discount')->nullable();
            $table->double('shipping_cost')->nullable();
            $table->integer('sale_status');
            $table->integer('payment_status');
            $table->string('document')->nullable();
            $table->double('paid_amount')->nullable();
            $table->text('sale_note')->nullable();
            $table->text('staff_note')->nullable();
            $table->timestamps();
            $table->string('approval_status')->default('approved');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
        });

        Schema::create('product_sales', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('sale_id');
            $table->date('date')->nullable();
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->double('qty');
            $table->integer('sale_unit_id');
            $table->double('net_unit_price');
            $table->double('discount');
            $table->double('tax_rate');
            $table->double('tax');
            $table->double('total');
            $table->double('unit_cost')->default(0);
            $table->double('total_cost')->default(0);
            $table->timestamps();
        });
    }

    private function createReturnTables(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->increments('id');
            $table->string('account_no');
            $table->string('name');
            $table->double('initial_balance')->nullable();
            $table->double('total_balance');
            $table->text('note')->nullable();
            $table->boolean('is_active');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('returns', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('return_date')->nullable();
            $table->integer('user_id');
            $table->integer('cash_register_id')->nullable();
            $table->integer('customer_id');
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->integer('account_id');
            $table->integer('item');
            $table->double('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_price');
            $table->double('order_tax_rate')->nullable();
            $table->double('order_tax')->nullable();
            $table->double('grand_total');
            $table->string('document')->nullable();
            $table->text('return_note')->nullable();
            $table->text('staff_note')->nullable();
            $table->timestamps();
            $table->string('approval_status')->default('approved');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
        });

        Schema::create('product_returns', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('return_id');
            $table->date('date')->nullable();
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->integer('product_batch_id')->nullable();
            $table->double('qty');
            $table->integer('sale_unit_id');
            $table->double('net_unit_price');
            $table->double('discount');
            $table->double('tax_rate');
            $table->double('tax');
            $table->double('total');
            $table->double('unit_cost')->default(0);
            $table->double('total_cost')->default(0);
            $table->timestamps();
        });
    }

    private function createPaymentTables(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('purchase_id')->nullable();
            $table->integer('sale_id')->nullable();
            $table->integer('sale_return_id')->nullable();
            $table->integer('purchase_return_id')->nullable();
            $table->integer('cash_register_id')->nullable();
            $table->integer('account_id');
            $table->integer('biller_id')->nullable();
            $table->integer('customer_id')->nullable();
            $table->integer('supplier_id')->nullable();
            $table->string('payment_reference');
            $table->integer('user_id');
            $table->string('payment_type')->nullable();
            $table->string('direction')->nullable();
            $table->double('amount');
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->double('change');
            $table->string('paying_method');
            $table->text('payment_note')->nullable();
            $table->timestamps();
            $table->string('approval_status')->default('approved');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
        });

        foreach (['payment_with_cheque', 'payment_with_credit_card', 'payment_with_gift_card', 'payment_with_paypal'] as $table) {
            Schema::create($table, function (Blueprint $table) {
                $table->increments('id');
                $table->integer('payment_id');
            });
        }
    }

    private function seedPrerequisites(): void
    {
        DB::table('customer_groups')->insert([
            'id' => 1,
            'name' => 'General',
            'percentage' => 0,
            'is_active' => true,
        ]);
        DB::table('users')->insert([
            [
                'id' => 10,
                'name' => 'Imported Admin One',
                'email' => 'mdshajibazher@gmail.com',
                'password' => 'password',
            ],
            [
                'id' => 11,
                'name' => 'Inventory Admin',
                'email' => 'admin@example.com',
                'password' => 'password',
            ],
            [
                'id' => 12,
                'name' => 'Imported Admin Three',
                'email' => 'visioncosmetics82@gmail.com',
                'password' => 'password',
            ],
        ]);
        DB::table('warehouses')->insert(['id' => 1, 'name' => 'Warehouse One']);
        DB::table('billers')->insert(['id' => 1, 'name' => 'Biller One']);
        DB::table('units')->insert(['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece']);
        DB::table('accounts')->insert([
            'id' => 1,
            'account_no' => 'LEGACY',
            'name' => 'Legacy Account',
            'total_balance' => 0,
            'is_active' => true,
            'is_default' => true,
        ]);

        $this->seed(LegacyUserToCustomerSeeder::class);
        $this->seed(LegacyProductSeeder::class);

        $this->assertGreaterThan(500, Customer::query()->count());
    }

    /**
     * @return array<string, mixed>
     */
    private function existingSale(): array
    {
        return [
            'id' => 9000,
            'reference_no' => 'REMOVE-ME',
            'sale_date' => '2026-01-01',
            'user_id' => 11,
            'cash_register_id' => null,
            'customer_id' => 1,
            'warehouse_id' => 1,
            'biller_id' => 1,
            'item' => 1,
            'total_qty' => 1,
            'total_discount' => 0,
            'total_tax' => 0,
            'total_price' => 1,
            'grand_total' => 1,
            'order_tax_rate' => 0,
            'order_tax' => 0,
            'order_discount' => 0,
            'coupon_id' => null,
            'coupon_discount' => 0,
            'shipping_cost' => 0,
            'sale_status' => 1,
            'payment_status' => 2,
            'document' => null,
            'paid_amount' => 0,
            'sale_note' => null,
            'staff_note' => null,
            'approval_status' => 'approved',
            'approved_by' => null,
            'approved_at' => null,
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ];
    }
}
