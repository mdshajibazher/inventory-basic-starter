<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class DashboardPendingApprovalsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createAuthAndPaymentTables();
        foreach (['sales', 'returns', 'purchases', 'return_purchases'] as $name) {
            Schema::create($name, function (Blueprint $table): void {
                $table->id();
                $table->string('reference_no');
                $table->integer('biller_id');
                foreach (['customer_id', 'supplier_id', 'warehouse_id', 'status'] as $column) {
                    $table->integer($column)->nullable();
                }
                $table->double('grand_total')->default(100);
                $table->double('paid_amount')->default(0);
                $table->string('approval_status');
                $table->timestamps();
            });
        }
        Schema::create('billers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('company_name');
        });
        Schema::create('accounts', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('account_no');
        });
        DB::table('billers')->insert(['id' => 1, 'name' => 'Main branch', 'company_name' => 'Test']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    #[DataProvider('approvalTypes')]
    public function test_pending_lists_are_paginated_scoped_and_ignore_conflicting_filters(string $type, string $table, string $module, string $approval): void
    {
        $user = $this->userWithPermissions([$module, $approval]);
        $ids = [];
        for ($i = 0; $i < 12; $i++) {
            $ids[] = $this->record($table);
        }
        $this->record($table, 'approved');
        $this->record($table, 'pending', 2);

        $this->actingAs($user)->getJson('/api/dashboard/pending-approvals/'.$type.'?approval_status=approved&approved_only=1&outstanding_only=1&payment_type=invalid&payment_types=invalid&customer_id=999&supplier_id=999&search=missing')
            ->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 12)
            ->assertJsonPath('meta.per_page', 10)->assertJsonPath('data.0.id', $ids[11])
            ->assertJsonPath('data.0.approval_status', 'pending')->assertJsonPath('data.0.can_approve', true);
        $response = $this->getJson('/api/dashboard/pending-approvals/'.$type.'?page=2&per_page=5')
            ->assertOk()->assertJsonCount(5, 'data')->assertJsonPath('meta.current_page', 2)->assertJsonPath('meta.total', 12);
        $this->assertSame(array_reverse(array_slice($ids, 2, 5)), array_column($response->json('data'), 'id'));
    }

    public function test_all_six_payment_types_are_combined(): void
    {
        $this->actingAs($this->userWithPermissions(['accounts-index', SensitivePermissionCatalog::APPROVAL_PAYMENTS]));
        $types = [Payment::TYPE_SALE_PAYMENT, Payment::TYPE_CUSTOMER_ADVANCE, Payment::TYPE_PURCHASE_PAYMENT,
            Payment::TYPE_SUPPLIER_ADVANCE, Payment::TYPE_SALE_RETURN_REFUND, Payment::TYPE_PURCHASE_RETURN_REFUND];
        foreach ($types as $type) {
            $this->record('payments', paymentType: $type);
        }
        $response = $this->getJson('/api/dashboard/pending-approvals/payments?payment_type=sale_payment&direction=out')->assertOk()->assertJsonCount(6, 'data');
        $this->assertEqualsCanonicalizing($types, array_column($response->json('data'), 'payment_type'));
    }

    #[DataProvider('approvalTypes')]
    public function test_approval_and_module_permissions_are_both_required(string $type, string $table, string $module, string $approval): void
    {
        foreach ([[], [$module], [$approval], [SensitivePermissionCatalog::SUPER_USER], [$module, SensitivePermissionCatalog::SUPER_USER]] as $permissions) {
            $this->actingAs($this->userWithPermissions($permissions))->getJson('/api/dashboard/pending-approvals/'.$type)->assertForbidden();
        }
    }

    public function test_active_roles_grant_access_but_inactive_roles_do_not(): void
    {
        $user = $this->userWithPermissions(['sales-index']);
        $role = Role::create(['name' => 'Approver', 'guard_name' => 'web', 'is_active' => true]);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $user->assignRole($role);
        $this->actingAs($user)->getJson('/api/dashboard/pending-approvals/sales')->assertOk();
        $role->update(['is_active' => false]);
        $this->actingAs($user->fresh())->getJson('/api/dashboard/pending-approvals/sales')->assertForbidden();
    }

    public function test_returns_show_approver_can_use_dashboard_without_access_to_ordinary_index(): void
    {
        $this->actingAs($this->userWithPermissions(['returns-show', SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE]));
        $this->getJson('/api/dashboard/pending-approvals/returns')->assertOk();
        $this->getJson('/api/return-invoices')->assertForbidden();
    }

    public function test_authentication_active_user_and_type_validation_are_enforced(): void
    {
        $this->getJson('/api/dashboard/pending-approvals/sales')->assertUnauthorized();
        $user = $this->userWithPermissions(['sales-index', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE]);
        $this->actingAs($user)->getJson('/api/dashboard/pending-approvals/unknown')->assertNotFound();
        $user->update(['is_active' => false]);
        $this->actingAs($user)->getJson('/api/dashboard/pending-approvals/sales')->assertUnauthorized();
    }

    public function test_pagination_input_is_validated(): void
    {
        $this->actingAs($this->userWithPermissions(['sales-index', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE]));
        $this->getJson('/api/dashboard/pending-approvals/sales?page=0&per_page=101')->assertUnprocessable()->assertJsonValidationErrors(['page', 'per_page']);
    }

    public function test_normal_payment_index_has_optional_validated_approval_filter(): void
    {
        $this->actingAs($this->userWithPermissions(['accounts-index']));
        $this->record('payments');
        $approved = $this->record('payments', 'approved');
        $this->getJson('/api/payments')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/payments?approval_status=pending')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.approval_status', 'pending');
        $this->getJson('/api/payments?approval_status=approved')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $approved);
        $this->getJson('/api/payments?approval_status=invalid')->assertUnprocessable()->assertJsonValidationErrors('approval_status');
    }

    public static function approvalTypes(): array
    {
        return [
            ['sales', 'sales', 'sales-index', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE],
            ['returns', 'returns', 'returns-show', SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE],
            ['purchases', 'purchases', 'purchases-edit', SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE],
            ['purchase_returns', 'return_purchases', 'purchases-index', SensitivePermissionCatalog::APPROVAL_PURCHASE_RETURN_INVOICE],
            ['payments', 'payments', 'accounts-index', SensitivePermissionCatalog::APPROVAL_PAYMENTS],
        ];
    }

    private function userWithPermissions(array $permissions): User
    {
        $user = User::factory()->create(['phone' => '01700000000', 'biller_id' => 1, 'current_biller_id' => 1, 'biller_ids' => [1], 'is_active' => true, 'is_deleted' => false]);
        foreach ($permissions as $permission) {
            $user->givePermissionTo($this->permission($permission));
        }

        return $user;
    }

    private function permission(string $name): Permission
    {
        return Permission::findOrCreate($name, 'web');
    }

    private function record(string $table, string $status = 'pending', int $billerId = 1, string $paymentType = Payment::TYPE_SALE_PAYMENT): int
    {
        $data = ['biller_id' => $billerId, 'approval_status' => $status, 'created_at' => '2026-09-12 10:00:00', 'updated_at' => '2026-09-12 10:00:00'];
        if ($table === 'payments') {
            $data += ['user_id' => 1, 'account_id' => 1, 'payment_reference' => 'PAY', 'payment_type' => $paymentType, 'direction' => 'in', 'amount' => 100, 'paying_method' => 'Cash'];
        } else {
            $data['reference_no'] = 'INV';
        }

        return DB::table($table)->insertGetId($data);
    }

    private function createAuthAndPaymentTables(): void
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
