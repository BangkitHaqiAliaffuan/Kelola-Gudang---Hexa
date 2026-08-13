<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Retur Pembelian dapat merujuk dokumen Barang Masuk (Penerimaan) asal:
     * stock_documents.source_document_id menunjuk dokumen Penerimaan yang menjadi
     * sumber barang, dan stock_document_lines.source_line_id menunjuk baris
     * Penerimaan tersebut (item/bin asal + harga beli + cap qty retur).
     */
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->foreignId('source_document_id')
                ->nullable()
                ->constrained('stock_documents')
                ->nullOnDelete();
        });

        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->foreignId('source_line_id')
                ->nullable()
                ->constrained('stock_document_lines')
                ->nullOnDelete();

            $table->index('source_line_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->dropIndex(['source_line_id']);
            $table->dropForeign(['source_line_id']);
            $table->dropColumn('source_line_id');
        });

        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropForeign(['source_document_id']);
            $table->dropColumn('source_document_id');
        });
    }
};
