<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Sale;
use App\Services\ApprovalService;
use App\Services\PaymentService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PaymentDiscountServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('payments');
        Schema::dropIfExists('sales');

        Schema::create('sales', function (Blueprint $table) {
            $table->increments('id');
            $table->double('grand_total');
            $table->double('paid_amount')->default(0);
            $table->integer('payment_status')->default(2);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('sale_id')->nullable();
            $table->string('payment_type');
            $table->string('direction');
            $table->double('amount');
            $table->double('discount_amount')->default(0);
            $table->string('approval_status');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sales');
        parent::tearDown();
    }

    public function test_approved_cash_and_discount_settle_the_sales_invoice(): void
    {
        $saleId = DB::table('sales')->insertGetId([
            'grand_total' => 100,
            'paid_amount' => 0,
            'payment_status' => 2,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('payments')->insert([
            'sale_id' => $saleId,
            'payment_type' => Payment::TYPE_SALE_PAYMENT,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 80,
            'discount_amount' => 20,
            'approval_status' => ApprovalService::APPROVED,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sale::withoutEvents(fn () => app(PaymentService::class)->recalculateSale($saleId));

        $sale = DB::table('sales')->find($saleId);
        $this->assertSame(100.0, (float) $sale->paid_amount);
        $this->assertSame(4, (int) $sale->payment_status);
    }

    public function test_approval_rejects_a_settlement_above_the_remaining_due(): void
    {
        $saleId = DB::table('sales')->insertGetId([
            'grand_total' => 100,
            'paid_amount' => 90,
            'payment_status' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('payments')->insert([
            'sale_id' => $saleId,
            'payment_type' => Payment::TYPE_SALE_PAYMENT,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 90,
            'discount_amount' => 0,
            'approval_status' => ApprovalService::APPROVED,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $pending = new Payment([
            'sale_id' => $saleId,
            'payment_type' => Payment::TYPE_SALE_PAYMENT,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 8,
            'discount_amount' => 3,
        ]);

        $this->expectException(ValidationException::class);
        app(PaymentService::class)->validatePaymentForApproval($pending);
    }

    public function test_customer_advance_discount_cannot_exceed_the_cash_amount(): void
    {
        $advance = new Payment([
            'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 100,
            'discount_amount' => 101,
        ]);

        $this->expectException(ValidationException::class);
        app(PaymentService::class)->validatePaymentForApproval($advance);
    }
}
