<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tujuan Barang Keluar = Customer | Departemen | Proyek (pilihan form).
        // customer_id sudah ada; lengkapi dengan FK departemen & proyek agar
        // ketiganya setara (sebelumnya dept/proyek hanya snapshot teks `partner`).
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('customer_id')->constrained('departments')->nullOnDelete();
            $table->foreignId('project_id')->nullable()->after('department_id')->constrained('projects')->nullOnDelete();
            $table->index(['department_id', 'type']);
            $table->index(['project_id', 'type']);
        });

        // Backfill histori: exact match nama (ketiga master memakai UNIQUE name).
        // Tie-break: customer_id yang sudah terisi tidak disentuh; bila partner
        // cocok di departments DAN projects, departments menang (pemakaian internal).
        DB::statement(<<<'SQL'
            UPDATE stock_documents s
            SET department_id = d.id
            FROM departments d
            WHERE s.department_id IS NULL
              AND s.customer_id IS NULL
              AND s.partner IS NOT NULL
              AND s.partner = d.name
              AND s.type = 'Pengeluaran'
            SQL);
        DB::statement(<<<'SQL'
            UPDATE stock_documents s
            SET project_id = p.id
            FROM projects p
            WHERE s.project_id IS NULL
              AND s.customer_id IS NULL
              AND s.department_id IS NULL
              AND s.partner IS NOT NULL
              AND s.partner = p.name
              AND s.type = 'Pengeluaran'
            SQL);
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropIndex(['department_id', 'type']);
            $table->dropIndex(['project_id', 'type']);
            $table->dropForeign(['department_id']);
            $table->dropForeign(['project_id']);
            $table->dropColumn(['department_id', 'project_id']);
        });
    }
};
