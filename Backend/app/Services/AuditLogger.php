<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Pencatat jejak audit (append-only, fail-open).
 *
 * - Dilewati bila berjalan di console non-test (seeder/migrate) atau tanpa aktor.
 * - Kegagalan tulis audit tidak pernah menggagalkan transaksi bisnis.
 * - Panggil setelah aksi sukses, bukan sebelumnya.
 */
class AuditLogger
{
    /**
     * Modul menu asal dokumen stock — satu sumber kebenaran untuk pencatatan
     * baru (resolveAuditModule) dan backfill baris lama (audit:backfill-modules).
     */
    public static function moduleForStockDocumentType(?string $type): string
    {
        return match ($type) {
            'Penerimaan', 'Pengeluaran', 'Transfer Gudang', 'Retur Pembelian', 'Retur Penjualan' => 'Transaksi',
            'Stock Opname' => 'Stock Opname',
            default => 'Persediaan',
        };
    }

    public static function record(array $attrs, ?Request $request = null): ?AuditLog
    {
        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return null;
        }

        $request ??= request();

        $user = auth()->user();
        $userId = $attrs['user_id'] ?? $user?->id;
        if ($userId === null) {
            return null;
        }

        if (! isset($attrs['user_name']) || ! isset($attrs['role'])) {
            $actor = $user && (int) $user->id === (int) $userId
                ? $user
                : User::query()->find($userId);
            $attrs['user_name'] ??= $actor?->name;
            $attrs['role'] ??= $actor?->role;
        }

        $attrs['user_id'] = $userId;
        $attrs['occurred_at'] ??= now();
        try {
            $attrs['ip_address'] ??= $request?->ip();
        } catch (\Throwable) {
            // Abaikan bila request tidak tersedia (queue/console).
        }
        $attrs['user_agent'] ??= $request?->userAgent();

        try {
            return AuditLog::query()->create($attrs);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }
}
