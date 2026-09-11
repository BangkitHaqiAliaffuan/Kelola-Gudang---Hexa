<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Cabut akses System dari role Auditor (Tidak Ada = tanpa baris).
     * Seeder hanya insert-bila-hilang, jadi baris existing tidak ikut
     * hilang saat db:seed diulang — migrasi inilah yang menghapusnya.
     */
    public function up(): void
    {
        DB::table('role_permissions')
            ->where('role', 'Auditor')
            ->where('module', 'System')
            ->delete();
    }

    /**
     * Kembalikan akses System/Baca Auditor seperti sebelum dicabut.
     */
    public function down(): void
    {
        DB::table('role_permissions')->updateOrInsert(
            ['role' => 'Auditor', 'module' => 'System'],
            ['level' => 'Baca', 'created_at' => now(), 'updated_at' => now()]
        );
    }
};
