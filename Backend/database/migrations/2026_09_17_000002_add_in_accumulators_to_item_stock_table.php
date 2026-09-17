<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Akumulator IN per lokasi untuk incremental ledger O(1) (Fase 5.1).
     *
     * `unit_cost_avg` = in_cost / in_qty hanya berubah pada movement IN
     * (semantik fold StockLedger::rebuildForItem) — dengan akumulator ini
     * avg dapat dimajukan tanpa membaca ulang seluruh histori movement.
     * `rebuildForItem` menulis ulang kedua kolom ini (resync penuh),
     * sehingga reconcile tidak membuat akumulator basi.
     */
    public function up(): void
    {
        Schema::table('item_stock', function (Blueprint $table) {
            $table->unsignedBigInteger('in_qty')->default(0);
            $table->decimal('in_cost', 20, 2)->default(0);
        });

        // Backfill dari ledger: agregat IN-only per lokasi (order-independent,
        // exact — tidak melibatkan clamp maupun OUT). Baris tanpa movement IN
        // tetap pada default 0 (avg null seperti sebelumnya).
        DB::statement("
            UPDATE item_stock s
            SET in_qty = COALESCE(a.in_qty, 0),
                in_cost = COALESCE(a.in_cost, 0)
            FROM (
                SELECT item_id, warehouse_id, bin_id,
                       SUM(qty) AS in_qty,
                       SUM(qty * unit_cost) AS in_cost
                FROM stock_movements
                WHERE direction = 'IN'
                GROUP BY item_id, warehouse_id, bin_id
            ) a
            WHERE s.item_id = a.item_id
              AND s.warehouse_id = a.warehouse_id
              AND (s.bin_id = a.bin_id OR (s.bin_id IS NULL AND a.bin_id IS NULL))
        ");
    }

    public function down(): void
    {
        Schema::table('item_stock', function (Blueprint $table) {
            $table->dropColumn(['in_qty', 'in_cost']);
        });
    }
};
