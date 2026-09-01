<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Permission;
use App\Models\Role;
use App\Services\OrdinaryPermissionService;
use App\Services\SensitivePermissionCatalog;
use App\Services\SuperUserInvariantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\PermissionRegistrar;

class RoleController extends Controller
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly OrdinaryPermissionService $ordinaryPermissions,
        private readonly SuperUserInvariantService $superUsers,
    ) {}

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $roles = Role::query()
            ->with('permissions:id,name')
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = trim((string) $request->string('search'));

                $query->where(function ($subQuery) use ($term) {
                    $subQuery->where('name', 'like', "%{$term}%")
                        ->orWhere('description', 'like', "%{$term}%")
                        ->orWhereRaw(
                            "case when is_active = 1 then 'active' else 'inactive' end like ?",
                            ["%{$term}%"]
                        );
                });
            })
            ->latest('id')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => RoleResource::collection(collect($roles->items()))->resolve($request),
            'links' => [
                'first' => $roles->url(1),
                'last' => $roles->url($roles->lastPage()),
                'prev' => $roles->previousPageUrl(),
                'next' => $roles->nextPageUrl(),
            ],
            'meta' => [
                'current_page' => $roles->currentPage(),
                'from' => $roles->firstItem(),
                'last_page' => $roles->lastPage(),
                'per_page' => $roles->perPage(),
                'to' => $roles->lastItem(),
                'total' => $roles->total(),
            ],
        ]);
    }

    public function permissions()
    {
        return response()->json([
            'data' => Permission::query()
                ->whereNotIn('name', [...$this->catalog->all(), ...$this->catalog->retiredGeneralSettingsPermissions()])
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function updatePermission(Request $request, Permission $permission)
    {
        $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
        abort_if(! $this->catalog->isOrdinary($permission->name), 403);
        abort_if(is_string($request->input('name')) && ! $this->catalog->isOrdinary($request->input('name')), 403);

        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('permissions', 'name')
                    ->where('guard_name', $permission->guard_name)
                    ->ignore($permission->id),
            ],
        ]);

        $permission->update($data);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return response()->json([
            'message' => 'Permission updated successfully.',
            'data' => $permission,
        ]);
    }

    public function store(Request $request)
    {
        $role = DB::transaction(function () use ($request) {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $data = $this->validatedData($request);
            $permissions = $data['permissions'] ?? [];
            unset($data['permissions']);

            $this->ordinaryPermissions->assertOrdinary($permissions);

            $role = Role::create($data + ['guard_name' => 'web', 'is_active' => true]);
            $this->ordinaryPermissions->sync($role, $permissions, $actor);

            return $role->load('permissions:id,name');
        });

        return response()->json([
            'message' => 'Role created successfully.',
            'data' => new RoleResource($role),
        ], 201);
    }

    public function show(Role $role): JsonResponse
    {
        return response()->json([
            'data' => new RoleResource($role->load('permissions:id,name')),
        ]);
    }

    public function update(Request $request, Role $role)
    {
        $role = DB::transaction(function () use ($request, $role) {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $role = Role::query()->lockForUpdate()->findOrFail($role->id);
            $data = $this->validatedData($request, $role);
            $permissions = $data['permissions'] ?? null;
            unset($data['permissions']);

            if ($permissions !== null) {
                $this->ordinaryPermissions->assertOrdinary($permissions);
            }

            $this->ordinaryPermissions->assertSensitiveTargetMutationAuthorized($actor, $role);
            $beforeEffectiveSensitive = $this->ordinaryPermissions->effectiveSensitivePermissionNames($role);
            $role->update($data);

            if ($permissions !== null) {
                $this->ordinaryPermissions->sync($role, $permissions, $actor);
            }

            $this->superUsers->assertSatisfied();
            $this->ordinaryPermissions->auditEffectiveTransition(
                $actor,
                $role,
                'status_changed',
                $beforeEffectiveSensitive,
                $this->ordinaryPermissions->effectiveSensitivePermissionNames($role->fresh()),
            );

            return $role->load('permissions:id,name');
        });

        return response()->json([
            'message' => 'Role updated successfully.',
            'data' => new RoleResource($role),
        ]);
    }

    public function destroy(Request $request, Role $role)
    {
        $deleted = DB::transaction(function () use ($request, $role): bool {
            $this->superUsers->lockState();
            $actor = $this->ordinaryPermissions->authorizeActor($request->user(), 'users-index');
            $role = Role::query()->lockForUpdate()->findOrFail($role->id);
            $this->ordinaryPermissions->assertSensitiveTargetMutationAuthorized($actor, $role);

            if ($role->users()->exists()) {
                $this->superUsers->assertSatisfiedWithoutRole($role);

                return false;
            }

            $beforeEffectiveSensitive = $this->ordinaryPermissions->effectiveSensitivePermissionNames($role);
            $role->delete();
            $this->superUsers->assertSatisfied();
            $this->ordinaryPermissions->auditEffectiveTransition(
                $actor,
                $role,
                'deleted',
                $beforeEffectiveSensitive,
                [],
            );

            return true;
        });

        if (! $deleted) {
            return response()->json([
                'message' => 'This role is assigned to users and cannot be deleted.',
            ], 422);
        }

        return response()->json([
            'message' => 'Role deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')
                    ->where('guard_name', 'web')
                    ->ignore($role?->id),
            ],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);
    }
}
