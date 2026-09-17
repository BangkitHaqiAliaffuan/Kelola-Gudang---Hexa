<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Single source of truth resolusi lingkup gudang (F7.2).
 *
 * Dipakai bersama middleware + global scope + FormRequest agar tidak drift.
 * Semantik nilai kembali `effectiveIdsFor()`:
 * - `null`  = mode 'Semua' (lintas-gudang, tanpa batas).
 * - `[]`    = nol gudang (fail-closed W11: lihat kosong, bukan semua).
 * - `[..]`  = hanya gudang-gudang ini.
 */
class WarehouseScope
{
    public static function modeFor(User $user): string
    {
        return $user->warehouseScopeMode();
    }

    /**
     * @return int[]|null
     */
    public static function effectiveIdsFor(User $user): ?array
    {
        if (self::modeFor($user) !== 'Terbatas') {
            return null;
        }

        $ids = $user->warehouses()->pluck('warehouses.id')
            ->map(fn ($id) => (int) $id)
            ->unique()->values()->all();

        if ($ids === [] && $user->default_warehouse_id !== null) {
            // Fallback W5 (keputusan produk terkunci): default tampilan jadi
            // satu-satunya gudang agar user tidak terkunci buta. Dilaporkan
            // agar misconfig tidak tersamarkan.
            Log::warning('WarehouseScope: user Terbatas tanpa pivot memakai default_warehouse_id sebagai fallback.', [
                'user_id' => $user->id,
                'warehouse_id' => (int) $user->default_warehouse_id,
            ]);

            return [(int) $user->default_warehouse_id];
        }

        return $ids;
    }
}
