<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('internal_barcode')->nullable()->unique()->after('barcode');
        });

        // Backfill existing items so every row has a system-generated internal barcode.
        $counter = 0;
        DB::table('items')->orderBy('id')->each(function ($item) use (&$counter) {
            $counter++;

            DB::table('items')->where('id', $item->id)->update([
                'internal_barcode' => 'IB-'.str_pad((string) $counter, 3, '0', STR_PAD_LEFT),
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique(['internal_barcode']);
            $table->dropColumn('internal_barcode');
        });
    }
};
