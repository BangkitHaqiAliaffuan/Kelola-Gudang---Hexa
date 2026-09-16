<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate operasi sensitif yang hanya boleh dilakukan role `Administrator`.
 *
 * Dipakai untuk operasi TULIS pada manajemen user, role, dan pengaturan
 * sistem — tiga area yang bila disalahgunakan memungkinkan eskalasi hak
 * akses (membuat Administrator baru, mengubah matriks `role_permissions`,
 * mengubah identitas perusahaan). Operasi BACA tetap memakai `role.access`
 * (lihat routes/api.php), karena banyak form non-admin butuh daftar
 * user/role (mis. select PIC di PR & opname).
 *
 * Catatan: role dibandingkan lewat nama `'Administrator'` — role sistem
 * bawaan (lihat RolePermissionSeeder). Role dinamis lain tidak otomatis
 * memperoleh hak ini.
 */
class EnsureAdministrator
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role !== 'Administrator') {
            return response()->json([
                'message' => 'Hanya Administrator yang dapat melakukan operasi ini.',
            ], 403);
        }

        return $next($request);
    }
}
