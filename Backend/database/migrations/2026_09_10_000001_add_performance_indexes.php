<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fase 1.1 — index performa skala menengah-besar (pgsql-only).
 *
 * - (item_id, warehouse_id, occurred_at): EXTEND index 2-kolom eksisting
 *   stock_movements_item_id_warehouse_id_index (di-drop, ter-cover prefix baru).
 * - (type, status, document_date DESC, id DESC): EXTEND index eksisting
 *   stock_documents_type_status_index (di-drop, ter-cover prefix baru).
 *   Index (document_date, type) eksisting DIBIARKAN (pola filter berbeda).
 * - Functional LOWER(): untuk lookup exact-match (barcode scan).
 * - pg_trgm GIN: untuk search LIKE %...% (B-tree tidak membantu leading-wildcard).
 *
 * Semua statement idempoten (IF NOT EXISTS) dan di-guard pgsql karena
 * fallback DB_CONNECTION sqlite tidak mendukung sintaks ini.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        // 1. Agregat demand OUT 30/60/90 hari (StockController::stockMinimum).
        DB::statement('CREATE INDEX IF NOT EXISTS idx_stock_movements_demand
            ON stock_movements (direction, movement_type, occurred_at)');

        // 2. Fold per-item scoped gudang (valuation/mutasi/stockCard/ledger).
        //    Urutan (item, warehouse, date) cocok pola WHERE aktual.
        DB::statement('CREATE INDEX IF NOT EXISTS idx_stock_movements_item_wh_date
            ON stock_movements (item_id, warehouse_id, occurred_at)');
        DB::statement('DROP INDEX IF EXISTS stock_movements_item_id_warehouse_id_index');

        // 3. Lookup barcode exact-match case-insensitive (ItemController::lookup).
        DB::statement('CREATE INDEX IF NOT EXISTS idx_items_lower_sku
            ON items (LOWER(sku))');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_items_lower_barcode
            ON items (LOWER(barcode))');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_items_lower_internal_barcode
            ON items (LOWER(internal_barcode))');

        // 4. Filter dokumen + ORDER document_date DESC, id DESC
        //    (StockDocumentController@index). Ganti index (type,status) lama.
        DB::statement('CREATE INDEX IF NOT EXISTS idx_stock_documents_type_status_date
            ON stock_documents (type, status, document_date DESC, id DESC)');
        DB::statement('DROP INDEX IF EXISTS stock_documents_type_status_index');

        // 5. Search substring (ItemController@index, StockController search).
        DB::statement('CREATE INDEX IF NOT EXISTS idx_items_name_trgm
            ON items USING gin (lower(name) gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_items_sku_trgm
            ON items USING gin (lower(sku) gin_trgm_ops)');

        // 6. Guard opname batch Fase 2 (EXISTS per item+bin+date).
        DB::statement('CREATE INDEX IF NOT EXISTS idx_stock_movements_opname_guard
            ON stock_movements (item_id, bin_id, occurred_at)');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS idx_stock_movements_opname_guard');
        DB::statement('DROP INDEX IF EXISTS idx_items_sku_trgm');
        DB::statement('DROP INDEX IF EXISTS idx_items_name_trgm');
        DB::statement('DROP INDEX IF EXISTS idx_stock_documents_type_status_date');
        DB::statement('CREATE INDEX IF NOT EXISTS stock_documents_type_status_index
            ON stock_documents (type, status)');
        DB::statement('DROP INDEX IF EXISTS idx_items_lower_internal_barcode');
        DB::statement('DROP INDEX IF EXISTS idx_items_lower_barcode');
        DB::statement('DROP INDEX IF EXISTS idx_items_lower_sku');
        DB::statement('DROP INDEX IF EXISTS idx_stock_movements_item_wh_date');
        DB::statement('CREATE INDEX IF NOT EXISTS stock_movements_item_id_warehouse_id_index
            ON stock_movements (item_id, warehouse_id)');
        DB::statement('DROP INDEX IF EXISTS idx_stock_movements_demand');
    }
};
