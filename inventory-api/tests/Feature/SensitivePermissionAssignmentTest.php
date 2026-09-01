<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SensitivePermissionAssignmentTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (app(SensitivePermissionCatalog::class)->all() as $permission) {
            $this->permission($permission);
        }
    }

    protected function tearDown(): void
    {
        foreach ([
            'model_has_roles',
            'model_has_permissions',
            'role_has_permissions',
            'permissions',
            'roles',
            'users',
            'billers',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_sensitive_catalog_requires_authentication(): void
    {
        $this->getJson('/api/sensitive-permissions')->assertUnauthorized();
    }

    #[DataProvider('sensitiveMutationRoutes')]
    public function test_sensitive_updates_require_effective_super_user_access(string $uri): void
    {
        $actor = $this->user();
        $actor->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $targetUser = $this->user();
        $targetRole = $this->role('Target role');
        $uri = str_replace(['{user}', '{role}'], [(string) $targetUser->id, (string) $targetRole->id], $uri);

        $this->actingAs($actor)
            ->putJson($uri, ['permissions' => []])
            ->assertForbidden();
    }

    public function test_inactive_role_does_not_supply_sensitive_administration_access(): void
    {
        $actor = $this->user();
        $role = $this->role('Inactive administrator', false);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $actor->assignRole($role);

        $this->actingAs($actor)->getJson('/api/sensitive-permissions')->assertForbidden();
    }

    public function test_catalog_returns_exact_metadata_and_warning_copy(): void
    {
        $actor = $this->superUser();

        $response = $this->actingAs($actor)->getJson('/api/sensitive-permissions');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.name', SensitivePermissionCatalog::SUPER_USER)
            ->assertJsonPath('data.0.category', 'super-user')
            ->assertJsonPath('data.1.name', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE)
            ->assertJsonPath('data.1.category', 'approval')
            ->assertJsonCount(6, 'data')
            ->assertJsonPath(
                'warnings.super_user',
                'Super User can view and change all General Settings and grant or revoke financial approval permissions. It does not automatically approve transactions. Keep at least one active Super User.',
            )
            ->assertJsonPath(
                'warnings.approval',
                'Approving these records posts stock and financial effects. Grant only to trusted staff with the required module access.',
            );
    }

    #[DataProvider('sensitiveMutationRoutes')]
    public function test_adding_sensitive_permissions_requires_explicit_acknowledgment(string $uri): void
    {
        $actor = $this->superUser();
        $targetUser = $this->user();
        $targetRole = $this->role('Target role');
        $uri = str_replace(['{user}', '{role}'], [(string) $targetUser->id, (string) $targetRole->id], $uri);

        $this->actingAs($actor)
            ->putJson($uri, [
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('acknowledged');

        $this->assertFalse($targetUser->fresh()->hasDirectPermission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $this->assertFalse($targetRole->fresh()->hasPermissionTo(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
    }

    public function test_revocation_only_update_does_not_require_acknowledgment(): void
    {
        $actor = $this->superUser();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/sensitive-permissions", ['permissions' => []])
            ->assertOk();

        $this->assertFalse($target->fresh()->hasDirectPermission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
    }

    public function test_user_update_returns_direct_inherited_and_effective_sensitive_permissions(): void
    {
        $actor = $this->superUser();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $activeRole = $this->role('Sales approvers');
        $activeRole->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $inactiveRole = $this->role('Inactive purchasers', false);
        $inactiveRole->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE));
        $target->assignRole([$activeRole, $inactiveRole]);

        $response = $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/sensitive-permissions", [
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.type', 'user')
            ->assertJsonPath('data.id', $target->id)
            ->assertJsonPath('data.direct_permissions.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS)
            ->assertJsonPath('data.inherited_permissions.0.name', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE)
            ->assertJsonPath('data.inherited_permissions.0.roles.0.name', 'Sales approvers')
            ->assertJsonPath('data.inherited_permissions.0.roles.0.is_active', true)
            ->assertJsonPath('data.inherited_permissions.1.name', SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE)
            ->assertJsonPath('data.inherited_permissions.1.roles.0.name', 'Inactive purchasers')
            ->assertJsonPath('data.inherited_permissions.1.roles.0.is_active', false)
            ->assertJsonPath('data.effective_permissions.0', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE)
            ->assertJsonPath('data.effective_permissions.1', SensitivePermissionCatalog::APPROVAL_PAYMENTS)
            ->assertJsonCount(2, 'data.effective_permissions');
    }

    public function test_role_sensitive_changes_are_audited_with_actor_target_and_diff(): void
    {
        $actor = $this->superUser();
        $target = $this->role('Finance approvers');
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));

        $this->actingAs($actor)
            ->putJson("/api/roles/{$target->id}/sensitive-permissions", [
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
                'acknowledged' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.type', 'role')
            ->assertJsonPath('data.direct_permissions.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS);

        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->firstOrFail();

        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame(User::class, $activity->causer_type);
        $this->assertSame($target->id, (int) $activity->subject_id);
        $this->assertSame(Role::class, $activity->subject_type);
        $this->assertSame($actor->id, $activity->properties->get('actor_id'));
        $this->assertSame(Role::class, $activity->properties->get('target_type'));
        $this->assertSame($target->id, $activity->properties->get('target_id'));
        $this->assertSame([SensitivePermissionCatalog::APPROVAL_PAYMENTS], $activity->properties->get('added'));
        $this->assertSame([SensitivePermissionCatalog::APPROVAL_SALES_INVOICE], $activity->properties->get('removed'));
    }

    public function test_user_sensitive_changes_are_audited_with_actor_target_and_diff(): void
    {
        $actor = $this->superUser();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/sensitive-permissions", [
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
                'acknowledged' => true,
            ])
            ->assertOk();

        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->firstOrFail();

        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($target->id, (int) $activity->subject_id);
        $this->assertSame(User::class, $activity->properties->get('target_type'));
        $this->assertSame([SensitivePermissionCatalog::APPROVAL_PAYMENTS], $activity->properties->get('added'));
        $this->assertSame([SensitivePermissionCatalog::APPROVAL_SALES_INVOICE], $activity->properties->get('removed'));
    }

    public static function sensitiveMutationRoutes(): array
    {
        return [
            'user' => ['/api/users/{user}/sensitive-permissions'],
            'role' => ['/api/roles/{role}/sensitive-permissions'],
        ];
    }

    private function superUser(): User
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        return $user;
    }

    private function user(): User
    {
        return User::factory()->create([
            'phone' => '01700000000',
            'biller_ids' => [],
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

    private function permission(string $name): Permission
    {
        return Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]);
    }

    private function createTables(): void
    {
        Schema::create('billers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('company_name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable();
            $table->rememberToken();
            $table->string('phone')->nullable();
            $table->string('company_name')->nullable();
            $table->unsignedInteger('role_id')->nullable();
            $table->unsignedInteger('biller_id')->nullable();
            $table->unsignedInteger('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->unsignedInteger('warehouse_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->text('description')->nullable();
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
    }
}
