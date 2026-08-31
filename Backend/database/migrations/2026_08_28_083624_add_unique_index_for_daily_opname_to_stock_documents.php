<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Partial unique index preventing > 1 active Stock Opname per warehouse per day.
     * The WHERE clause excludes 'Dibatalkan' so cancelled documents don't block new ones.
     */
    public function up(): void
    {
        // PostgreSQL supports partial indexes with WHERE clause.
        // Cast document_date to date to handle timestamp columns.
        DB::statement("
            CREATE UNIQUE INDEX IF NOT EXISTS stock_documents_opname_daily_uniq
            ON stock_documents (warehouse_id, (document_date::date))
            WHERE type = 'Stock Opname' AND status <> 'Dibatalkan'
        ");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS stock_documents_opname_daily_uniq');
    }
};

