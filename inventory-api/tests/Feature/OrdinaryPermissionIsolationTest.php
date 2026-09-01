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

class OrdinaryPermissionIsolationTest extends TestCase
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

        foreach ([
            ...app(SensitivePermissionCatalog::class)->all(),
            ...app(SensitivePermissionCatalog::class)->retiredGeneralSettingsPermissions(),
            'users-index',
            'products-index',
            'sales-index',
        ] as $permission) {
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

    public function test_ordinary_role_permission_catalog_excludes_sensitive_and_retired_names(): void
    {
        $actor = $this->ordinaryAdministrator();

        $response = $this->actingAs($actor)->getJson('/api/roles/permissions')->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();

        $this->assertSame(['products-index', 'sales-index', 'users-index'], $names);
    }

    public function test_user_options_permission_catalog_excludes_sensitive_and_retired_names(): void
    {
        $actor = $this->ordinaryAdministrator();

        $response = $this->actingAs($actor)->getJson('/api/users/options')->assertOk();
        $names = collect($response->json('data.permissions'))->pluck('name')->all();

        $this->assertSame(['products-index', 'sales-index', 'users-index'], $names);
    }

    public function test_dedicated_user_ordinary_sync_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo([
            $this->permission('sales-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/permissions", ['permissions' => ['products-index']])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->getDirectPermissions()->sortBy('name')->pluck('name')->values()->all(),
        );
    }

    public function test_full_user_update_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                'name' => $target->name,
                'email' => $target->email,
                'phone' => $target->phone,
                'is_active' => true,
                'biller_ids' => [1],
                'permissions' => ['products-index'],
            ])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->getDirectPermissions()->sortBy('name')->pluck('name')->values()->all(),
        );
    }

    public function test_role_ordinary_sync_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Stock clerk');
        $target->givePermissionTo([
            $this->permission('sales-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $this->actingAs($actor)
            ->putJson("/api/roles/{$target->id}", [
                'name' => $target->name,
                'description' => null,
                'is_active' => true,
                'permissions' => ['products-index'],
            ])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->permissions()->orderBy('name')->pluck('name')->all(),
        );
    }

    public function test_user_ordinary_sync_rejects_forged_sensitive_and_retired_names_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo($this->permission('sales-index'));

        foreach ([SensitivePermissionCatalog::SUPER_USER, 'general-settings-index'] as $forged) {
            $this->actingAs($actor)
                ->putJson("/api/users/{$target->id}/permissions", ['permissions' => [$forged]])
                ->assertForbidden();
        }

        $this->assertSame(['sales-index'], $target->fresh()->getDirectPermissions()->pluck('name')->all());
    }

    public function test_full_user_write_rejects_a_forged_sensitive_name_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                'name' => $target->name,
                'email' => $target->email,
                'phone' => $target->phone,
                'is_active' => true,
                'biller_ids' => [1],
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ])
            ->assertForbidden();
    }

    public function test_role_writes_reject_forged_sensitive_and_retired_names_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Clerk');

        $this->actingAs($actor)
            ->putJson("/api/roles/{$target->id}", [
                'name' => $target->name,
                'is_active' => true,
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ])
            ->assertForbidden();

        $this->actingAs($actor)
            ->postJson('/api/roles', [
                'name' => 'Forged role',
                'permissions' => ['general-settings-edit'],
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('roles', ['name' => 'Forged role']);
    }

    public function test_ordinary_permission_rename_endpoint_cannot_modify_or_create_sensitive_names(): void
    {
        $actor = $this->ordinaryAdministrator();
        $sensitive = $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS);
        $ordinary = $this->permission('products-index');

        $this->actingAs($actor)
            ->putJson("/api/roles/permissions/{$sensitive->id}", ['name' => 'renamed'])
            ->assertForbidden();

        $this->actingAs($actor)
            ->putJson("/api/roles/permissions/{$ordinary->id}", ['name' => SensitivePermissionCatalog::SUPER_USER])
            ->assertForbidden();

        $this->assertSame(SensitivePermissionCatalog::APPROVAL_PAYMENTS, $sensitive->fresh()->name);
        $this->assertSame('products-index', $ordinary->fresh()->name);
    }

    public function test_user_payload_separates_ordinary_direct_and_inherited_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo([
            $this->permission('products-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);
        $role = $this->role('Sales approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $target->assignRole($role);

        $response = $this->actingAs($actor)->getJson("/api/users/{$target->id}");

        $response
            ->assertOk()
            ->assertJsonPath('data.permissions.0', 'products-index')
            ->assertJsonPath('data.direct_permissions.0.name', 'products-index')
            ->assertJsonPath('data.sensitive_permissions.direct.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS)
            ->assertJsonPath('data.sensitive_permissions.inherited.0.name', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE)
            ->assertJsonPath('data.sensitive_permissions.inherited.0.roles.0.name', 'Sales approvers');

        $this->assertCount(1, $response->json('data.permissions'));
        $this->assertCount(1, $response->json('data.direct_permissions'));
    }

    public function test_role_payload_separates_ordinary_and_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Payment approvers');
        $target->givePermissionTo([
            $this->permission('products-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $response = $this->actingAs($actor)->getJson("/api/roles/{$target->id}");

        $response
            ->assertOk()
            ->assertJsonPath('data.permissions.0.name', 'products-index')
            ->assertJsonPath('data.sensitive_permissions.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS);
        $this->assertCount(1, $response->json('data.permissions'));
    }

    private function ordinaryAdministrator(): User
    {
        $user = $this->user();
        $user->givePermissionTo([
            $this->permission('users-index'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);

        return $user;
    }

    private function user(): User
    {
        return User::factory()->create([
            'phone' => '01700000000',
            'biller_id' => 1,
            'current_biller_id' => 1,
            'biller_ids' => [1],
            'is_active' => true,
            'is_deleted' => false,
        ]);
    }

    private function role(string $name): Role
    {
        return Role::create([
            'name' => $name,
            'guard_name' => 'web',
            'is_active' => true,
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
