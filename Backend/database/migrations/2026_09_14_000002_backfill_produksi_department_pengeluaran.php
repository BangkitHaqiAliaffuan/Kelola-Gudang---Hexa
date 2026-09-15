<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill legacy: BK ber-partner teks 'Departemen Produksi' (tanpa FK,
        // warisan seeder lama) dipetakan ke Departemen Produksi + partner
        // dinormalisasi. Scope eksak: hanya Pengeluaran tanpa FK apa pun —
        // Stock Adjustment ber-partner sama TIDAK tersentuh (tidak mengenal
        // tujuan). departments.name UNIQUE sehingga sub-query tepat 1 baris;
        // bila dept belum di-seed, department_id jadi NULL (no-op parsial, aman).
        DB::statement(<<<'SQL'
            UPDATE stock_documents s
            SET department_id = (SELECT id FROM departments WHERE name = 'Produksi'),
                partner = 'Produksi'
            WHERE s.type = 'Pengeluaran'
              AND s.partner = 'Departemen Produksi'
              AND s.customer_id IS NULL
              AND s.department_id IS NULL
              AND s.project_id IS NULL
            SQL);
    }

    public function down(): void
    {
        // Caveat: rollback hanya aman dalam jendela segera setelah migrate —
        // BK baru ke dept Produksi yang dibuat setelah migrasi memiliki sidik
        // jari identik (partner='Produksi' + department_id terisi) dan ikut
        // ter-revert. Dalam alur normal repo down() tidak pernah dijalankan.
        DB::statement(<<<'SQL'
            UPDATE stock_documents s
            SET department_id = NULL,
                partner = 'Departemen Produksi'
            WHERE s.type = 'Pengeluaran'
              AND s.partner = 'Produksi'
              AND s.customer_id IS NULL
              AND s.department_id = (SELECT id FROM departments WHERE name = 'Produksi')
              AND s.project_id IS NULL
            SQL);
    }
};
