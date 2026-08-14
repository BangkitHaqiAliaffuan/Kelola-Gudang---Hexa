<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Link Purchase Order ke Purchase Request sumbernya (kind=PR, status
     * Disetujui). Nullable — PO boleh berdiri sendiri (pembelian langsung).
     */
    public function up(): void
    {
        Schema::table('proc_docs', function (Blueprint $table) {
            $table->foreignId('source_proc_doc_id')->nullable()->after('warehouse_id')->constrained('proc_docs')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('proc_docs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_proc_doc_id');
        });
    }
};
