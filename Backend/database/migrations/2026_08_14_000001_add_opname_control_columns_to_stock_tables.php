<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kontrol stock opname dunia nyata (Fase A):
     * - stock_documents.blind_count — counter tidak melihat stok sistem saat
     *   menghitung fisik (mencegah confirmation bias).
     * - stock_documents.frozen_at — momen "freeze" book balance; barang yang
     *   bergerak setelahnya dianggap variance tidak valid dan wajib recount.
     * - stock_document_lines.reason_code — alasan selisih (root cause) wajib
     *   untuk tiap baris yang variance-nya bukan nol sebelum posting.
     * - stock_document_lines.counted_by_user_id/counted_at — jejak audit siapa
     *   & kapan baris dihitung.
     */
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->boolean('blind_count')->default(true)->after('status');
            $table->timestamp('frozen_at')->nullable()->after('document_date');
        });

        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->string('reason_code')->nullable()->after('note');
            $table->foreignId('counted_by_user_id')->nullable()->after('reason_code')->constrained('users')->nullOnDelete();
            $table->timestamp('counted_at')->nullable()->after('counted_by_user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stock_document_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('counted_by_user_id');
            $table->dropColumn(['reason_code', 'counted_at']);
        });

        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropColumn(['blind_count', 'frozen_at']);
        });
    }
};