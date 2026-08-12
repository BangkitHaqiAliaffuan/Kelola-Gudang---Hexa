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
        Schema::create('stock_document_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained('stock_documents')->cascadeOnDelete();
            $table->integer('line_no');
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            // Signed: BM/BK/ADJ/TF positive = masuk, negative = keluar. Opname memakai system_qty/actual_qty.
            $table->integer('qty')->nullable();
            $table->unsignedInteger('system_qty')->nullable();
            $table->unsignedInteger('actual_qty')->nullable();
            $table->foreignId('from_bin_id')->nullable()->constrained('bins')->nullOnDelete();
            $table->foreignId('to_bin_id')->nullable()->constrained('bins')->nullOnDelete();
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->string('note')->nullable();

            $table->unique(['document_id', 'line_no']);
            $table->index('item_id');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_document_lines');
    }
};
