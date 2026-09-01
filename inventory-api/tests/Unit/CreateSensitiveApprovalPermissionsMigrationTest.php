<?php

namespace Tests\Unit;

use App\Models\GeneralSetting;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class CreateSensitiveApprovalPermissionsMigrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    protected function tearDown(): void
    {
        foreach ([
            'role_has_permissions',
            'model_has_permissions',
            'model_has_roles',
            'general_settings',
            'roles',
            'permissions',
            'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_it_backfills_each_legacy_approver_as_a_direct_sensitive_permission_without_changing_legacy_values(): void
    {
        $admin = Role::create(['name' => 'Admin', 'guard_name' => 'web', 'is_active' => true]);
        $salesApprover = $this->user('Sales Approver', 'sales@example.com');
        $returnApprover = $this->user('Return Approver', 'returns@example.com');
        $purchaseApprover = $this->user('Purchase Approver', 'purchases@example.com');
        $paymentApprover = $this->user('Payment Approver', 'payments@example.com');
        $unrelatedUser = $this->user('Unrelated User', 'unrelated@example.com');

        DB::table('permissions')->insert([
            'name' => 'products-index',
            'guard_name' => 'web',
        ]);
        $salesApprover->givePermissionTo('products-index');

        $settings = GeneralSetting::create([
            'sales_invoice_approver_ids' => [$salesApprover->id, $salesApprover->id],
            'return_invoice_approver_ids' => [$returnApprover->id],
            'purchase_invoice_approver_ids' => [$purchaseApprover->id],
            'payment_approver_ids' => [$paymentApprover->id, $paymentApprover->id],
        ]);

        $migration = require database_path('migrations/2026_09_01_000001_create_sensitive_approval_permissions.php');

        $migration->up();
        $migration->up();

        $this->assertSame([
            'approvals-payments',
            'approvals-purchase-invoice',
            'approvals-purchase-return-invoice',
            'approvals-sales-invoice',
            'approvals-sales-return-invoice',
            'super-user',
        ], DB::table('permissions')
            ->whereIn('name', [
                'super-user',
                'approvals-sales-invoice',
                'approvals-sales-return-invoice',
                'approvals-purchase-invoice',
                'approvals-purchase-return-invoice',
                'approvals-payments',
            ])
            ->orderBy('name')
            ->pluck('name')
            ->all());
        $this->assertSame(['super-user'], $this->rolePermissionNames($admin));
        $this->assertSame(['approvals-sales-invoice', 'products-index'], $this->directPermissionNames($salesApprover));
        $this->assertSame(['approvals-sales-return-invoice'], $this->directPermissionNames($returnApprover));
        $this->assertSame([
            'approvals-purchase-invoice',
            'approvals-purchase-return-invoice',
        ], $this->directPermissionNames($purchaseApprover));
        $this->assertSame(['approvals-payments'], $this->directPermissionNames($paymentApprover));
        $this->assertSame([], $this->directPermissionNames($unrelatedUser));
        $this->assertSame(6, DB::table('model_has_permissions')->count());

        $settings->refresh();
        $this->assertSame([$salesApprover->id, $salesApprover->id], $settings->sales_invoice_approver_ids);
        $this->assertSame([$returnApprover->id], $settings->return_invoice_approver_ids);
        $this->assertSame([$purchaseApprover->id], $settings->purchase_invoice_approver_ids);
        $this->assertSame([$paymentApprover->id, $paymentApprover->id], $settings->payment_approver_ids);
    }

    public function test_it_removes_only_sensitive_backfill_data_when_rolled_back(): void
    {
        $admin = Role::create(['name' => 'Admin', 'guard_name' => 'web', 'is_active' => true]);
        $salesApprover = $this->user('Sales Approver', 'sales@example.com');
        $settings = GeneralSetting::create([
            'sales_invoice_approver_ids' => [$salesApprover->id],
            'return_invoice_approver_ids' => [],
            'purchase_invoice_approver_ids' => [],
            'payment_approver_ids' => [],
        ]);
        DB::table('permissions')->insert([
            'name' => 'products-index',
            'guard_name' => 'web',
        ]);
        $salesApprover->givePermissionTo('products-index');

        $migration = require database_path('migrations/2026_09_01_000001_create_sensitive_approval_permissions.php');
        $migration->up();
        $migration->down();

        $this->assertSame(['products-index'], DB::table('permissions')->orderBy('name')->pluck('name')->all());
        $this->assertSame([], $this->rolePermissionNames($admin));
        $this->assertSame(['products-index'], $this->directPermissionNames($salesApprover));
        $this->assertSame(1, DB::table('model_has_permissions')->where('model_id', $salesApprover->id)->where('model_type', User::class)->count());

        $settings->refresh();
        $this->assertSame([$salesApprover->id], $settings->sales_invoice_approver_ids);
        $this->assertSame([], $settings->return_invoice_approver_ids);
        $this->assertSame([], $settings->purchase_invoice_approver_ids);
        $this->assertSame([], $settings->payment_approver_ids);
    }

    public function test_it_backfills_only_the_latest_general_settings_row(): void
    {
        $obsoleteApprover = $this->user('Obsolete Approver', 'obsolete@example.com');
        $currentApprover = $this->user('Current Approver', 'current@example.com');

        GeneralSetting::create([
            'sales_invoice_approver_ids' => [$obsoleteApprover->id],
            'return_invoice_approver_ids' => [],
            'purchase_invoice_approver_ids' => [],
            'payment_approver_ids' => [],
        ]);
        GeneralSetting::create([
            'sales_invoice_approver_ids' => [],
            'return_invoice_approver_ids' => [],
            'purchase_invoice_approver_ids' => [],
            'payment_approver_ids' => [$currentApprover->id],
        ]);

        $migration = require database_path('migrations/2026_09_01_000001_create_sensitive_approval_permissions.php');
        $migration->up();

        $this->assertSame([], $this->directPermissionNames($obsoleteApprover));
        $this->assertSame(['approvals-payments'], $this->directPermissionNames($currentApprover));
    }

    private function user(string $name, string $email): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => 'password',
            'is_active' => true,
            'is_deleted' => false,
        ]);
    }

    private function directPermissionNames(User $user): array
    {
        return DB::table('model_has_permissions')
            ->join('permissions', 'permissions.id', '=', 'model_has_permissions.permission_id')
            ->where('model_has_permissions.model_id', $user->id)
            ->where('model_has_permissions.model_type', User::class)
            ->orderBy('permissions.name')
            ->pluck('permissions.name')
            ->all();
    }

    private function rolePermissionNames(Role $role): array
    {
        return DB::table('role_has_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_has_permissions.permission_id')
            ->where('role_has_permissions.role_id', $role->id)
            ->orderBy('permissions.name')
            ->pluck('permissions.name')
            ->all();
    }

    private function createTables(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('permissions', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->unique(['name', 'guard_name']);
            $table->timestamps();
        });
        Schema::create('roles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->boolean('is_active')->default(true);
            $table->unique(['name', 'guard_name']);
            $table->timestamps();
        });
        Schema::create('model_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('model_id');
            $table->string('model_type');
            $table->primary(['permission_id', 'model_id', 'model_type']);
        });
        Schema::create('model_has_roles', function (Blueprint $table) {
            $table->unsignedInteger('role_id');
            $table->unsignedInteger('model_id');
            $table->string('model_type');
            $table->primary(['role_id', 'model_id', 'model_type']);
        });
        Schema::create('role_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('general_settings', function (Blueprint $table) {
            $table->increments('id');
            $table->json('sales_invoice_approver_ids')->nullable();
            $table->json('return_invoice_approver_ids')->nullable();
            $table->json('purchase_invoice_approver_ids')->nullable();
            $table->json('payment_approver_ids')->nullable();
            $table->timestamps();
        });
    }
}
