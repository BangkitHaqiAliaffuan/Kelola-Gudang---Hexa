<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tujuan Barang Keluar = Customer | Departemen | Work Order.
        // work_order_id menggantikan project_id untuk dokumen baru (project_id
        // dipertahankan untuk histori + laporan arsip). WO menunjuk proyek
        // induknya sehingga info proyek tetap terlacak via relasi.
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->foreignId('work_order_id')->nullable()->after('project_id')->constrained('work_orders')->nullOnDelete();
            $table->index(['work_order_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropIndex(['work_order_id', 'type']);
            $table->dropForeign(['work_order_id']);
            $table->dropColumn('work_order_id');
        });
    }
};
