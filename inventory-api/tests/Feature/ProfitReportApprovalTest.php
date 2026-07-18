<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ApprovalService;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Tests\TestCase;

class ProfitReportApprovalTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->integer('biller_id')->nullable();
            $table->integer('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->integer('category_id')->nullable();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('sale_date')->nullable();
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->double('order_discount')->default(0);
            $table->double('coupon_discount')->default(0);
            $table->double('shipping_cost')->default(0);
            $table->double('total_tax')->default(0);
            $table->double('order_tax')->default(0);
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        Schema::create('product_sales', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('sale_id');
            $table->integer('product_id');
            $table->double('qty');
            $table->double('net_unit_price');
            $table->double('discount')->default(0);
            $table->double('total_cost')->default(0);
            $table->timestamps();
        });

        Schema::create('returns', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('return_date')->nullable();
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->double('total_tax')->default(0);
            $table->double('order_tax')->default(0);
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        Schema::create('product_returns', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('return_id');
            $table->integer('product_id');
            $table->double('qty');
            $table->double('net_unit_price');
            $table->double('discount')->default(0);
            $table->double('total_cost')->default(0);
            $table->timestamps();
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        Schema::create('return_purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->date('return_date')->nullable();
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        Schema::create('purchase_product_return', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('return_id');
            $table->integer('product_id');
            $table->double('qty');
            $table->double('total')->default(0);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('sale_id')->nullable();
            $table->integer('purchase_id')->nullable();
            $table->integer('sale_return_id')->nullable();
            $table->integer('purchase_return_id')->nullable();
            $table->integer('biller_id');
            $table->string('payment_type')->nullable();
            $table->string('direction')->nullable();
            $table->double('amount');
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('expense_category_id')->nullable();
            $table->integer('warehouse_id')->nullable();
            $table->integer('biller_id');
            $table->double('amount');
            $table->timestamps();
        });

        Schema::create('expense_categories', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        foreach ([
            'expense_categories',
            'expenses',
            'payments',
            'purchase_product_return',
            'return_purchases',
            'purchases',
            'product_returns',
            'returns',
            'product_sales',
            'sales',
            'categories',
            'products',
            'warehouses',
            'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_profit_report_counts_only_approved_invoices_and_payments(): void
    {
        $this->withoutMiddleware([
            Authenticate::class,
            PermissionMiddleware::class,
        ]);

        $user = User::query()->create([
            'name' => 'Reporter',
            'email' => 'reporter@example.com',
            'password' => 'password',
            'biller_id' => 1,
            'current_biller_id' => 1,
            'biller_ids' => [1],
            'is_active' => true,
            'is_deleted' => false,
        ]);

        DB::table('warehouses')->insert(['id' => 1, 'name' => 'Main']);
        DB::table('products')->insert(['id' => 1, 'name' => 'Widget', 'code' => 'W-1']);

        $approvedSaleId = $this->sale(1, ApprovalService::APPROVED, 5);
        $pendingSaleId = $this->sale(2, ApprovalService::PENDING, 50);
        $approvedReturnId = $this->saleReturn(1, ApprovalService::APPROVED);
        $pendingReturnId = $this->saleReturn(2, ApprovalService::PENDING);
        $approvedPurchaseId = $this->purchase(1, ApprovalService::APPROVED);
        $pendingPurchaseId = $this->purchase(2, ApprovalService::PENDING);
        $approvedPurchaseReturnId = $this->purchaseReturn(1, ApprovalService::APPROVED);
        $pendingPurchaseReturnId = $this->purchaseReturn(2, ApprovalService::PENDING);

        $this->payment(['sale_id' => $approvedSaleId, 'amount' => 70, 'direction' => 'in', 'type' => 'sale_payment', 'status' => ApprovalService::APPROVED]);
        $this->payment(['sale_id' => $approvedSaleId, 'amount' => 700, 'direction' => 'in', 'type' => 'sale_payment', 'status' => ApprovalService::PENDING]);
        $this->payment(['purchase_id' => $approvedPurchaseId, 'amount' => 30, 'direction' => 'out', 'type' => 'purchase_payment', 'status' => ApprovalService::APPROVED]);
        $this->payment(['purchase_id' => $pendingPurchaseId, 'amount' => 300, 'direction' => 'out', 'type' => 'purchase_payment', 'status' => ApprovalService::APPROVED]);
        $this->payment(['sale_return_id' => $approvedReturnId, 'amount' => 10, 'direction' => 'out', 'type' => 'sale_return_refund', 'status' => ApprovalService::APPROVED]);
        $this->payment(['sale_return_id' => $pendingReturnId, 'amount' => 100, 'direction' => 'out', 'type' => 'sale_return_refund', 'status' => ApprovalService::APPROVED]);
        $this->payment(['purchase_return_id' => $approvedPurchaseReturnId, 'amount' => 8, 'direction' => 'in', 'type' => 'purchase_return_refund', 'status' => ApprovalService::APPROVED]);
        $this->payment(['purchase_return_id' => $pendingPurchaseReturnId, 'amount' => 80, 'direction' => 'in', 'type' => 'purchase_return_refund', 'status' => ApprovalService::APPROVED]);

        $response = $this
            ->actingAs($user)
            ->getJson('/api/reports/profit?start_date=2026-01-01&end_date=2026-01-31');

        $response
            ->assertOk()
            ->assertJsonPath('summary.gross_sales', 100)
            ->assertJsonPath('summary.net_revenue', 75)
            ->assertJsonPath('summary.cost_of_goods_sold', 40)
            ->assertJsonPath('summary.returns', 20)
            ->assertJsonPath('summary.return_cost', 8)
            ->assertJsonPath('summary.purchase_return_cost', 6)
            ->assertJsonPath('summary.cash_in', 78)
            ->assertJsonPath('summary.cash_out', 40)
            ->assertJsonPath('summary.net_cash_movement', 38);
    }

    private function sale(int $id, string $status, float $orderDiscount): int
    {
        DB::table('sales')->insert([
            'id' => $id,
            'reference_no' => "S-{$id}",
            'sale_date' => '2026-01-10',
            'warehouse_id' => 1,
            'biller_id' => 1,
            'order_discount' => $orderDiscount,
            'approval_status' => $status,
        ]);

        DB::table('product_sales')->insert([
            'sale_id' => $id,
            'product_id' => 1,
            'qty' => 1,
            'net_unit_price' => $id === 1 ? 100 : 1000,
            'discount' => 0,
            'total_cost' => $id === 1 ? 40 : 400,
        ]);

        return $id;
    }

    private function saleReturn(int $id, string $status): int
    {
        DB::table('returns')->insert([
            'id' => $id,
            'reference_no' => "R-{$id}",
            'return_date' => '2026-01-11',
            'warehouse_id' => 1,
            'biller_id' => 1,
            'approval_status' => $status,
        ]);

        DB::table('product_returns')->insert([
            'return_id' => $id,
            'product_id' => 1,
            'qty' => 1,
            'net_unit_price' => $id === 1 ? 20 : 200,
            'discount' => 0,
            'total_cost' => $id === 1 ? 8 : 80,
        ]);

        return $id;
    }

    private function purchase(int $id, string $status): int
    {
        DB::table('purchases')->insert([
            'id' => $id,
            'warehouse_id' => 1,
            'biller_id' => 1,
            'approval_status' => $status,
        ]);

        return $id;
    }

    private function purchaseReturn(int $id, string $status): int
    {
        DB::table('return_purchases')->insert([
            'id' => $id,
            'return_date' => '2026-01-12',
            'warehouse_id' => 1,
            'biller_id' => 1,
            'approval_status' => $status,
        ]);

        DB::table('purchase_product_return')->insert([
            'return_id' => $id,
            'product_id' => 1,
            'qty' => 1,
            'total' => $id === 1 ? 6 : 60,
        ]);

        return $id;
    }

    private function payment(array $data): void
    {
        DB::table('payments')->insert([
            'sale_id' => $data['sale_id'] ?? null,
            'purchase_id' => $data['purchase_id'] ?? null,
            'sale_return_id' => $data['sale_return_id'] ?? null,
            'purchase_return_id' => $data['purchase_return_id'] ?? null,
            'biller_id' => 1,
            'payment_type' => $data['type'],
            'direction' => $data['direction'],
            'amount' => $data['amount'],
            'approval_status' => $data['status'],
            'created_at' => '2026-01-13 10:00:00',
            'updated_at' => '2026-01-13 10:00:00',
        ]);
    }
}
