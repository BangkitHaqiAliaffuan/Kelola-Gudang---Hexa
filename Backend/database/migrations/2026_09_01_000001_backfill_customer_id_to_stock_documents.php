<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill customer_id dari partner snapshot untuk data histori.
        // Hanya untuk Pengeluaran & Retur Penjualan, exact match nama.
        // Partner Departemen Produksi (non-customer) tetap NULL — wajar.
        // Tidak mengubah kolom partner (preserve snapshot).
        DB::statement(<<<'SQL'
            UPDATE stock_documents s
            SET customer_id = c.id
            FROM customers c
            WHERE s.customer_id IS NULL
              AND s.partner IS NOT NULL
              AND s.partner = c.name
              AND s.type IN ('Pengeluaran', 'Retur Penjualan')
            SQL);
    }

    public function down(): void
    {
        // Tidak reversible otomatis — biarkan nilai ter-backfill tetap.
        // Jika perlu rollback manual, jalankan:
        // UPDATE stock_documents SET customer_id = NULL WHERE type IN ('Pengeluaran','Retur Penjualan');
    }
};
