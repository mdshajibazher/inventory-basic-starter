<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Biller;
use App\Models\User;
use App\Services\EffectivePermissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'biller_id' => ['nullable', 'integer', 'exists:billers,id'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->canAccessSystem()) {
            $user->tokens()->delete();

            throw ValidationException::withMessages([
                'email' => ['Your account is inactive. Please contact an administrator.'],
            ]);
        }

        $allowedBranches = Biller::query()
            ->whereIn('id', $user->allowedBillerIds())
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'company_name', 'email', 'phone_number', 'address', 'city']);

        if ($allowedBranches->isEmpty()) {
            throw ValidationException::withMessages([
                'biller_id' => ['No active branch is assigned to this user.'],
            ]);
        }

        if (empty($validated['biller_id']) && $allowedBranches->count() > 1) {
            return response()->json([
                'message' => 'Select a branch to continue.',
                'data' => [
                    'requires_branch' => true,
                    'branches' => $allowedBranches,
                ],
            ]);
        }

        $selectedBillerId = empty($validated['biller_id'])
            ? (int) $allowedBranches->first()->id
            : (int) $validated['biller_id'];
        if (! $allowedBranches->contains('id', $selectedBillerId)) {
            throw ValidationException::withMessages([
                'biller_id' => ['The selected branch is not assigned to this user.'],
            ]);
        }

        $user->forceFill(['current_biller_id' => $selectedBillerId])->save();
        $token = $user->createToken('inventory-mobile')->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'data' => [
                'token' => $token,
                'user' => $this->userPayload($user),
            ],
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'data' => $this->userPayload($request->user()),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Logout successful.',
        ]);
    }

    private function userPayload(User $user): array
    {
        $user->loadMissing('roles:id,name', 'currentBiller:id,name,company_name,email,phone_number,address,city');
        $role = $user->roles->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role_id' => $role?->id ?? $user->role_id,
            'role' => $role,
            'current_biller_id' => $user->current_biller_id,
            'current_biller' => $user->currentBiller,
            'biller_ids' => $user->biller_ids ?? [],
            'roles' => $user->getRoleNames()->values()->all(),
            'permissions' => app(EffectivePermissionService::class)->permissionNames($user),
        ];
    }
}
