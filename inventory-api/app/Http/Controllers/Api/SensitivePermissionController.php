<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionAssignmentService;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SensitivePermissionController extends Controller
{
    public function __construct(
        private readonly SensitivePermissionCatalog $catalog,
        private readonly SensitivePermissionAssignmentService $assignments,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalog->metadata(),
            'warnings' => [
                'super_user' => SensitivePermissionCatalog::SUPER_USER_WARNING,
                'approval' => SensitivePermissionCatalog::APPROVAL_WARNING,
            ],
        ]);
    }

    public function updateRole(Request $request, Role $role): JsonResponse
    {
        $permissions = $this->validatedPermissions($request, $this->assignments->directPermissionNames($role));

        return response()->json([
            'message' => 'Sensitive permissions updated successfully.',
            'data' => $this->assignments->syncRole($role, $permissions, $request->user()),
        ]);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $permissions = $this->validatedPermissions($request, $this->assignments->directPermissionNames($user));

        return response()->json([
            'message' => 'Sensitive permissions updated successfully.',
            'data' => $this->assignments->syncUser($user, $permissions, $request->user()),
        ]);
    }

    private function validatedPermissions(Request $request, array $current): array
    {
        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in($this->catalog->all())],
            'acknowledged' => ['nullable', 'boolean'],
        ]);
        $permissions = $this->catalog->ordered($data['permissions']);

        if (array_diff($permissions, $current) !== [] && ! ($data['acknowledged'] ?? false)) {
            throw ValidationException::withMessages([
                'acknowledged' => ['Sensitive permission additions must be acknowledged.'],
            ]);
        }

        return $permissions;
    }
}
