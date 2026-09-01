<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Biller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\EffectivePermissionService;
use App\Services\OrdinaryPermissionService;
use App\Services\SensitivePermissionCatalog;
use App\Services\SuperUserInvariantService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly OrdinaryPermissionService $ordinaryPermissions,
        private readonly SuperUserInvariantService $superUsers,
        private readonly EffectivePermissionService $effectivePermissions,
    ) {}

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
        $canSearchSensitive = $request->user()
            && $this->effectivePermissions->userHasPermission($request->user(), SensitivePermissionCatalog::SUPER_USER);
        $excludedPermissionNames = [...$this->catalog->all(), ...$this->catalog->retiredGeneralSettingsPermissions()];

        return UserResource::collection(
            User::query()
                ->with('roles:id,name', 'currentBiller:id,name')
                ->where('is_deleted', false)
                ->when($request->filled('search'), function ($query) use ($request, $canSearchSensitive, $excludedPermissionNames) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term, $canSearchSensitive, $excludedPermissionNames) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('phone', 'like', "%{$term}%")
                                ->orWhereHas('roles', fn ($roleQuery) => $roleQuery->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('roles.permissions', fn ($permissionQuery) => $permissionQuery
                                    ->where('name', 'like', "%{$term}%")
                                    ->when(! $canSearchSensitive, fn ($filteredQuery) => $filteredQuery->whereNotIn('name', $excludedPermissionNames)))
                                ->orWhereHas('permissions', fn ($permissionQuery) => $permissionQuery
                                    ->where('name', 'like', "%{$term}%")
                                    ->when(! $canSearchSensitive, fn ($filteredQuery) => $filteredQuery->whereNotIn('name', $excludedPermissionNames)));
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function options(Request $request)
    {
        $canAssignSensitiveRoles = $request->user()
            && $this->effectivePermissions->userHasPermission($request->user(), SensitivePermissionCatalog::SUPER_USER)
            && $this->effectivePermissions->userHasPermission($request->user(), 'users-index');
        $roles = Role::query()
            ->where('is_active', true)
            ->when(! $canAssignSensitiveRoles, fn ($query) => $query->whereDoesntHave(
                'permissions',
                fn ($permissionQuery) => $permissionQuery->whereIn('name', $this->catalog->all()),
            ))
            ->orderBy('name')
            ->get(['id', 'name']);

        if ($canAssignSensitiveRoles) {
            $roles = $roles->map(fn (Role $role): array => [
                'id' => $role->id,
                'name' => $role->name,
                'sensitive_permissions' => $this->ordinaryPermissions->directSensitivePermissionNames($role),
            ]);
        }

        return response()->json([
            'data' => [
                'roles' => $roles,
                'permissions' => Permission::query()
                    ->whereNotIn('name', [...$this->catalog->all(), ...$this->catalog->retiredGeneralSettingsPermissions()])
                    ->orderBy('name')
                    ->get(['id', 'name']),
                'branches' => Biller::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'company_name']),
                'users' => User::query()->where('is_deleted', false)->where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $user = DB::transaction(function () use ($request) {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $data = $this->validatedData($request);
            $roleIds = $data['roles'] ?? null;
            $permissions = $data['permissions'] ?? null;
            $acknowledged = (bool) ($data['acknowledged'] ?? false);
            unset($data['roles'], $data['permissions'], $data['acknowledged']);

            if ($permissions !== null) {
                $this->ordinaryPermissions->assertOrdinary($permissions);
            }

            $user = User::create($data + ['is_active' => true, 'is_deleted' => false]);

            if ($roleIds !== null) {
                $user = $this->ordinaryPermissions->syncRoles(
                    $user,
                    $roleIds,
                    $actor,
                    'users-index',
                    $acknowledged,
                );
            }

            if ($permissions !== null) {
                $this->ordinaryPermissions->sync($user, $permissions, $actor);
            }

            return $user->load('roles:id,name', 'currentBiller:id,name');
        });

        return response()->json([
            'message' => 'User created successfully.',
            'data' => new UserResource($user),
        ], 201);
    }

    public function show(User $user)
    {
        return response()->json([
            'data' => new UserResource($user->load('roles:id,name')),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $user = DB::transaction(function () use ($request, $user) {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $data = $this->validatedData($request, $user);
            $roleIds = $data['roles'] ?? null;
            $permissions = $data['permissions'] ?? null;
            $acknowledged = (bool) ($data['acknowledged'] ?? false);
            unset($data['roles'], $data['permissions'], $data['acknowledged']);

            if ($permissions !== null) {
                $this->ordinaryPermissions->assertOrdinary($permissions);
            }

            if (empty($data['password'])) {
                unset($data['password']);
            }

            $wasActive = $user->canAccessSystem();
            $beforeEffectiveSensitive = $this->ordinaryPermissions->effectiveSensitivePermissionNames($user);
            $statusChanged = array_key_exists('is_active', $data)
                && (bool) $data['is_active'] !== (bool) $user->is_active;

            if ($this->changesProtectedUserState($user, $data)) {
                $this->ordinaryPermissions->assertSensitiveTargetMutationAuthorized($actor, $user);
            }

            $user->update($data);

            if ($roleIds !== null) {
                $user = $this->ordinaryPermissions->syncRoles(
                    $user,
                    $roleIds,
                    $actor,
                    'users-index',
                    $acknowledged,
                );
            }

            if ($permissions !== null) {
                $this->ordinaryPermissions->sync($user, $permissions, $actor);
            }

            $this->superUsers->assertSatisfied();
            if ($statusChanged) {
                $this->ordinaryPermissions->auditEffectiveTransition(
                    $actor,
                    $user,
                    'status_changed',
                    $beforeEffectiveSensitive,
                    $this->ordinaryPermissions->effectiveSensitivePermissionNames($user->fresh()),
                );
            }

            if ($wasActive && ! $user->canAccessSystem()) {
                $user->tokens()->delete();
            }

            return $user->load('roles:id,name', 'currentBiller:id,name');
        });

        return response()->json([
            'message' => 'User updated successfully.',
            'data' => new UserResource($user),
        ]);
    }

    public function updateRoles(Request $request, User $user)
    {
        $data = $request->validate([
            'roles' => ['nullable', 'array'],
            'roles.*' => ['integer', 'exists:roles,id'],
            'acknowledged' => ['nullable', 'boolean'],
        ]);

        $user = $this->ordinaryPermissions->syncRoles(
            $user,
            $data['roles'] ?? [],
            $request->user(),
            'users-index',
            (bool) ($data['acknowledged'] ?? false),
        );

        return response()->json([
            'message' => 'User roles updated successfully.',
            'data' => new UserResource($user->load('roles:id,name')),
        ]);
    }

    public function updatePermissions(Request $request, User $user)
    {
        $data = $request->validate([
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $this->ordinaryPermissions->sync($user, $data['permissions'] ?? [], $request->user());

        return response()->json([
            'message' => 'User permissions updated successfully.',
            'data' => new UserResource($user->load('roles:id,name')),
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        DB::transaction(function () use ($request, $user): void {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $this->ordinaryPermissions->assertSensitiveTargetMutationAuthorized($actor, $user);
            $beforeEffectiveSensitive = $this->ordinaryPermissions->effectiveSensitivePermissionNames($user);
            $user->update(['is_deleted' => true, 'is_active' => false]);
            $this->superUsers->assertSatisfied();
            $user->tokens()->delete();
            $this->ordinaryPermissions->auditEffectiveTransition(
                $actor,
                $user,
                'deleted',
                $beforeEffectiveSensitive,
                [],
            );
        });

        return response()->json([
            'message' => 'User deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?User $user = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user?->id),
            ],
            'phone' => ['required', 'string', 'max:255'],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:6'],
            'is_active' => ['nullable', 'boolean'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['integer', 'exists:roles,id'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
            'acknowledged' => ['nullable', 'boolean'],
            'biller_ids' => ['required', 'array', 'min:1'],
            'biller_ids.*' => ['integer', 'distinct', 'exists:billers,id'],
        ]);

        $branchIds = array_values(array_unique(array_map('intval', $data['biller_ids'] ?? [])));
        $currentBillerId = $user?->current_biller_id && in_array((int) $user->current_biller_id, $branchIds, true)
            ? (int) $user->current_biller_id
            : ($branchIds[0] ?? null);

        $data['biller_ids'] = $branchIds;
        $data['current_biller_id'] = $currentBillerId;
        $data['biller_id'] = $currentBillerId;

        return $data;
    }

    private function changesProtectedUserState(User $user, array $data): bool
    {
        return array_key_exists('password', $data)
            || (array_key_exists('email', $data) && $data['email'] !== $user->email)
            || (array_key_exists('is_active', $data) && (bool) $data['is_active'] !== (bool) $user->is_active);
    }
}
