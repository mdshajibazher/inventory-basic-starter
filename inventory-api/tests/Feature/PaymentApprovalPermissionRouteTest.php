<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Permission;
use App\Models\User;
use App\Services\ApprovalService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PaymentApprovalPermissionRouteTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    protected function tearDown(): void
    {
        foreach (['payments', 'model_has_roles', 'model_has_permissions', 'role_has_permissions', 'permissions', 'roles', 'users'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    #[DataProvider('paymentTypesAndLinkages')]
    public function test_every_payment_type_and_linkage_requires_approvals_payments(
        string $paymentType,
        string $direction,
        string $linkage,
    ): void {
        $user = User::factory()->create([
            'phone' => '01700000000',
            'biller_id' => 1,
            'current_biller_id' => 1,
            'biller_ids' => [1],
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $user->givePermissionTo(Permission::create(['name' => 'accounts-index', 'guard_name' => 'web']));
        $payment = Payment::create([
            'user_id' => $user->id,
            'biller_id' => 1,
            'account_id' => 1,
            'payment_reference' => 'PAY-1',
            'payment_type' => $paymentType,
            'direction' => $direction,
            'amount' => 100,
            'change' => 0,
            'paying_method' => 'Cash',
            'approval_status' => ApprovalService::PENDING,
            $linkage => 99,
        ]);

        $this->actingAs($user)
            ->postJson("/api/payments/{$payment->id}/approve")
            ->assertForbidden();

        $this->assertSame(ApprovalService::PENDING, $payment->fresh()->approval_status);
    }

    public static function paymentTypesAndLinkages(): array
    {
        return [
            'sale payment' => [Payment::TYPE_SALE_PAYMENT, Payment::DIRECTION_IN, 'sale_id'],
            'customer advance' => [Payment::TYPE_CUSTOMER_ADVANCE, Payment::DIRECTION_IN, 'customer_id'],
            'purchase payment' => [Payment::TYPE_PURCHASE_PAYMENT, Payment::DIRECTION_OUT, 'purchase_id'],
            'supplier advance' => [Payment::TYPE_SUPPLIER_ADVANCE, Payment::DIRECTION_OUT, 'supplier_id'],
            'sale return refund' => [Payment::TYPE_SALE_RETURN_REFUND, Payment::DIRECTION_OUT, 'sale_return_id'],
            'purchase return refund' => [Payment::TYPE_PURCHASE_RETURN_REFUND, Payment::DIRECTION_IN, 'purchase_return_id'],
        ];
    }

    private function createTables(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable();
            $table->rememberToken();
            $table->string('phone')->nullable();
            $table->unsignedInteger('biller_id')->nullable();
            $table->unsignedInteger('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('role_has_permissions', function (Blueprint $table): void {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('model_has_permissions', function (Blueprint $table): void {
            $table->unsignedInteger('permission_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['permission_id', 'model_id', 'model_type']);
        });
        Schema::create('model_has_roles', function (Blueprint $table): void {
            $table->unsignedInteger('role_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['role_id', 'model_id', 'model_type']);
        });
        Schema::create('payments', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('biller_id')->nullable();
            $table->unsignedInteger('account_id');
            $table->unsignedInteger('customer_id')->nullable();
            $table->unsignedInteger('supplier_id')->nullable();
            $table->unsignedInteger('sale_id')->nullable();
            $table->unsignedInteger('purchase_id')->nullable();
            $table->unsignedInteger('sale_return_id')->nullable();
            $table->unsignedInteger('purchase_return_id')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_type');
            $table->string('direction');
            $table->double('amount');
            $table->double('discount_amount')->default(0);
            $table->double('change')->default(0);
            $table->string('paying_method');
            $table->text('payment_note')->nullable();
            $table->string('approval_status');
            $table->unsignedInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }
}
