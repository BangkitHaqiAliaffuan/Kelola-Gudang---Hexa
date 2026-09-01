<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('DROP INDEX IF EXISTS item_stock_item_bin_unique');
    }

    public function down(): void
    {
        DB::statement('
            CREATE UNIQUE INDEX IF NOT EXISTS item_stock_item_bin_unique
            ON item_stock (item_id, bin_id)
            WHERE bin_id IS NOT NULL
        ');
    }
};
