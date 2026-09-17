<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tolak sesi milik user yang sudah dinonaktifkan (is_active = false).
 *
 * Dipasang SETELAH `auth:sanctum` di grup rute API (bukan di grup global
 * `api` — di sana user belum ter-resolve). Tanpa ini, token yang sudah
 * diterbitkan tetap valid sampai expiry/logout walau akun dinonaktifkan
 * dari Master Data > User. Frontend membuang token saat menerima 401
 * (lihat use-auth.tsx), jadi penolakan efektif seketika.
 */
class EnsureUserActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->is_active) {
            return response()->json([
                'message' => 'Akun ini telah dinonaktifkan. Silakan login kembali.',
            ], 401);
        }

        return $next($request);
    }
}
