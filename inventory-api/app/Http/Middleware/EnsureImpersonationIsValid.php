<?php

namespace App\Http\Middleware;

use App\Models\Biller;
use App\Models\ImpersonationSession;
use App\Services\ImpersonationService;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureImpersonationIsValid
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();
        if (! $token instanceof PersonalAccessToken || $token->name !== ImpersonationService::TOKEN_NAME) {
            return $next($request);
        }

        $session = ImpersonationSession::query()->where('impersonation_token_id', $token->id)->first();
        $service = app(ImpersonationService::class);
        if (! $session || $session->ended_at
            || (int) $session->target_id !== $user->id
            || ! $user->canAccessSystem()
            || ! $service->originalIsValid(PersonalAccessToken::find($session->original_token_id), $session->actor)
            || ! $user->canUseBiller($session->biller_id)
            || ! Biller::query()->whereKey($session->biller_id)->where('is_active', true)->exists()) {
            if ($session) {
                $service->end($session, 'revoked');
            }
            $token->delete();

            return response()->json(['message' => 'This impersonation session has ended.'], 401);
        }

        $user->forceFill(['current_biller_id' => $session->biller_id])->unsetRelation('currentBiller');
        $request->attributes->set('impersonation', $session);

        return $next($request);
    }
}
