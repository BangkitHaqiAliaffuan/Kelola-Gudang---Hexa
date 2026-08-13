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
        Schema::create('proc_doc_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proc_doc_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('line_no');
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('qty');
            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->decimal('price', 15, 2)->default(0); // estimasi harga satuan
            $table->timestamps();

            $table->unique(['proc_doc_id', 'line_no']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('proc_doc_lines');
    }
};
