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
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rack_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('bin_id')->nullable()->constrained()->nullOnDelete();
            $table->string('direction'); // IN | OUT
            $table->unsignedInteger('qty');
            $table->string('movement_type'); // Penerimaan | Pengeluaran | Adjustment | Transfer | Opname | Saldo Awal
            $table->string('reference_no')->nullable();
            $table->string('partner')->nullable();
            $table->decimal('unit_cost', 15, 2);
            $table->string('pic')->nullable();
            $table->string('note')->nullable();
            $table->timestamp('occurred_at');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['item_id', 'occurred_at']);
            $table->index(['item_id', 'warehouse_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
