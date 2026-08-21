<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->foreignId('requester_user_id')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
        });

        // Backfill existing rows: match created_by (nama) ke users.name (case-insensitive).
        // created_by kini adalah FK bigint (user id), bukan nama — cast ke text agar lower() tidak error.
        // Jika created_by sudah berisi id numerik, langsung pakai sebagai requester.
        DB::statement("
            UPDATE stock_documents
            SET requester_user_id = created_by
            WHERE created_by IS NOT NULL
              AND requester_user_id IS NULL
              AND created_by::text ~ '^[0-9]+$'
        ");
        DB::statement("
            UPDATE stock_documents
            SET requester_user_id = users.id
            FROM users
            WHERE lower(users.name) = lower(stock_documents.created_by::text)
              AND stock_documents.requester_user_id IS NULL
              AND stock_documents.created_by::text !~ '^[0-9]+$'
        ");
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requester_user_id');
        });
    }
};