<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fondasi scoping gudang per role (F7.1) — tanpa mengubah perilaku:
     * - `roles.warehouse_scope_mode` default 'Semua' = tanpa batas (no-op).
     * - Pivot `user_warehouse` menampung gudang konkret per user untuk
     *   role ber-mode 'Terbatas'. Resolusi di App\Support\WarehouseScope (F7.2).
     */
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->string('warehouse_scope_mode', 16)->default('Semua')->index();
        });

        Schema::create('user_warehouse', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'warehouse_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_warehouse');

        Schema::table('roles', function (Blueprint $table) {
            $table->dropIndex(['warehouse_scope_mode']);
            $table->dropColumn('warehouse_scope_mode');
        });
    }
};
