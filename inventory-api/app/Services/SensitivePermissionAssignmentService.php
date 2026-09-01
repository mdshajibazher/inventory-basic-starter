<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SensitivePermissionAssignmentService
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly SuperUserInvariantService $superUsers,
        private readonly EffectivePermissionService $effectivePermissions,
    ) {}

    public function syncRole(Role $role, array $permissions, User $actor, bool $acknowledged): array
    {
        return DB::transaction(function () use ($role, $permissions, $actor, $acknowledged): array {
            $this->superUsers->lockState();
            $actor = User::query()->findOrFail($actor->id);
            abort_unless($this->effectivePermissions->userHasPermission($actor, SensitivePermissionCatalog::SUPER_USER), 403);
            $role = Role::query()->lockForUpdate()->findOrFail($role->id);
            $current = $this->directPermissionNames($role);
            $desired = $this->catalog->ordered($permissions);
            $this->assertAdditionsAcknowledged($current, $desired, $acknowledged);
            $ordinary = $role->permissions()
                ->pluck('name')
                ->reject(fn (string $permission): bool => $this->catalog->isSensitive($permission))
                ->all();

            $role->syncPermissions([...$ordinary, ...$desired]);
            $this->superUsers->assertSatisfied();
            $this->logChange($actor, $role, $current, $desired);

            return $this->rolePayload($role->fresh());
        });
    }

    public function syncUser(User $user, array $permissions, User $actor, bool $acknowledged): array
    {
        return DB::transaction(function () use ($user, $permissions, $actor, $acknowledged): array {
            $this->superUsers->lockState();
            $actor = User::query()->findOrFail($actor->id);
            abort_unless($this->effectivePermissions->userHasPermission($actor, SensitivePermissionCatalog::SUPER_USER), 403);
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $current = $this->directPermissionNames($user);
            $desired = $this->catalog->ordered($permissions);
            $this->assertAdditionsAcknowledged($current, $desired, $acknowledged);
            $ordinary = $user->permissions()
                ->pluck('name')
                ->reject(fn (string $permission): bool => $this->catalog->isSensitive($permission))
                ->all();

            $user->syncPermissions([...$ordinary, ...$desired]);
            $this->superUsers->assertSatisfied();
            $this->logChange($actor, $user, $current, $desired);

            return $this->userPayload($user->fresh());
        });
    }

    public function directPermissionNames(Role|User $target): array
    {
        return $this->catalog->ordered(
            $target->permissions()
                ->whereIn('name', $this->catalog->all())
                ->pluck('name')
                ->all()
        );
    }

    public function rolePayload(Role $role): array
    {
        return [
            'type' => 'role',
            'id' => $role->id,
            'name' => $role->name,
            'direct_permissions' => $this->directPermissionNames($role),
        ];
    }

    public function userPayload(User $user): array
    {
        $direct = $this->directPermissionNames($user);
        $canAccessSystem = $user->canAccessSystem();
        $roles = $user->roles()
            ->with(['permissions' => fn ($query) => $query->whereIn('name', $this->catalog->all())])
            ->orderBy('name')
            ->get();
        $inherited = [];
        $effective = $canAccessSystem ? $direct : [];

        foreach ($this->catalog->all() as $permission) {
            $sources = $roles
                ->filter(fn ($role): bool => $role->permissions->contains('name', $permission))
                ->map(fn ($role): array => [
                    'id' => $role->id,
                    'name' => $role->name,
                    'is_active' => (bool) $role->is_active,
                ])
                ->values();

            if ($sources->isEmpty()) {
                continue;
            }

            $inherited[] = [
                'name' => $permission,
                'roles' => $sources->all(),
            ];

            if ($canAccessSystem && $sources->contains('is_active', true)) {
                $effective[] = $permission;
            }
        }

        return [
            'type' => 'user',
            'id' => $user->id,
            'name' => $user->name,
            'direct_permissions' => $direct,
            'inherited_permissions' => $inherited,
            'effective_permissions' => $this->catalog->ordered(array_values(array_unique($effective))),
        ];
    }

    private function logChange(User $actor, Model $target, array $current, array $desired): void
    {
        $added = $this->catalog->ordered(array_values(array_diff($desired, $current)));
        $removed = $this->catalog->ordered(array_values(array_diff($current, $desired)));

        if ($added === [] && $removed === []) {
            return;
        }

        activity('sensitive_permissions')
            ->performedOn($target)
            ->causedBy($actor)
            ->event('updated')
            ->withProperties([
                'actor_id' => $actor->id,
                'target_type' => $target::class,
                'target_id' => $target->id,
                'added' => $added,
                'removed' => $removed,
            ])
            ->log('Sensitive permissions updated');
    }

    private function assertAdditionsAcknowledged(array $current, array $desired, bool $acknowledged): void
    {
        if (array_diff($desired, $current) !== [] && ! $acknowledged) {
            throw ValidationException::withMessages([
                'acknowledged' => ['Sensitive permission additions must be acknowledged.'],
            ]);
        }
    }
}
