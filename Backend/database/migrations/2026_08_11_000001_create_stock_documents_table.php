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
        Schema::create('stock_documents', function (Blueprint $table) {
            $table->id();
            $table->string('no')->unique();
            $table->string('type'); // Penerimaan | Pengeluaran | Transfer Gudang | Stock Adjustment | Stock Opname | Retur Pembelian | Retur Penjualan
            $table->string('status'); // Draft | Menunggu Approval | Selesai | Dibatalkan | Dalam Perjalanan
            $table->dateTime('document_date');
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('destination_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->string('partner')->nullable();
            $table->string('reference_no')->nullable();
            $table->string('pic')->nullable();
            $table->string('note')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'status']);
            $table->index(['document_date', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_documents');
    }
};
