<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return UserResource::collection(
            User::query()
                ->with('roles:id,name')
                ->where('is_deleted', false)
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('phone', 'like', "%{$term}%")
                                ->orWhereHas('roles', fn ($roleQuery) => $roleQuery->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('roles.permissions', fn ($permissionQuery) => $permissionQuery->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('permissions', fn ($permissionQuery) => $permissionQuery->where('name', 'like', "%{$term}%"));
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function options()
    {
        return response()->json([
            'data' => [
                'roles' => Role::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
                'permissions' => Permission::query()->orderBy('name')->get(['id', 'name']),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $user = DB::transaction(function () use ($request) {
            $data = $this->validatedData($request);
            $roleIds = $data['roles'] ?? [];
            $permissions = $data['permissions'] ?? [];
            unset($data['roles'], $data['permissions']);

            $user = User::create($data + ['is_active' => true, 'is_deleted' => false]);
            $this->syncAccess($user, $roleIds, $permissions);

            return $user->load('roles:id,name');
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
            $data = $this->validatedData($request, $user);
            $roleIds = $data['roles'] ?? [];
            $permissions = $data['permissions'] ?? [];
            unset($data['roles'], $data['permissions']);

            if (empty($data['password'])) {
                unset($data['password']);
            }

            $user->update($data);
            $this->syncAccess($user, $roleIds, $permissions);

            return $user->load('roles:id,name');
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
        ]);

        $roles = Role::query()
            ->whereIn('id', $data['roles'] ?? [])
            ->get(['id', 'name']);

        $user->syncRoles($roles->pluck('name')->all());
        $user->forceFill(['role_id' => $roles->first()?->id])->save();

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

        $user->syncPermissions($data['permissions'] ?? []);

        return response()->json([
            'message' => 'User permissions updated successfully.',
            'data' => new UserResource($user->load('roles:id,name')),
        ]);
    }

    public function destroy(User $user)
    {
        $user->update(['is_deleted' => true, 'is_active' => false]);
        $user->tokens()->delete();

        return response()->json([
            'message' => 'User deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?User $user = null): array
    {
        return $request->validate([
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
        ]);
    }

    private function syncAccess(User $user, array $roleIds, array $permissions): void
    {
        $roles = Role::query()
            ->whereIn('id', $roleIds)
            ->get(['id', 'name']);

        $user->syncRoles($roles->pluck('name')->all());
        $user->syncPermissions($permissions);
        $user->forceFill(['role_id' => $roles->first()?->id])->save();
    }
}
