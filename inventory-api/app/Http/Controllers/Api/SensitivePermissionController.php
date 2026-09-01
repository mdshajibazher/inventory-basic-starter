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
        $data = $this->validatedData($request);

        return response()->json([
            'message' => 'Sensitive permissions updated successfully.',
            'data' => $this->assignments->syncRole(
                $role,
                $data['permissions'],
                $request->user(),
                $data['acknowledged'],
            ),
        ]);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $this->validatedData($request);

        return response()->json([
            'message' => 'Sensitive permissions updated successfully.',
            'data' => $this->assignments->syncUser(
                $user,
                $data['permissions'],
                $request->user(),
                $data['acknowledged'],
            ),
        ]);
    }

    private function validatedData(Request $request): array
    {
        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in($this->catalog->all())],
            'acknowledged' => ['nullable', 'boolean'],
        ]);

        return [
            'permissions' => $this->catalog->ordered($data['permissions']),
            'acknowledged' => (bool) ($data['acknowledged'] ?? false),
        ];
    }
}
