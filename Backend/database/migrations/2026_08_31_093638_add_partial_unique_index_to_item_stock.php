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
        Schema::table('item_stock', function (Blueprint $table) {
            \Illuminate\Support\Facades\DB::statement('
                CREATE UNIQUE INDEX IF NOT EXISTS item_stock_item_bin_unique
                ON item_stock (item_id, bin_id)
                WHERE bin_id IS NOT NULL
            ');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('item_stock', function (Blueprint $table) {
            \Illuminate\Support\Facades\DB::statement('DROP INDEX IF EXISTS item_stock_item_bin_unique');
        });
    }
};
