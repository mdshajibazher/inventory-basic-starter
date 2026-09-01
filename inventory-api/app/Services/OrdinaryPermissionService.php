<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;

class OrdinaryPermissionService
{
    public function __construct(private readonly SensitivePermissionCatalog $catalog) {}

    public function assertOrdinary(array $permissions): void
    {
        foreach ($permissions as $permission) {
            abort_if(! $this->catalog->isOrdinary($permission), 403, 'Sensitive permissions must use the sensitive permission endpoint.');
        }
    }

    public function sync(Role|User $target, array $permissions): void
    {
        $this->assertOrdinary($permissions);
        $sensitive = $target->permissions()
            ->whereIn('name', $this->catalog->all())
            ->pluck('name')
            ->all();

        $target->syncPermissions([...$permissions, ...$sensitive]);
    }
}
