<?php

namespace Tests\Feature;

use App\Http\Requests\StorePurchaseRequest;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\MessageBag;
use Tests\TestCase;

class PurchasePartialReceivedValidationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
        });
        Schema::create('suppliers', function (Blueprint $table) {
            $table->increments('id');
            $table->boolean('is_active');
        });
        Schema::create('warehouses', function (Blueprint $table) {
            $table->increments('id');
            $table->boolean('is_active');
        });
        Schema::create('purchase_statuses', function (Blueprint $table) {
            $table->increments('id');
        });
        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->boolean('is_active');
            $table->boolean('is_batch')->default(false);
            $table->boolean('is_variant')->default(false);
        });
        Schema::create('variants', function (Blueprint $table) {
            $table->increments('id');
        });

        DB::table('suppliers')->insert(['id' => 1, 'is_active' => true]);
        DB::table('warehouses')->insert(['id' => 1, 'is_active' => true]);
        DB::table('purchase_statuses')->insert(['id' => 2]);
        DB::table('products')->insert([
            ['id' => 1, 'is_active' => true, 'is_batch' => false, 'is_variant' => false],
            ['id' => 2, 'is_active' => true, 'is_batch' => false, 'is_variant' => false],
        ]);
    }

    protected function tearDown(): void
    {
        foreach (['variants', 'products', 'purchase_statuses', 'warehouses', 'suppliers', 'purchases'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_partial_purchase_accepts_mixed_incomplete_and_fully_received_lines(): void
    {
        $this->assertTrue($this->errorsFor([5, 10])->isEmpty());
    }

    public function test_partial_purchase_rejects_no_received_quantity(): void
    {
        $errors = $this->errorsFor([0, 0]);

        $this->assertSame(
            'For partial purchases, at least one line must have a received quantity greater than zero.',
            $errors->first('received')
        );
    }

    public function test_partial_purchase_rejects_every_line_fully_received(): void
    {
        $errors = $this->errorsFor([10, 10]);

        $this->assertSame(
            'For partial purchases, at least one line must have a received quantity less than ordered quantity.',
            $errors->first('received')
        );
    }

    public function test_partial_purchase_identifies_a_line_received_above_ordered_quantity(): void
    {
        $errors = $this->errorsFor([11, 5]);

        $this->assertSame(
            'Line 1 received quantity cannot exceed ordered quantity.',
            $errors->first('received.0')
        );
    }

    private function errorsFor(array $received): MessageBag
    {
        $request = StorePurchaseRequest::create('/api/purchase-invoices', 'POST', [
            'reference_no' => 'purchase-partial-test',
            'supplier_id' => 1,
            'warehouse_id' => 1,
            'status' => 2,
            'purchase_status_id' => 2,
            'payment_status' => 1,
            'product_id' => [1, 2],
            'product_code' => ['P-1', 'P-2'],
            'variant_id' => [null, null],
            'qty' => [10, 10],
            'received' => $received,
            'batch_no' => [null, null],
            'expired_date' => [null, null],
            'purchase_unit' => [1, 1],
            'net_unit_cost' => [100, 100],
            'discount' => [0, 0],
            'tax_rate' => [0, 0],
            'tax' => [0, 0],
            'subtotal' => [1000, 1000],
        ]);
        $request->setContainer($this->app);
        $validator = Validator::make($request->all(), $request->rules());
        $request->withValidator($validator);
        $validator->passes();

        return $validator->errors();
    }
}
