<?php

namespace App\Services;

use App\Models\User;

class EffectivePermissionService
{
    public function userHasPermission(User $user, string $permission): bool
    {
        if (! $user->canAccessSystem()) {
            return false;
        }

        if ($user->permissions()->where('name', $permission)->exists()) {
            return true;
        }

        return $user->roles()
            ->where('roles.is_active', true)
            ->whereHas('permissions', fn ($query) => $query->where('name', $permission))
            ->exists();
    }

    public function userHasAnyPermission(User $user, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($this->userHasPermission($user, $permission)) {
                return true;
            }
        }

        return false;
    }
}
