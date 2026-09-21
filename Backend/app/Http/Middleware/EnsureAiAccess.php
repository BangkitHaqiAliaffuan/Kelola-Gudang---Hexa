<?php

namespace App\Http\Middleware;

use App\Models\RolePermission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate biner modul AI Assistant (F8.7): lolos bila role memiliki baris
 * (`role`, 'AI Assistant') — level diabaikan (gunakan / tidak saja).
 *
 * Granularitas tetap berlapis di bawahnya: ToolRegistry::forRole menyaring
 * tool tulis per modul/level (Auditor read-only tak pernah melihat tool
 * tulis), dan eksekusi proposal didispatch lewat route nyata sebagai user
 * tersebut (RBAC + scope + FormRequest penuh). Middleware ini hanya saklar
 * Akses-ke-Asisten.
 */
class EnsureAiAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $allowed = RolePermission::query()
            ->where('role', $user->role)
            ->where('module', 'AI Assistant')
            ->exists();

        if (! $allowed) {
            return response()->json([
                'message' => 'Role Anda tidak memiliki akses AI Assistant.',
            ], 403);
        }

        return $next($request);
    }
}
