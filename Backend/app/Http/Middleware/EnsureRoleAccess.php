<?php

namespace App\Http\Middleware;

use App\Support\RoleAccessLevels;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRoleAccess
{
    public function handle(Request $request, Closure $next, string $module): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $hasAccess = RoleAccessLevels::roleHasLevel(
            $user->role,
            $module,
            RoleAccessLevels::requiredLevelForMethod($request->method())
        );

        if (! $hasAccess) {
            return response()->json(['message' => 'Anda tidak memiliki akses ke modul ini.'], 403);
        }

        return $next($request);
    }
}
