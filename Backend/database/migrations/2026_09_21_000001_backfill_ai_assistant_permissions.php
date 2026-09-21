<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill baris modul 'AI Assistant' (F8.7): setiap role yang sudah
     * punya akses Persediaan (level apa pun) diberi baris AI Assistant.
     * Gate ai.access bersifat biner (ada baris = gunakan), jadi level yang
     * disimpan formalitas ('Baca'); granularitas tulis/baca tetap di
     * ToolRegistry per-tool + dispatch route nyata.
     *
     * Idempoten (skip bila baris sudah ada) — aman dijalankan ulang dan
     * berdampingan dengan RolePermissionSeeder (firstOrCreate).
     */
    public function up(): void
    {
        $roles = DB::table('role_permissions')
            ->where('module', 'Persediaan')
            ->distinct()
            ->pluck('role');

        foreach ($roles as $role) {
            $exists = DB::table('role_permissions')
                ->where('role', $role)
                ->where('module', 'AI Assistant')
                ->exists();

            if (! $exists) {
                DB::table('role_permissions')->insert([
                    'role' => $role,
                    'module' => 'AI Assistant',
                    'level' => 'Baca',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('module', 'AI Assistant')->delete();
    }
};
