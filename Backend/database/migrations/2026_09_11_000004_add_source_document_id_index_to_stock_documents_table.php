<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index pendukung FK self-referencing source_document_id (retur -> dokumen
 * sumber). Temuan susulan dari kasus pair_id (migrasi 000003): tanpa index
 * ini, setiap penghapusan stock_documents memicu full seq-scan untuk
 * pemeriksaan SET NULL — refresh benchmark (136rb dokumen) macet 23 menit.
 * Sama seperti pair_id, ini production gap (cleanup dokumen approval-guard
 * menghapus dokumen yang bisa dirujuk retur).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->index('source_document_id', 'idx_stock_documents_source_document_id');
        });
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropIndex('idx_stock_documents_source_document_id');
        });
    }
};
