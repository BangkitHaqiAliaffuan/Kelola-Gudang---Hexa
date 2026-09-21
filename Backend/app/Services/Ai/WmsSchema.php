<?php

namespace App\Services\Ai;

/**
 * "Blind schema" untuk text-to-SQL (F8.5): katalog tabel/kolom domain WMS
 * yang BOLEH dirujuk AI. Tabel di luar daftar ini tidak disebutkan ke model;
 * validator + role DB read-only menahan bila model mencoba menebak.
 *
 * Sengaja ringkas (bukan dump skema penuh) → hemat token + batasi eksposur.
 */
final class WmsSchema
{
    /**
     * @return array<string, array<int, string>> tabel => kolom
     */
    public static function tables(): array
    {
        return [
            'items' => ['id', 'sku', 'barcode', 'name', 'category_id', 'sub_category_id', 'brand_id', 'unit_id', 'default_warehouse_id', 'cost', 'price', 'min_stock', 'max_stock', 'stock', 'reserved', 'status'],
            'item_stock' => ['item_id', 'warehouse_id', 'bin_id', 'stock', 'reserved', 'unit_cost_avg'],
            'warehouses' => ['id', 'code', 'name', 'city', 'is_active'],
            'bins' => ['id', 'code', 'name', 'rack_id'],
            'racks' => ['id', 'code', 'name', 'warehouse_id'],
            'stock_documents' => ['id', 'no', 'type', 'status', 'document_date', 'warehouse_id', 'destination_warehouse_id', 'partner', 'reference_no', 'posted_at'],
            'stock_document_lines' => ['id', 'document_id', 'item_id', 'qty', 'unit_cost', 'unit_price'],
            'stock_movements' => ['id', 'item_id', 'warehouse_id', 'bin_id', 'direction', 'qty', 'unit_cost', 'occurred_at', 'document_id'],
            'suppliers' => ['id', 'code', 'name'],
            'customers' => ['id', 'code', 'name'],
            'categories' => ['id', 'name'],
            'units' => ['id', 'name'],
        ];
    }

    /**
     * Deskripsi skema ringkas (Bahasa Indonesia) untuk disisipkan ke prompt.
     */
    public static function describe(): string
    {
        $lines = [];
        foreach (self::tables() as $table => $cols) {
            $lines[] = "- {$table}(".implode(', ', $cols).')';
        }

        return "Skema database (PostgreSQL, hanya tabel ini yang boleh dirujuk).\n"
            .'PENTING: nama kolom memakai BAHASA INGGRIS — gunakan `name` (bukan `nama`), '
            .'`stock` (bukan `stok`), `min_stock` (bukan `stok_minimum`/`minimum`), '
            ."`max_stock`, `qty` (bukan `jumlah`), `warehouse_id`. JANGAN menerjemahkan nama kolom.\n"
            ."Contoh benar: SELECT name, sku, stock, min_stock FROM items WHERE stock < min_stock ORDER BY (min_stock - stock) DESC.\n"
            .'DILARANG query katalog sistem (information_schema, pg_catalog, pg_*) — tabel itu akan ditolak '
            ."validator dan tidak perlu: seluruh tabel & kolom yang boleh dipakai sudah tercantum di daftar berikut.\n"
            ."Tabel yang tersedia:\n".implode("\n", $lines);
    }

    /**
     * Daftar nama tabel yang diizinkan (untuk validasi rujukan).
     *
     * @return array<int, string>
     */
    public static function allowedTables(): array
    {
        return array_keys(self::tables());
    }
}
