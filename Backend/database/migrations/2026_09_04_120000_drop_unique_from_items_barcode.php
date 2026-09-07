<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Barcode produk (kemasan supplier) boleh sama di banyak barang —
     * identitas unik tetap dipegang sku + internal_barcode.
     * Resolusi scan yang ambigu ditangani via dialog disambiguasi di frontend.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique(['barcode']);
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->unique('barcode');
        });
    }
};
