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
        Schema::table('racks', function (Blueprint $table) {
            $table->string('aisle', 1)->nullable()->after('warehouse_id');
            $table->string('bay', 2)->nullable()->after('aisle');
        });

        Schema::table('bins', function (Blueprint $table) {
            $table->string('level', 2)->nullable()->after('rack_id');
            $table->string('position', 2)->nullable()->after('level');
        });

        Schema::table('racks', function (Blueprint $table) {
            $table->dropUnique('racks_code_unique');
        });

        Schema::table('bins', function (Blueprint $table) {
            $table->dropUnique('bins_code_unique');
        });

        // Backfill existing rows from the legacy RAK-### / BIN-### codes.
        DB::statement(<<<'SQL'
            UPDATE racks
            SET aisle = 'A',
                bay = LPAD((SUBSTRING(code FROM 5)::int % 100)::text, 2, '0'),
                code = 'A-' || LPAD((SUBSTRING(code FROM 5)::int % 100)::text, 2, '0')
            WHERE code ~ '^RAK-[0-9]+$'
        SQL);

        DB::statement(<<<'SQL'
            UPDATE bins
            SET level = '01',
                position = LPAD((SUBSTRING(code FROM 5)::int % 100)::text, 2, '0'),
                code = '01-' || LPAD((SUBSTRING(code FROM 5)::int % 100)::text, 2, '0')
            WHERE code ~ '^BIN-[0-9]+$'
        SQL);

        Schema::table('racks', function (Blueprint $table) {
            $table->string('aisle', 1)->nullable(false)->change();
            $table->string('bay', 2)->nullable(false)->change();
            $table->unique(['warehouse_id', 'code']);
        });

        Schema::table('bins', function (Blueprint $table) {
            $table->string('level', 2)->nullable(false)->change();
            $table->string('position', 2)->nullable(false)->change();
            $table->unique(['rack_id', 'code']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('racks', function (Blueprint $table) {
            $table->dropUnique(['warehouse_id', 'code']);
            $table->dropColumn(['aisle', 'bay']);
        });

        Schema::table('bins', function (Blueprint $table) {
            $table->dropUnique(['rack_id', 'code']);
            $table->dropColumn(['level', 'position']);
        });
    }
};
