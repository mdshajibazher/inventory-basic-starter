<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\ApprovalService;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;
use Throwable;

class ApprovalPermissionAuthorizationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable();
            $table->string('phone')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->boolean('is_active')->default(true);
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
        Schema::create('general_settings', function (Blueprint $table): void {
            $table->id();
            $table->json('sales_invoice_approver_ids')->nullable();
            $table->json('return_invoice_approver_ids')->nullable();
            $table->json('purchase_invoice_approver_ids')->nullable();
            $table->json('payment_approver_ids')->nullable();
            $table->timestamps();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    protected function tearDown(): void
    {
        foreach (['general_settings', 'model_has_roles', 'model_has_permissions', 'role_has_permissions', 'roles', 'permissions', 'users'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    #[DataProvider('approvalTypes')]
    public function test_matching_direct_module_and_approval_permissions_allow_each_approval_type(
        string $type,
        string $modulePermission,
        string $approvalPermission,
    ): void {
        $user = $this->user();
        $this->grantDirectly($user, [$modulePermission, $approvalPermission]);

        $this->assertTrue(app(ApprovalService::class)->canApprove($user, $type));
    }

    public function test_an_active_role_can_supply_the_matching_approval_permission(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, ['sales-index']);
        $role = $this->role('Sales approver');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $user->assignRole($role);

        $this->assertTrue(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_an_inactive_role_does_not_supply_a_sensitive_approval_permission(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, ['sales-index']);
        $role = $this->role('Inactive approver', false);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $user->assignRole($role);

        $this->assertFalse(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_module_permission_without_the_exact_approval_permission_is_denied(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, ['sales-index']);

        $this->assertFalse(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_approval_permission_without_ordinary_module_access_is_denied(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, [SensitivePermissionCatalog::APPROVAL_SALES_INVOICE]);

        $this->assertFalse(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_a_different_approval_permission_is_denied(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, [
            'sales-index',
            SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE,
        ]);

        $this->assertFalse(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_super_user_does_not_imply_transaction_approval_authority(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, ['sales-index', SensitivePermissionCatalog::SUPER_USER]);

        $this->assertFalse(app(ApprovalService::class)->canApprove($user, 'sales'));
    }

    public function test_service_defense_in_depth_uses_a_standard_403_denial(): void
    {
        $user = $this->user();
        $this->grantDirectly($user, ['sales-index']);

        try {
            app(ApprovalService::class)->assertCanApprove($user, 'sales');
            $this->fail('ApprovalService accepted a user without the exact approval permission.');
        } catch (Throwable $exception) {
            $this->assertInstanceOf(HttpException::class, $exception);
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    #[DataProvider('approvalRoutes')]
    public function test_every_approval_route_declares_ordinary_and_exact_sensitive_middleware(
        string $uri,
        string $ordinaryMiddleware,
        string $sensitiveMiddleware,
    ): void {
        $route = Route::getRoutes()->match(Request::create($uri, 'POST'));

        $this->assertContains($ordinaryMiddleware, $route->gatherMiddleware());
        $this->assertContains($sensitiveMiddleware, $route->gatherMiddleware());
    }

    public static function approvalTypes(): array
    {
        return [
            'sales invoice' => ['sales', 'sales-index', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE],
            'sales return' => ['returns', 'returns-show', SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE],
            'purchase invoice' => ['purchases', 'purchases-edit', SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE],
            'purchase return' => ['purchase_returns', 'purchases-index', SensitivePermissionCatalog::APPROVAL_PURCHASE_RETURN_INVOICE],
            'payment' => ['payments', 'accounts-index', SensitivePermissionCatalog::APPROVAL_PAYMENTS],
        ];
    }

    public static function approvalRoutes(): array
    {
        return [
            'sales invoice' => [
                '/api/sales-invoices/1/approve',
                'effective.permission:sales-index|sales-edit',
                'effective.permission:'.SensitivePermissionCatalog::APPROVAL_SALES_INVOICE,
            ],
            'sales return' => [
                '/api/return-invoices/1/approve',
                'effective.permission:returns-index|returns-edit|returns-show',
                'effective.permission:'.SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE,
            ],
            'purchase invoice' => [
                '/api/purchase-invoices/1/approve',
                'effective.permission:purchases-index|purchases-edit',
                'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE,
            ],
            'purchase return' => [
                '/api/purchase-return-invoices/1/approve',
                'effective.permission:purchases-index|purchases-edit',
                'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PURCHASE_RETURN_INVOICE,
            ],
            'payment' => [
                '/api/payments/1/approve',
                'effective.permission:sales-index|purchases-index|accounts-index',
                'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PAYMENTS,
            ],
        ];
    }

    private function user(): User
    {
        return User::factory()->create([
            'phone' => '01700000000',
            'is_active' => true,
            'is_deleted' => false,
        ]);
    }

    private function role(string $name, bool $active = true): Role
    {
        return Role::create([
            'name' => $name,
            'guard_name' => 'web',
            'is_active' => $active,
        ]);
    }

    private function grantDirectly(User $user, array $permissions): void
    {
        $user->givePermissionTo(array_map(fn (string $name): Permission => $this->permission($name), $permissions));
    }

    private function permission(string $name): Permission
    {
        return Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]);
    }
}
