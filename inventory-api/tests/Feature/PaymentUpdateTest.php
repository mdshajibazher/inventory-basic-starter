<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ApprovalService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PaymentUpdateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    protected function tearDown(): void
    {
        foreach (['model_has_roles', 'model_has_permissions', 'role_has_permissions', 'roles', 'permissions', 'general_settings', 'payments', 'accounts', 'suppliers', 'customers', 'billers', 'users'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_account_editor_can_update_a_pending_customer_payment(): void
    {
        [$user, $customer, $account, $payment] = $this->customerPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'accounts-edit', 'guard_name' => 'web']));
        $this->assertSame((int) $payment->biller_id, $user->requireCurrentBillerId());

        $response = $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'customer_id' => $customer->id,
                'supplier_id' => null,
                'sale_id' => null,
                'purchase_id' => null,
                'sale_return_id' => null,
                'purchase_return_id' => null,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
                'direction' => Payment::DIRECTION_IN,
                'amount' => 175.50,
                'discount_amount' => 5.50,
                'change' => 0,
                'paying_method' => 'Bank Transfer',
                'payment_reference' => 'CAP-EDITED',
                'payment_note' => 'Updated pending advance',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.amount', 175.5)
            ->assertJsonPath('data.payment_reference', 'CAP-EDITED')
            ->assertJsonPath('data.can_edit', true);

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'amount' => 175.5,
            'discount_amount' => 5.5,
            'paying_method' => 'Bank Transfer',
            'payment_note' => 'Updated pending advance',
            'approval_status' => ApprovalService::PENDING,
            'user_id' => $user->id,
        ]);
    }

    public function test_approved_payment_cannot_be_updated(): void
    {
        [$user, $customer, $account, $payment] = $this->customerPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'accounts-edit', 'guard_name' => 'web']));
        $user->givePermissionTo(Permission::create(['name' => 'accounts-index', 'guard_name' => 'web']));
        $payment->forceFill(['approval_status' => ApprovalService::APPROVED])->save();

        $this->actingAs($user)
            ->getJson("/api/payments/{$payment->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', false);

        $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'customer_id' => $customer->id,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
                'direction' => Payment::DIRECTION_IN,
                'amount' => 250,
                'discount_amount' => 0,
                'change' => 0,
                'paying_method' => 'Cash',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payment');

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'amount' => 100,
            'approval_status' => ApprovalService::APPROVED,
        ]);
    }

    public function test_payment_from_another_branch_cannot_be_updated(): void
    {
        [$user, $customer, $account, $payment] = $this->customerPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'accounts-edit', 'guard_name' => 'web']));
        $otherBillerId = DB::table('billers')->insertGetId([
            'name' => 'Other Branch',
            'company_name' => 'Inventory',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $user->forceFill([
            'biller_id' => $otherBillerId,
            'current_biller_id' => $otherBillerId,
            'biller_ids' => [$otherBillerId],
        ])->save();

        $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'customer_id' => $customer->id,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
                'direction' => Payment::DIRECTION_IN,
                'amount' => 250,
                'discount_amount' => 0,
                'change' => 0,
                'paying_method' => 'Cash',
            ])
            ->assertNotFound();

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'amount' => 100,
        ]);
    }

    public function test_sales_editor_cannot_update_a_supplier_payment(): void
    {
        [$user, $supplier, $account, $payment] = $this->supplierPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'sales-edit', 'guard_name' => 'web']));

        $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'supplier_id' => $supplier->id,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_SUPPLIER_ADVANCE,
                'direction' => Payment::DIRECTION_OUT,
                'amount' => 250,
                'discount_amount' => 0,
                'change' => 0,
                'paying_method' => 'Cash',
            ])
            ->assertForbidden();

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'amount' => 100,
        ]);
    }

    public function test_customer_payment_cannot_be_changed_to_a_supplier_payment(): void
    {
        [$user, , $account, $payment] = $this->customerPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'accounts-edit', 'guard_name' => 'web']));
        $supplier = Supplier::create([
            'name' => 'Supplier One',
            'phone_number' => '01700000000',
            'is_active' => true,
        ]);

        $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'customer_id' => null,
                'supplier_id' => $supplier->id,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_SUPPLIER_ADVANCE,
                'direction' => Payment::DIRECTION_OUT,
                'amount' => 250,
                'discount_amount' => 0,
                'change' => 0,
                'paying_method' => 'Cash',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payment_type');

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'customer_id' => $payment->customer_id,
            'supplier_id' => null,
            'amount' => 100,
        ]);
    }

    public function test_purchase_editor_can_update_a_pending_supplier_payment(): void
    {
        [$user, $supplier, $account, $payment] = $this->supplierPaymentFixture();
        $user->givePermissionTo(Permission::create(['name' => 'purchases-edit', 'guard_name' => 'web']));

        $this->actingAs($user)
            ->putJson("/api/payments/{$payment->id}", [
                'supplier_id' => $supplier->id,
                'account_id' => $account->id,
                'payment_type' => Payment::TYPE_SUPPLIER_ADVANCE,
                'direction' => Payment::DIRECTION_OUT,
                'amount' => 225,
                'discount_amount' => 0,
                'change' => 0,
                'paying_method' => 'Cheque',
                'payment_reference' => 'SAP-EDITED',
            ])
            ->assertOk()
            ->assertJsonPath('data.amount', 225)
            ->assertJsonPath('data.can_edit', true);

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'supplier_id' => $supplier->id,
            'amount' => 225,
            'paying_method' => 'Cheque',
        ]);
    }

    private function customerPaymentFixture(): array
    {
        $billerId = DB::table('billers')->insertGetId([
            'name' => 'Main Branch',
            'company_name' => 'Inventory',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $user = User::factory()->create([
            'biller_id' => $billerId,
            'current_biller_id' => $billerId,
            'biller_ids' => [$billerId],
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $customer = Customer::create([
            'name' => 'Customer One',
            'phone_number' => '01700000000',
            'is_active' => true,
        ]);
        $account = Account::create([
            'account_no' => 'CASH-1',
            'name' => 'Cash',
            'total_balance' => 0,
            'is_active' => true,
        ]);
        $payment = Payment::create([
            'user_id' => $user->id,
            'biller_id' => $billerId,
            'account_id' => $account->id,
            'customer_id' => $customer->id,
            'payment_reference' => 'CAP-OLD',
            'payment_type' => Payment::TYPE_CUSTOMER_ADVANCE,
            'direction' => Payment::DIRECTION_IN,
            'amount' => 100,
            'discount_amount' => 0,
            'change' => 0,
            'paying_method' => 'Cash',
            'approval_status' => ApprovalService::PENDING,
        ]);

        return [$user, $customer, $account, $payment];
    }

    private function supplierPaymentFixture(): array
    {
        $billerId = DB::table('billers')->insertGetId([
            'name' => 'Main Branch',
            'company_name' => 'Inventory',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $user = User::factory()->create([
            'biller_id' => $billerId,
            'current_biller_id' => $billerId,
            'biller_ids' => [$billerId],
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $supplier = Supplier::create([
            'name' => 'Supplier One',
            'phone_number' => '01700000000',
            'is_active' => true,
        ]);
        $account = Account::create([
            'account_no' => 'CASH-1',
            'name' => 'Cash',
            'total_balance' => 0,
            'is_active' => true,
        ]);
        $payment = Payment::create([
            'user_id' => $user->id,
            'biller_id' => $billerId,
            'account_id' => $account->id,
            'supplier_id' => $supplier->id,
            'payment_reference' => 'SAP-OLD',
            'payment_type' => Payment::TYPE_SUPPLIER_ADVANCE,
            'direction' => Payment::DIRECTION_OUT,
            'amount' => 100,
            'discount_amount' => 0,
            'change' => 0,
            'paying_method' => 'Cash',
            'approval_status' => ApprovalService::PENDING,
        ]);

        return [$user, $supplier, $account, $payment];
    }

    private function createTables(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->integer('biller_id')->nullable();
            $table->integer('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('billers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('company_name');
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone_number');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone_number');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('accounts', function (Blueprint $table) {
            $table->increments('id');
            $table->string('account_no');
            $table->string('name');
            $table->double('total_balance')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('general_settings', function (Blueprint $table) {
            $table->increments('id');
            $table->json('payment_approver_ids')->nullable();
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('user_id');
            $table->integer('biller_id');
            $table->integer('account_id');
            $table->integer('customer_id')->nullable();
            $table->integer('supplier_id')->nullable();
            $table->integer('sale_id')->nullable();
            $table->integer('purchase_id')->nullable();
            $table->integer('sale_return_id')->nullable();
            $table->integer('purchase_return_id')->nullable();
            $table->integer('cash_register_id')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_type');
            $table->string('direction');
            $table->double('amount');
            $table->double('discount_amount')->default(0);
            $table->double('change')->default(0);
            $table->string('paying_method');
            $table->text('payment_note')->nullable();
            $table->string('approval_status');
            $table->integer('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });

        Schema::create('role_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });

        Schema::create('model_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['permission_id', 'model_id', 'model_type']);
        });

        Schema::create('model_has_roles', function (Blueprint $table) {
            $table->unsignedInteger('role_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['role_id', 'model_id', 'model_type']);
        });
    }
}
