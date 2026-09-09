<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Hapus dokumen berstatus Menunggu Approval pada tipe yang tidak memiliki
     * alur approval (Penerimaan, Pengeluaran, Transfer Gudang, Retur ...) —
     * data anomali dari seeder lama. Hanya Stock Adjustment (submit-approval)
     * dan Stock Opname (submit-review) yang sah berstatus Menunggu Approval.
     */
    public function up(): void
    {
        $ids = DB::table('stock_documents')
            ->where('status', 'Menunggu Approval')
            ->whereNotIn('type', ['Stock Adjustment', 'Stock Opname'])
            ->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        // Movements dihapus eksplisit dulu: FK stock_movements.stock_document_id
        // adalah nullOnDelete, jadi menghapus dokumen saja akan meninggalkan
        // movement yatim. Lines ikut terhapus via cascadeOnDelete; referensi
        // source_document_id dari dokumen lain ter-null-kan otomatis.
        DB::table('stock_movements')->whereIn('stock_document_id', $ids)->delete();
        DB::table('stock_documents')->whereIn('id', $ids)->delete();
    }

    public function down(): void
    {
        // Baris anomali yang dihapus tidak dapat dikembalikan.
    }
};
