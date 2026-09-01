<?php

namespace Tests\Unit;

use App\Models\Role;
use Database\Seeders\SensitivePermissionSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SensitivePermissionSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

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
        Schema::create('role_has_permissions', function (Blueprint $table) {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('role_has_permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('permissions');

        parent::tearDown();
    }

    public function test_it_grants_a_fresh_admin_role_all_sensitive_permissions_idempotently(): void
    {
        $admin = Role::create(['name' => 'Admin', 'guard_name' => 'web', 'is_active' => true]);

        $this->seed(SensitivePermissionSeeder::class);
        $this->seed(SensitivePermissionSeeder::class);

        $this->assertSame([
            'approvals-payments',
            'approvals-purchase-invoice',
            'approvals-purchase-return-invoice',
            'approvals-sales-invoice',
            'approvals-sales-return-invoice',
            'super-user',
        ], DB::table('permissions')->orderBy('name')->pluck('name')->all());
        $this->assertSame([
            'approvals-payments',
            'approvals-purchase-invoice',
            'approvals-purchase-return-invoice',
            'approvals-sales-invoice',
            'approvals-sales-return-invoice',
            'super-user',
        ], $admin->permissions()->orderBy('name')->pluck('name')->all());
        $this->assertSame(6, DB::table('role_has_permissions')->count());
    }
}
