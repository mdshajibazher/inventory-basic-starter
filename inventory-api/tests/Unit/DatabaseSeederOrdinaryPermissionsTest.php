<?php

namespace Tests\Unit;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class DatabaseSeederOrdinaryPermissionsTest extends TestCase
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
            'model_has_roles',
            'role_has_permissions',
            'customer_groups',
            'categories',
            'billers',
            'users',
            'roles',
            'permissions',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_it_never_creates_or_grants_retired_general_settings_permissions_as_ordinary_permissions(): void
    {
        $seeder = new class extends DatabaseSeeder
        {
            public function call($class, $silent = false, array $parameters = [])
            {
                return $this;
            }
        };

        $seeder->run();

        $retiredPermissions = [
            'general-settings-index',
            'general-settings-add',
            'general-settings-edit',
            'general-settings-delete',
        ];

        $this->assertSame([], DB::table('permissions')->whereIn('name', $retiredPermissions)->pluck('name')->all());
        $this->assertSame([], $this->rolePermissions('Admin', $retiredPermissions));
        $this->assertSame([], $this->rolePermissions('Dummy', $retiredPermissions));
    }

    private function rolePermissions(string $roleName, array $permissionNames): array
    {
        return DB::table('role_has_permissions')
            ->join('roles', 'roles.id', '=', 'role_has_permissions.role_id')
            ->join('permissions', 'permissions.id', '=', 'role_has_permissions.permission_id')
            ->where('roles.name', $roleName)
            ->whereIn('permissions.name', $permissionNames)
            ->orderBy('permissions.name')
            ->pluck('permissions.name')
            ->all();
    }

    private function createTables(): void
    {
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
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unique(['name', 'guard_name']);
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('phone')->nullable();
            $table->unsignedInteger('biller_id')->nullable();
            $table->unsignedInteger('role_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('role_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('model_has_roles', function (Blueprint $table) {
            $table->unsignedInteger('role_id');
            $table->unsignedInteger('model_id');
            $table->string('model_type');
            $table->primary(['role_id', 'model_id', 'model_type']);
        });
        Schema::create('billers', function (Blueprint $table) {
            $table->increments('id');
        });
        Schema::create('categories', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('customer_groups', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name')->unique();
            $table->string('percentage');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }
}
