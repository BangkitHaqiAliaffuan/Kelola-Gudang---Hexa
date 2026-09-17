<?php

namespace App\Http\Middleware;

use App\Support\WarehouseScope;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureWarehouseScope
{
    /**
     * Atribut request tempat himpunan izin disimpan:
     * null = Semua, [] = nol gudang (fail-closed), [..] = terbatas.
     * Dibaca global scope via `EnsureWarehouseScope::idsFor($request)`.
     */
    public const ATTRIBUTE = 'warehouse_scope';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Baca saja (W6): scope menyempitkan hasil, penolakan tulis terjadi
        // di validasi/controller. Middleware ini sendiri no-op perilaku.
        $request->attributes->set(self::ATTRIBUTE, WarehouseScope::effectiveIdsFor($user));

        return $next($request);
    }

    /**
     * @return int[]|null null bila middleware belum berjalan (anggap Semua).
     */
    public static function idsFor(Request $request): ?array
    {
        /** @var int[]|null $ids */
        $ids = $request->attributes->get(self::ATTRIBUTE);

        return $ids;
    }
}
