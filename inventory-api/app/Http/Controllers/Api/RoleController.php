<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\PermissionRegistrar;

class RoleController extends Controller
{
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
            'data' => $roles->items(),
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
            'data' => Permission::query()->orderBy('name')->get(),
        ]);
    }

    public function updatePermission(Request $request, Permission $permission)
    {
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
            $data = $this->validatedData($request);
            $permissions = $data['permissions'] ?? [];
            unset($data['permissions']);

            $role = Role::create($data + ['guard_name' => 'web', 'is_active' => true]);
            $role->syncPermissions($permissions);

            return $role->load('permissions:id,name');
        });

        return response()->json([
            'message' => 'Role created successfully.',
            'data' => $role,
        ], 201);
    }

    public function show(Role $role)
    {
        return response()->json([
            'data' => $role->load('permissions:id,name'),
        ]);
    }

    public function update(Request $request, Role $role)
    {
        $role = DB::transaction(function () use ($request, $role) {
            $data = $this->validatedData($request, $role);
            $permissions = $data['permissions'] ?? null;
            unset($data['permissions']);

            $role->update($data);

            if ($permissions !== null) {
                $role->syncPermissions($permissions);
            }

            return $role->load('permissions:id,name');
        });

        return response()->json([
            'message' => 'Role updated successfully.',
            'data' => $role,
        ]);
    }

    public function destroy(Role $role)
    {
        if ($role->users()->exists()) {
            return response()->json([
                'message' => 'This role is assigned to users and cannot be deleted.',
            ], 422);
        }

        $role->delete();

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
