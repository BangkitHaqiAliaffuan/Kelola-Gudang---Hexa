<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Proposal aksi AI (F8.4). AI mengusulkan → user konfirmasi → baru eksekusi.
     * Setiap proposal mengikat: aktor, tool, parameter ternormalisasi, status,
     * dan expiry (anti-replay). Audit terekam terpisah di `audit_logs`.
     */
    public function up(): void
    {
        Schema::create('ai_proposals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status', 24)->default('pending')->index(); // pending|executing|executed|rejected|expired
            $table->string('tool_name', 64);
            $table->json('payload'); // parameter ternormalisasi (siap dikirim ke route nyata)
            $table->string('summary', 500)->nullable(); // ringkasan bahasa manusia
            $table->string('risk', 16)->default('medium');
            $table->json('context')->nullable(); // prompt + catatan AI (jejak)
            $table->foreignId('result_document_id')->nullable()->constrained('stock_documents')->nullOnDelete();
            $table->timestamp('expires_at')->index();
            $table->timestamp('executed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_proposals');
    }
};
