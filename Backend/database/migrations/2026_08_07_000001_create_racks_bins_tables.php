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
        Schema::create('racks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('bins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rack_id')->constrained('racks')->cascadeOnDelete();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('default_rack_id');
            $table->foreignId('default_rack_id')->nullable()->after('default_warehouse_id')->constrained('racks')->nullOnDelete();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('default_bin_id');
            $table->foreignId('default_bin_id')->nullable()->after('default_rack_id')->constrained('bins')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['default_rack_id']);
            $table->dropColumn('default_rack_id');
            $table->string('default_rack_id')->nullable();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['default_bin_id']);
            $table->dropColumn('default_bin_id');
            $table->string('default_bin_id')->nullable();
        });

        Schema::dropIfExists('bins');
        Schema::dropIfExists('racks');
    }
};
