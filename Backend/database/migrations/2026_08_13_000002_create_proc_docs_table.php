<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('proc_docs', function (Blueprint $table) {
            $table->id();
            $table->string('no')->unique(); // PR/2026/0001 | PO/2026/0001 | GR/2026/0001
            $table->string('kind'); // PR | PO | GR (Purchase Request / Order / Receive Goods)
            $table->string('status'); // PR: Draft | Menunggu Approval | Disetujui | Ditolak | Dibatalkan
            $table->dateTime('document_date');
            $table->date('need_date')->nullable(); // tanggal kebutuhan (needed-by)
            $table->foreignId('requester_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference')->nullable(); // kode budget (PR): BUDGET-1234
            $table->string('note')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('decision_note')->nullable(); // alasan tolak/setujui
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['kind', 'status']);
            $table->index(['document_date', 'kind']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('proc_docs');
    }
};
