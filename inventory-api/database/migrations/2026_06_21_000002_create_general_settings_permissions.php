<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    private array $permissions = [
        'general-settings-index',
        'general-settings-add',
        'general-settings-edit',
        'general-settings-delete',
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        collect($this->permissions)->each(function (string $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name], ['guard_name' => 'web']);
            $permission->forceFill(['guard_name' => 'web'])->save();
        });

        Role::query()
            ->whereIn('name', ['Admin', 'Dummy'])
            ->get()
            ->each(fn (Role $role) => $role->givePermissionTo($this->permissions));

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Role::query()
            ->whereIn('name', ['Admin', 'Dummy'])
            ->get()
            ->each(fn (Role $role) => $role->revokePermissionTo($this->permissions));

        Permission::query()->whereIn('name', $this->permissions)->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
