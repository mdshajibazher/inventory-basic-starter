<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AdministrativeAuthorizationTest extends TestCase
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
            'sms_logs',
            'email_logs',
            'general_settings',
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

    #[DataProvider('generalSettingsRoutes')]
    public function test_a_direct_super_user_can_access_general_settings_and_operational_logs(string $uri): void
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        $this->actingAs($user)->getJson($uri)->assertOk();
    }

    public function test_an_active_role_can_supply_super_user_access_to_general_settings(): void
    {
        $user = $this->user();
        $role = $this->role('Administrator');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $user->assignRole($role);

        $this->actingAs($user)->getJson('/api/general-settings')->assertOk();
    }

    #[DataProvider('generalSettingsRoutes')]
    public function test_retired_general_settings_permissions_have_no_runtime_authority(string $uri): void
    {
        $user = $this->user();
        $user->givePermissionTo([
            $this->permission('general-settings-index'),
            $this->permission('general-settings-edit'),
        ]);

        $this->actingAs($user)->getJson($uri)->assertForbidden();
    }

    #[DataProvider('readOnlyAdministrationRoutes')]
    public function test_a_super_user_can_read_roles_users_and_options_without_users_index(string $uri): void
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $this->role('Visible role');

        $this->actingAs($user)->getJson($uri)->assertOk();
    }

    #[DataProvider('ordinaryAdministrationMutations')]
    public function test_super_user_does_not_grant_ordinary_role_or_user_mutations(string $method, string $uri): void
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $targetUser = $this->user();
        $targetRole = $this->role('Read only target');
        $uri = str_replace(['{user}', '{role}'], [(string) $targetUser->id, (string) $targetRole->id], $uri);

        $this->actingAs($user)->json($method, $uri)->assertForbidden();
    }

    public static function generalSettingsRoutes(): array
    {
        return [
            'general settings' => ['/api/general-settings'],
            'email logs' => ['/api/email-logs'],
            'SMS logs' => ['/api/sms-logs'],
        ];
    }

    public static function readOnlyAdministrationRoutes(): array
    {
        return [
            'users list' => ['/api/users'],
            'user details' => ['/api/users/1'],
            'user options' => ['/api/users/options'],
            'roles list' => ['/api/roles'],
            'role details' => ['/api/roles/1'],
            'ordinary permissions catalog' => ['/api/roles/permissions'],
        ];
    }

    public static function ordinaryAdministrationMutations(): array
    {
        return [
            'create user' => ['POST', '/api/users'],
            'edit user' => ['PUT', '/api/users/{user}'],
            'delete user' => ['DELETE', '/api/users/{user}'],
            'create role' => ['POST', '/api/roles'],
            'edit role' => ['PUT', '/api/roles/{role}'],
            'delete role' => ['DELETE', '/api/roles/{role}'],
        ];
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
        Schema::create('general_settings', function (Blueprint $table): void {
            $table->id();
            $table->timestamps();
        });
        Schema::create('email_logs', function (Blueprint $table): void {
            $table->id();
            $table->timestamps();
        });
        Schema::create('sms_logs', function (Blueprint $table): void {
            $table->id();
            $table->timestamps();
        });
    }
}
