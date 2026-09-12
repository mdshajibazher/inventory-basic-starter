<?php

namespace App\Services;

use App\Models\ImpersonationSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

class ImpersonationService
{
    public const TOKEN_NAME = 'inventory-impersonation';

    public function originalIsValid(?PersonalAccessToken $token, ?User $actor): bool
    {
        $expiration = config('sanctum.expiration');

        return $token && $actor
            && $token->name !== self::TOKEN_NAME
            && $token->tokenable_type === $actor->getMorphClass()
            && (int) $token->tokenable_id === $actor->id
            && (! $token->expires_at || $token->expires_at->isFuture())
            && (! $expiration || $token->created_at->gt(now()->subMinutes($expiration)))
            && app(EffectivePermissionService::class)->userHasPermission($actor, SensitivePermissionCatalog::SUPER_USER);
    }

    public function end(ImpersonationSession $session, string $reason = 'stopped'): void
    {
        DB::transaction(function () use ($session, $reason): void {
            $session = ImpersonationSession::query()->lockForUpdate()->findOrFail($session->id);
            if ($session->ended_at) {
                return;
            }
            PersonalAccessToken::query()->whereKey($session->impersonation_token_id)->delete();
            $session->forceFill(['ended_at' => now()])->save();
            $this->audit($session, 'stopped', $reason);
        });
    }

    public function endChildren(PersonalAccessToken $token, string $reason): void
    {
        foreach (ImpersonationSession::query()->where('original_token_id', $token->id)->whereNull('ended_at')->get() as $session) {
            $this->end($session, $reason);
        }
    }

    public function logout($token): void
    {
        if (! $token instanceof PersonalAccessToken) {
            return;
        }
        DB::transaction(function () use ($token): void {
            $token = PersonalAccessToken::query()->lockForUpdate()->find($token->id);
            if (! $token) {
                return;
            }
            if ($token->name === self::TOKEN_NAME) {
                $session = ImpersonationSession::query()->where('impersonation_token_id', $token->id)->first();
                if ($session) {
                    $this->end($session, 'logout');
                }
            } else {
                $this->endChildren($token, 'original_logout');
            }
            $token->delete();
        });
    }

    public function audit(ImpersonationSession $session, string $event, ?string $reason = null): void
    {
        $activity = activity('impersonation')->performedOn($session)->event($event)->withProperties([
            'impersonation_id' => $session->id,
            'actor_id' => $session->actor_id,
            'target_id' => $session->target_id,
            'reason' => $reason,
        ]);
        if ($session->actor) {
            $activity->causedBy($session->actor);
        } else {
            $activity->causedByAnonymous();
        }
        $activity->log('Impersonation '.$event);
    }
}
