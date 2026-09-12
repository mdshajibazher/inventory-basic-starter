<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ImpersonationSession;
use App\Models\User;
use App\Services\ImpersonationService;
use App\Services\LoginContextService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class ImpersonationController extends Controller
{
    public function store(Request $request, User $user, ImpersonationService $impersonations, LoginContextService $login)
    {
        $token = $request->user()->currentAccessToken();
        abort_unless($token instanceof PersonalAccessToken, 403, 'A personal access token is required.');
        abort_if($token->name === ImpersonationService::TOKEN_NAME, 403, 'Nested impersonation is not allowed.');
        $validated = $request->validate(['biller_id' => ['nullable', 'integer', 'exists:billers,id']]);

        return DB::transaction(function () use ($request, $user, $token, $validated, $impersonations, $login) {
            // Serialize starts and logout for this original token, including double clicks.
            $original = PersonalAccessToken::query()->lockForUpdate()->find($token->id);
            $actor = $request->user()->fresh();
            abort_unless($impersonations->originalIsValid($original, $actor), 403);
            $target = User::query()->lockForUpdate()->findOrFail($user->id);
            if ($actor->is($target) || ! $target->canAccessSystem()) {
                throw ValidationException::withMessages(['user' => ['Choose another active user.']]);
            }
            $selection = $login->selectBranch($target, $validated['biller_id'] ?? null);
            if ($selection['requires_branch'] ?? false) {
                return response()->json(['data' => $selection]);
            }

            $impersonations->endChildren($original, 'replaced');
            $child = $target->createToken(ImpersonationService::TOKEN_NAME, ['*'], $original->expires_at);
            $session = ImpersonationSession::create([
                'actor_id' => $actor->id,
                'target_id' => $target->id,
                'original_token_id' => $original->id,
                'impersonation_token_id' => $child->accessToken->id,
                'biller_id' => $selection['biller_id'],
            ]);
            // Branch context belongs to this session; preserve the target's regular session.
            $target->forceFill(['current_biller_id' => $selection['biller_id']])->unsetRelation('currentBiller');
            $impersonations->audit($session, 'started');

            return response()->json(['data' => [
                'token' => $child->plainTextToken,
                'user' => $login->userPayload($target),
                'impersonation' => $session->metadata(),
            ]]);
        });
    }

    public function stop(Request $request, ImpersonationSession $impersonation, ImpersonationService $impersonations)
    {
        $token = $request->user()->currentAccessToken();
        abort_unless($token instanceof PersonalAccessToken
            && $token->name !== ImpersonationService::TOKEN_NAME
            && (int) $impersonation->original_token_id === $token->id
            && (int) $impersonation->actor_id === $request->user()->id, 403);
        $impersonations->end($impersonation);

        return response()->json(['message' => 'Impersonation stopped.']);
    }
}
