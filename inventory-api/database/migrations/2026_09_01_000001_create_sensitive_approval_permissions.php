<?php

use App\Models\GeneralSetting;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
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
            ->each(fn (Role $role) => $role->givePermissionTo(SensitivePermissionCatalog::SUPER_USER));

        GeneralSetting::query()
            ->get()
            ->each(function (GeneralSetting $setting) use ($catalog) {
                foreach ($catalog->legacyApproverPermissionMap() as $field => $permissions) {
                    $userIds = array_values(array_unique(array_filter(array_map(
                        'intval',
                        $setting->{$field} ?? []
                    ))));

                    User::query()
                        ->whereKey($userIds)
                        ->get()
                        ->each(fn (User $user) => $user->givePermissionTo($permissions));
                }
            });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        $catalog = app(SensitivePermissionCatalog::class);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Role::query()
            ->where('name', 'Admin')
            ->get()
            ->each(fn (Role $role) => $role->revokePermissionTo(SensitivePermissionCatalog::SUPER_USER));

        Permission::query()
            ->whereIn('name', $catalog->all())
            ->get()
            ->each
            ->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
