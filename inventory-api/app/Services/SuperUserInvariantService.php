<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;

class SuperUserInvariantService
{
    private const ERROR_MESSAGE = 'At least one active Super User must remain.';

    public function lockState(): void
    {
        User::query()->lockForUpdate()->get(['id']);
        Role::query()->lockForUpdate()->get(['id']);
    }

    public function assertSatisfied(): void
    {
        abort_unless($this->hasActiveEffectiveSuperUser(), 403, self::ERROR_MESSAGE);
    }

    public function assertSatisfiedWithoutRole(Role $role): void
    {
        abort_unless($this->hasActiveEffectiveSuperUser($role->id), 403, self::ERROR_MESSAGE);
    }

    private function hasActiveEffectiveSuperUser(?int $excludedRoleId = null): bool
    {
        return User::query()
            ->where('is_active', true)
            ->where('is_deleted', false)
            ->where(function ($query) use ($excludedRoleId): void {
                $query->whereHas(
                    'permissions',
                    fn ($permissionQuery) => $permissionQuery->where('name', SensitivePermissionCatalog::SUPER_USER),
                )->orWhereHas('roles', function ($roleQuery) use ($excludedRoleId): void {
                    $roleQuery
                        ->where('roles.is_active', true)
                        ->when($excludedRoleId !== null, fn ($query) => $query->where('roles.id', '!=', $excludedRoleId))
                        ->whereHas(
                            'permissions',
                            fn ($permissionQuery) => $permissionQuery->where('name', SensitivePermissionCatalog::SUPER_USER),
                        );
                });
            })
            ->exists();
    }
}
