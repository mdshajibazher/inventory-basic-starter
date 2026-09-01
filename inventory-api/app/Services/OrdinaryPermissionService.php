<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class OrdinaryPermissionService
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly SuperUserInvariantService $superUsers,
    ) {}

    public function assertOrdinary(array $permissions): void
    {
        foreach ($permissions as $permission) {
            abort_if(! $this->catalog->isOrdinary($permission), 403, 'Sensitive permissions must use the sensitive permission endpoint.');
        }
    }

    public function assertNoSensitiveRoleAdditions(array $currentRoleIds, array $desiredRoleIds): void
    {
        $currentRoleIds = array_map('intval', $currentRoleIds);
        $addedRoleIds = array_values(array_diff(array_map('intval', $desiredRoleIds), $currentRoleIds));

        if ($addedRoleIds === []) {
            return;
        }

        $addsSensitiveRole = Role::query()
            ->whereIn('id', $addedRoleIds)
            ->whereHas('permissions', fn ($query) => $query->whereIn('name', $this->catalog->all()))
            ->exists();

        abort_if($addsSensitiveRole, 403, 'Sensitive-bearing roles cannot be assigned through ordinary user administration.');
    }

    public function sync(Role|User $target, array $permissions): void
    {
        $this->assertOrdinary($permissions);

        DB::transaction(function () use ($target, $permissions): void {
            $this->superUsers->lockState();
            $target = $target instanceof User
                ? User::query()->lockForUpdate()->findOrFail($target->id)
                : Role::query()->lockForUpdate()->findOrFail($target->id);
            $sensitive = $target->permissions()
                ->whereIn('name', $this->catalog->all())
                ->pluck('name')
                ->all();

            $target->syncPermissions([...$permissions, ...$sensitive]);
        });
    }
}
