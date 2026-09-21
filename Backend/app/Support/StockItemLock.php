<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Serialisasi posting konkuren per item (W2 pasca-audit).
 *
 * `StockLedger::applyMovements` berpola read→compute→write tanpa row lock,
 * dan `assertNoNegativeStock` membaca SEBELUM write — dua posting bersamaan
 * pada item yang sama bisa sama-sama lolos assert lalu interleave, dengan
 * clamp max(0) menyembunyikan negatif (korupsi stok diam-diam).
 *
 * Advisory lock transaksi (`pg_advisory_xact_lock`, otomatis lepas saat
 * transaksi selesai) menutup TOCTOU assert+write sekaligus, mencakup kasus
 * insert (`updateOrInsert` pada lokasi yang belum ada barisnya — row lock
 * biasa tidak bisa mengunci baris yang tidak ada). ID SELALU diurutkan
 * ascending sebelum dikunci agar dua transaksi dengan urutan item berbeda
 * tidak deadlock.
 *
 * WAJIB dipanggil di dalam transaksi DB pemanggil (post()/record()).
 */
class StockItemLock
{
    /** Namespace key1 advisory lock — unik untuk subsistem stok. */
    public const NAMESPACE = 810001;

    /**
     * @param  list<int>  $itemIds
     */
    public static function acquire(array $itemIds): void
    {
        $sorted = collect($itemIds)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->sort()
            ->values();

        foreach ($sorted as $itemId) {
            DB::select('SELECT pg_advisory_xact_lock(?, ?) AS locked', [self::NAMESPACE, $itemId]);
        }
    }
}
