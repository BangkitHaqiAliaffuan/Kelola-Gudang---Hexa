<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Snapshot harga jual per baris (sumber panel omzet/margin).
        // Cermin kolom unit_cost: snapshot saat dokumen dibuat, histori kekal
        // walau Harga Jual master berubah. unit_price_estimated menandai hasil
        // backfill (estimasi dari master saat itu) vs harga aktual transaksi.
        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->decimal('unit_price', 15, 2)->nullable()->after('unit_cost');
            $table->boolean('unit_price_estimated')->default(false)->after('unit_price');
        });

        // Backfill histori: garis Pengeluaran & Retur Penjualan dari Harga Jual
        // master saat migrasi — hanya bila price > 0 (tanpa harga fiktif).
        // (Postgres: tabel target tidak boleh di-JOIN — relasi via WHERE.)
        DB::statement(<<<'SQL'
            UPDATE stock_document_lines
            SET unit_price = i.price,
                unit_price_estimated = true
            FROM items i, stock_documents d
            WHERE stock_document_lines.item_id = i.id
              AND stock_document_lines.document_id = d.id
              AND stock_document_lines.unit_price IS NULL
              AND i.price > 0
              AND d.type IN ('Pengeluaran', 'Retur Penjualan')
            SQL);
    }

    public function down(): void
    {
        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->dropColumn(['unit_price', 'unit_price_estimated']);
        });
    }
};
