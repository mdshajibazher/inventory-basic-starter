<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ImpersonationService;
use App\Services\LoginContextService;
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

        $selection = app(LoginContextService::class)->selectBranch($user, $validated['biller_id'] ?? null);
        if ($selection['requires_branch'] ?? false) {
            return response()->json(['message' => 'Select a branch to continue.', 'data' => $selection]);
        }
        $selectedBillerId = $selection['biller_id'];

        $user->forceFill(['current_biller_id' => $selectedBillerId])->save();
        $token = $user->createToken('inventory-mobile')->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'data' => [
                'token' => $token,
                'user' => app(LoginContextService::class)->userPayload($user),
            ],
        ]);
    }

    public function me(Request $request)
    {
        $data = app(LoginContextService::class)->userPayload($request->user());
        if ($session = $request->attributes->get('impersonation')) {
            $data['impersonation'] = $session->metadata();
        }

        return response()->json(['data' => $data]);
    }

    public function logout(Request $request)
    {
        app(ImpersonationService::class)->logout($request->user()->currentAccessToken());

        return response()->json([
            'message' => 'Logout successful.',
        ]);
    }
}
