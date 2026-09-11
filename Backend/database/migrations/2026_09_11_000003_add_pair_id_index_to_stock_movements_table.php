<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index pendukung FK self-referencing pair_id (pasangan transfer OUT+IN).
 *
 * Tanpa index ini, setiap penghapusan baris stock_movements memicu full
 * seq-scan untuk pemeriksaan SET NULL (ditemukan saat refresh benchmark:
 * satu DELETE chunk 21+ menit). Index btree biasa — aditif dan aman di
 * semua driver (tidak seperti index GIN/trgm Fase 1.1 yang pgsql-only).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->index('pair_id', 'idx_stock_movements_pair_id');
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropIndex('idx_stock_movements_pair_id');
        });
    }
};
