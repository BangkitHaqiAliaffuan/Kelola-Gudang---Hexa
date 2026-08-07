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
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('sku')->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('name');
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->foreignId('sub_category_id')->nullable()->constrained()->nullOnDelete();

            // Reference columns for later master-data phases — no FK constraints yet.
            $table->string('brand_id')->nullable();
            $table->string('unit_id')->nullable();
            $table->string('preferred_supplier_id')->nullable();
            $table->string('default_warehouse_id')->nullable();
            $table->string('default_rack_id')->nullable();
            $table->string('default_bin_id')->nullable();

            $table->decimal('weight', 10, 2)->nullable();
            $table->string('dimension')->nullable();
            $table->decimal('cost', 15, 2)->default(0);
            $table->decimal('price', 15, 2)->default(0);
            $table->integer('min_stock')->default(0);
            $table->integer('max_stock')->nullable();
            $table->integer('lead_time')->default(0);

            // Denormalized for now — will normalize to ITEM_STOCK (item_id, warehouse_id, bin_id)
            // when the Persediaan module is built.
            $table->integer('stock')->default(0);
            $table->integer('reserved')->default(0);

            $table->string('status')->default('Aktif');
            $table->string('image_url')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};
