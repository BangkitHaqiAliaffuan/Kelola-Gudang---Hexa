<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Riwayat keputusan approval per dokumen pengadaan (PR/PO), plus approver
     * aktif yang sedang menunggu tindakan pada proc_docs.approver_user_id.
     */
    public function up(): void
    {
        Schema::create('proc_doc_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proc_doc_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('level'); // 1 (single-level: Kepala Departemen)
            $table->string('status'); // Menunggu | Disetujui | Ditolak
            $table->foreignId('approver_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('decision_note')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->unique(['proc_doc_id', 'level']);
        });

        Schema::table('proc_docs', function (Blueprint $table) {
            $table->foreignId('approver_user_id')->nullable()->after('approved_by')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('proc_docs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approver_user_id');
        });

        Schema::dropIfExists('proc_doc_approvals');
    }
};