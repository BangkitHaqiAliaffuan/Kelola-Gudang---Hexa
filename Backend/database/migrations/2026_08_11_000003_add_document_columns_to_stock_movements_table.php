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
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('stock_document_id')->nullable()->after('created_by')->constrained('stock_documents')->nullOnDelete();
            $table->integer('line_no')->nullable()->after('stock_document_id');

            // Links a Transfer Gudang OUT movement to its mirror IN movement.
            $table->foreignId('pair_id')->nullable()->after('line_no')->constrained('stock_movements')->nullOnDelete();

            $table->index('stock_document_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pair_id');
            $table->dropConstrainedForeignId('stock_document_id');
            $table->dropColumn('line_no');
        });
    }
};
