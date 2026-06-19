<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    private array $permissions = [
        'product-stocks-index',
        'product-stocks-adjust',
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = collect($this->permissions)->mapWithKeys(function (string $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name], ['guard_name' => 'web']);
            $permission->forceFill(['guard_name' => 'web'])->save();

            return [$name => $permission];
        });

        Role::query()
            ->whereIn('name', ['Admin', 'Dummy'])
            ->get()
            ->each(fn (Role $role) => $role->givePermissionTo($permissions->keys()->all()));

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
