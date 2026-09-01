<?php

namespace App\Http\Middleware;

use App\Services\EffectivePermissionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEffectivePermission
{
    public function __construct(private readonly EffectivePermissionService $permissions) {}

    public function handle(Request $request, Closure $next, string $permissions): Response
    {
        $user = $request->user();

        abort_unless(
            $user && $this->permissions->userHasAnyPermission($user, explode('|', $permissions)),
            403,
        );

        return $next($request);
    }
}
