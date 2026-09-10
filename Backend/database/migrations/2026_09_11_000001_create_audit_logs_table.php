<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jejak audit aktivitas (System → Audit Trails):
     * - Append-only: tidak ada endpoint update/delete; baris hanya di INSERT.
     * - occurred_at diisi waktu kejadian (bukan waktu tulis queue).
     * - user_name/role di-snapshot karena user bisa dihapus atau pindah role.
     * - old_values/new_values menyimpan diff sebelum/sesudah (json).
     * - Index sejak hari pertama agar filter tetap cepat di puluhan ribu baris.
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->timestamp('occurred_at')->useCurrent();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_name')->nullable();
            $table->string('role')->nullable();
            $table->string('action', 32);
            $table->string('module', 64)->nullable();
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->string('record_no')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->uuid('batch_id')->nullable();
            $table->timestamps();

            $table->index('occurred_at');
            $table->index(['user_id', 'occurred_at']);
            $table->index(['auditable_type', 'auditable_id']);
            $table->index(['action', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
