<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Kosongkan kepala departemen yang masih Administrator — agar data existing
        // mematuhi aturan baru (admin tidak boleh jadi kepala). Admin dapat
        // dipilih ulang manual ke user non-admin yang aktif.
        DB::statement("
            UPDATE departments
            SET head_user_id = NULL
            WHERE head_user_id IN (SELECT id FROM users WHERE role = 'Administrator')
        ");
    }

    public function down(): void
    {
        // Tidak ada rollback data — biarkan NULL tetap NULL.
    }
};