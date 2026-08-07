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
        Schema::table('users', function (Blueprint $table) {
            $table->string('code')->unique()->nullable()->after('id');
            $table->string('role')->default('Operator Gudang')->after('email');
            $table->boolean('is_active')->default(true)->after('role');
        });

        DB::table('users')->update([
            'code' => DB::raw("'USR-' || LPAD(id::text, 3, '0')"),
        ]);

        Schema::table('users', function (Blueprint $table) {
            $table->string('code')->nullable(false)->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'role', 'is_active']);
        });
    }
};
