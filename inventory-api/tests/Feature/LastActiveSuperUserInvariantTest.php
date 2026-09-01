<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class LastActiveSuperUserInvariantTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        DB::table('billers')->insert([
            'id' => 1,
            'name' => 'Main Branch',
            'company_name' => 'Inventory',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([...app(SensitivePermissionCatalog::class)->all(), 'users-index'] as $permission) {
            $this->permission($permission);
        }
    }

    protected function tearDown(): void
    {
        foreach ([
            'personal_access_tokens',
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

    public function test_last_direct_super_user_cannot_revoke_their_direct_grant(): void
    {
        $actor = $this->directAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}/sensitive-permissions", ['permissions' => []])
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->hasDirectPermission(SensitivePermissionCatalog::SUPER_USER));
    }

    public function test_last_role_derived_super_user_cannot_remove_super_user_from_the_role(): void
    {
        [$actor, $role] = $this->roleAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/roles/{$role->id}/sensitive-permissions", [
                'permissions' => [],
            ])
            ->assertForbidden();

        $this->assertTrue($role->fresh()->hasPermissionTo(SensitivePermissionCatalog::SUPER_USER));
    }

    public function test_last_super_user_cannot_be_deactivated(): void
    {
        $actor = $this->directAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}", $this->userPayload($actor, ['is_active' => false]))
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->is_active);
    }

    public function test_last_super_user_cannot_be_deleted(): void
    {
        $actor = $this->directAdministrator();

        $this->actingAs($actor)
            ->deleteJson("/api/users/{$actor->id}")
            ->assertForbidden();

        $actor->refresh();
        $this->assertTrue($actor->is_active);
        $this->assertFalse($actor->is_deleted);
    }

    public function test_role_that_supplies_the_last_super_user_cannot_be_deactivated(): void
    {
        [$actor, $role] = $this->roleAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/roles/{$role->id}", [
                'name' => $role->name,
                'is_active' => false,
            ])
            ->assertForbidden();

        $this->assertTrue($role->fresh()->is_active);
    }

    public function test_role_that_supplies_the_last_super_user_cannot_be_deleted(): void
    {
        [$actor, $role] = $this->roleAdministrator();

        $this->actingAs($actor)
            ->deleteJson("/api/roles/{$role->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('roles', ['id' => $role->id]);
        $this->assertDatabaseHas('model_has_roles', ['role_id' => $role->id, 'model_id' => $actor->id]);
    }

    public function test_dedicated_role_reassignment_cannot_remove_the_last_effective_super_user(): void
    {
        [$actor, $role] = $this->roleAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}/roles", ['roles' => []])
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->hasRole($role));
    }

    public function test_full_user_update_cannot_remove_the_last_effective_super_user_role(): void
    {
        [$actor, $role] = $this->roleAdministrator();

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}", $this->userPayload($actor, ['roles' => []]))
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->hasRole($role));
    }

    public function test_inactive_direct_super_user_does_not_satisfy_the_invariant(): void
    {
        $actor = $this->directAdministrator();
        $inactive = $this->user(false);
        $inactive->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}/sensitive-permissions", ['permissions' => []])
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->hasDirectPermission(SensitivePermissionCatalog::SUPER_USER));
    }

    public function test_super_user_from_an_inactive_role_does_not_satisfy_the_invariant(): void
    {
        $actor = $this->directAdministrator();
        $inactiveRole = $this->role('Inactive administrators', false);
        $inactiveRole->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $this->user()->assignRole($inactiveRole);

        $this->actingAs($actor)
            ->putJson("/api/users/{$actor->id}/sensitive-permissions", ['permissions' => []])
            ->assertForbidden();

        $this->assertTrue($actor->fresh()->hasDirectPermission(SensitivePermissionCatalog::SUPER_USER));
    }

    public function test_one_of_multiple_active_effective_super_users_can_be_revoked(): void
    {
        $actor = $this->directAdministrator();
        $other = $this->user();
        $other->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        $this->actingAs($actor)
            ->putJson("/api/users/{$other->id}/sensitive-permissions", ['permissions' => []])
            ->assertOk();

        $this->assertFalse($other->fresh()->hasDirectPermission(SensitivePermissionCatalog::SUPER_USER));
        $this->assertTrue($actor->fresh()->hasDirectPermission(SensitivePermissionCatalog::SUPER_USER));
    }

    private function directAdministrator(): User
    {
        $user = $this->user();
        $user->givePermissionTo([
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
            $this->permission('users-index'),
        ]);

        return $user;
    }

    private function roleAdministrator(): array
    {
        $user = $this->user();
        $role = $this->role('Administrators');
        $role->givePermissionTo([
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
            $this->permission('users-index'),
        ]);
        $user->assignRole($role);
        $user->forceFill(['role_id' => $role->id])->save();

        return [$user, $role];
    }

    private function user(bool $active = true): User
    {
        return User::factory()->create([
            'phone' => '01700000000',
            'biller_id' => 1,
            'current_biller_id' => 1,
            'biller_ids' => [1],
            'is_active' => $active,
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

    private function userPayload(User $user, array $overrides = []): array
    {
        return [
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => true,
            'biller_ids' => [1],
            ...$overrides,
        ];
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
        Schema::create('personal_access_tokens', function (Blueprint $table): void {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }
}
