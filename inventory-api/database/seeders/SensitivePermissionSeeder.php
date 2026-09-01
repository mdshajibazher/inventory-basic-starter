<?php

namespace Database\Seeders;

use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class SensitivePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = app(SensitivePermissionCatalog::class);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        collect($catalog->all())->each(function (string $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name], ['guard_name' => 'web']);
            $permission->forceFill(['guard_name' => 'web'])->save();
        });

        Role::query()
            ->where('name', 'Admin')
            ->get()
            ->each(fn (Role $role) => $role->givePermissionTo($catalog->all()));

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
