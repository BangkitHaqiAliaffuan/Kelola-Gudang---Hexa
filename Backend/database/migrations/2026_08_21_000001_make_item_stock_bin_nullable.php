<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop composite PK (item_id, warehouse_id, bin_id) — PK columns cannot be nullable in Postgres.
        Schema::table('item_stock', function ($table) {
            $table->dropPrimary(['item_id', 'warehouse_id', 'bin_id']);
        });

        DB::statement('ALTER TABLE item_stock ALTER COLUMN bin_id DROP NOT NULL');
        DB::statement('ALTER TABLE item_stock ALTER COLUMN bin_id DROP NOT NULL');

        // Make FK nullable (nullOnDelete already, but re-ensure after ALTER)
        // The FK constraint remains; only nullability changes.
        // Replace PK with two partial unique indexes (Postgres idiom for nullable uniqueness).
        DB::statement('CREATE UNIQUE INDEX item_stock_unique_binned ON item_stock (item_id, warehouse_id, bin_id) WHERE bin_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX item_stock_unique_unbinned ON item_stock (item_id, warehouse_id) WHERE bin_id IS NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS item_stock_unique_unbinned');
        DB::statement('DROP INDEX IF EXISTS item_stock_unique_binned');

        // Remove rows with bin_id IS NULL would violate NOT NULL + PK — delete them first
        DB::table('item_stock')->whereNull('bin_id')->delete();

        DB::statement('ALTER TABLE item_stock ALTER COLUMN bin_id SET NOT NULL');

        Schema::table('item_stock', function ($table) {
            $table->primary(['item_id', 'warehouse_id', 'bin_id']);
        });
    }
};
