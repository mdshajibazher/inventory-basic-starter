<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    private string $permission = 'reports-profit';

    public function up(): void
    {
        $permission = Permission::query()->firstOrCreate(['name' => $this->permission], ['guard_name' => 'web']);
        $permission->forceFill(['guard_name' => 'web'])->save();

        Role::query()
            ->whereIn('name', ['Admin', 'Dummy'])
            ->get()
            ->each(fn (Role $role) => $role->givePermissionTo($this->permission));
    }

    public function down(): void
    {
        Role::query()
            ->whereIn('name', ['Admin', 'Dummy'])
            ->get()
            ->each(fn (Role $role) => $role->revokePermissionTo($this->permission));

        Permission::query()->where('name', $this->permission)->delete();
    }
};
