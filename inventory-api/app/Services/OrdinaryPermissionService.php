<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role as SpatieRole;

class OrdinaryPermissionService
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly SuperUserInvariantService $superUsers,
        private readonly EffectivePermissionService $effectivePermissions,
    ) {}

    public function assertOrdinary(array $permissions): void
    {
        foreach ($permissions as $permission) {
            abort_if(! $this->catalog->isOrdinary($permission), 403, 'Sensitive permissions must use the sensitive permission endpoint.');
        }
    }

    public function authorizeActor(User $actor, string $ordinaryPermission): User
    {
        $actor = User::query()->findOrFail($actor->id);

        abort_unless(
            $this->effectivePermissions->userHasPermission($actor, $ordinaryPermission),
            403,
        );

        return $actor;
    }

    public function assertSensitiveTargetMutationAuthorized(User $actor, Role|User $target): void
    {
        if (! $this->carriesSensitivePermissions($target)) {
            return;
        }

        abort_unless(
            $this->effectivePermissions->userHasPermission($actor, SensitivePermissionCatalog::SUPER_USER),
            403,
        );
    }

    public function sync(
        Role|User $target,
        array $permissions,
        User $actor,
        string $ordinaryPermission = 'users-index',
    ): void {
        $this->assertOrdinary($permissions);

        DB::transaction(function () use ($target, $permissions, $actor, $ordinaryPermission): void {
            $this->superUsers->lockState();
            $actor = $this->authorizeActor($actor, $ordinaryPermission);
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

    public function syncRoles(
        User $user,
        array $roleIds,
        User $actor,
        string $ordinaryPermission,
        bool $acknowledged,
        array $context = [],
    ): User {
        return DB::transaction(function () use ($user, $roleIds, $actor, $ordinaryPermission, $acknowledged, $context): User {
            $this->superUsers->lockState();
            $actor = $this->authorizeActor($actor, $ordinaryPermission);
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $currentRoles = $user->roles()
                ->with('permissions:id,name')
                ->orderBy('roles.id')
                ->get();
            $desiredRoleIds = array_values(array_unique(array_map('intval', $roleIds)));
            $desiredRoles = Role::query()
                ->whereIn('id', $desiredRoleIds)
                ->with('permissions:id,name')
                ->orderBy('id')
                ->get();

            abort_if($desiredRoles->count() !== count($desiredRoleIds), 422, 'One or more roles are invalid.');

            $addedRoles = $desiredRoles->whereNotIn('id', $currentRoles->pluck('id'))->values();
            $removedRoles = $currentRoles->whereNotIn('id', $desiredRoles->pluck('id'))->values();

            if ($addedRoles->isEmpty() && $removedRoles->isEmpty()) {
                return $user;
            }

            $addedSensitivePermissions = $this->roleSensitiveImplications($addedRoles->all());
            $removedSensitivePermissions = $this->roleSensitiveImplications($removedRoles->all());
            $carriesSensitivePermissions = $this->carriesSensitivePermissions($user);
            $sensitiveContext = $carriesSensitivePermissions
                || $addedSensitivePermissions !== []
                || $removedSensitivePermissions !== [];

            if ($sensitiveContext) {
                $this->assertSensitiveTargetMutationAuthorized($actor, $user);

                if (! $this->effectivePermissions->userHasPermission($actor, SensitivePermissionCatalog::SUPER_USER)) {
                    abort(403);
                }
            }

            if ($addedSensitivePermissions !== [] && ! $acknowledged) {
                throw ValidationException::withMessages([
                    'acknowledged' => ['Sensitive role additions must be acknowledged.'],
                ]);
            }

            $beforeEffective = $this->effectiveSensitivePermissionNames($user);

            $user->syncRoles($desiredRoles->pluck('name')->all());
            $user->forceFill(['role_id' => $desiredRoles->first()?->id])->save();
            if ($sensitiveContext) {
                $this->superUsers->assertSatisfied();
            }

            $afterEffective = $this->effectiveSensitivePermissionNames($user->fresh());

            if ($sensitiveContext) {
                $this->logRoleMembershipChange(
                    $actor,
                    $user,
                    $addedRoles->all(),
                    $removedRoles->all(),
                    $addedSensitivePermissions,
                    $removedSensitivePermissions,
                    $beforeEffective,
                    $afterEffective,
                    $context,
                );
            }

            return $user->fresh();
        });
    }

    public function carriesSensitivePermissions(Role|User $target): bool
    {
        if ($target->permissions()->whereIn('name', $this->catalog->all())->exists()) {
            return true;
        }

        return $target instanceof User && $target->roles()
            ->whereHas('permissions', fn ($query) => $query->whereIn('name', $this->catalog->all()))
            ->exists();
    }

    public function directSensitivePermissionNames(Role|User $target): array
    {
        return $this->catalog->ordered(
            $target->permissions()
                ->whereIn('name', $this->catalog->all())
                ->pluck('name')
                ->all(),
        );
    }

    public function effectiveSensitivePermissionNames(Role|User $target): array
    {
        if ($target instanceof Role) {
            return $target->is_active ? $this->directSensitivePermissionNames($target) : [];
        }

        return $this->catalog->ordered($this->effectivePermissions->permissionNames($target));
    }

    public function auditEffectiveTransition(
        User $actor,
        Role|User $target,
        string $action,
        array $before,
        array $after,
    ): void {
        $before = $this->catalog->ordered($before);
        $after = $this->catalog->ordered($after);

        if ($before === $after) {
            return;
        }

        $properties = [
            'actor_id' => $actor->id,
            'target_type' => $target::class,
            'target_id' => $target->id,
            'action' => $action,
            'before_effective_sensitive_permissions' => $before,
            'after_effective_sensitive_permissions' => $after,
        ];

        if ($target instanceof User) {
            $properties['target_user_id'] = $target->id;
        } else {
            $properties['target_role_id'] = $target->id;
            $properties['affected_user_ids'] = $target->users()->orderBy('users.id')->pluck('users.id')->all();
        }

        activity('sensitive_permissions')
            ->performedOn($target)
            ->causedBy($actor)
            ->event('updated')
            ->withProperties($properties)
            ->log('Effective sensitive access updated');
    }

    private function roleSensitiveImplications(array $roles): array
    {
        $permissions = collect($roles)
            ->flatMap(function (SpatieRole $role) {
                $rolePermissions = $role->relationLoaded('permissions')
                    ? $role->permissions->pluck('name')->all()
                    : $role->permissions()->pluck('name')->all();

                return array_filter(
                    $rolePermissions,
                    fn (string $permission): bool => $this->catalog->isSensitive($permission),
                );
            })
            ->unique()
            ->all();

        return $this->catalog->ordered($permissions);
    }

    private function roleAuditPayload(SpatieRole $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'sensitive_permissions' => $this->roleSensitiveImplications([$role]),
        ];
    }

    private function logRoleMembershipChange(
        User $actor,
        User $target,
        array $addedRoles,
        array $removedRoles,
        array $addedSensitivePermissions,
        array $removedSensitivePermissions,
        array $beforeEffective,
        array $afterEffective,
        array $context,
    ): void {
        activity('sensitive_permissions')
            ->performedOn($target)
            ->causedBy($actor)
            ->event('updated')
            ->withProperties([
                'actor_id' => $actor->id,
                'target_type' => $target::class,
                'target_id' => $target->id,
                'target_user_id' => $target->id,
                'action' => 'role_membership_changed',
                'added_roles' => array_map($this->roleAuditPayload(...), $addedRoles),
                'removed_roles' => array_map($this->roleAuditPayload(...), $removedRoles),
                'added_sensitive_permissions' => $addedSensitivePermissions,
                'removed_sensitive_permissions' => $removedSensitivePermissions,
                'before_effective_sensitive_permissions' => $beforeEffective,
                'after_effective_sensitive_permissions' => $afterEffective,
                ...$context,
            ])
            ->log('Sensitive role membership updated');
    }
}
