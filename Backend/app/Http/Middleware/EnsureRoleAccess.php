<?php

namespace App\Http\Middleware;

use App\Models\RolePermission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRoleAccess
{
    private const LEVEL_RANK = [
        'Baca' => 1,
        'Tulis' => 2,
        'Kelola' => 3,
    ];

    public function handle(Request $request, Closure $next, string $module): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $required = match ($request->method()) {
            'GET', 'HEAD' => 1,
            'POST', 'PUT', 'PATCH' => 2,
            'DELETE' => 3,
            default => 2,
        };

        foreach (RolePermission::accessForRole($user->role) as $permission) {
            if ($permission['module'] !== $module) {
                continue;
            }

            $level = self::LEVEL_RANK[$permission['level']] ?? 0;
            if ($level >= $required) {
                return $next($request);
            }

            break;
        }

        return response()->json(['message' => 'Anda tidak memiliki akses ke modul ini.'], 403);
    }
}
