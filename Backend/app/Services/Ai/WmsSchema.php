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
            'stock_documents' => ['id', 'no', 'type', 'status', 'document_date', 'warehouse_id', 'destination_warehouse_id', 'customer_id', 'department_id', 'project_id', 'work_order_id', 'partner', 'reference_no', 'posted_at'],
            'stock_document_lines' => ['id', 'document_id', 'line_no', 'item_id', 'qty', 'from_bin_id', 'to_bin_id', 'unit_cost', 'unit_price'],
            'stock_movements' => ['id', 'item_id', 'warehouse_id', 'bin_id', 'direction', 'movement_type', 'qty', 'unit_cost', 'occurred_at', 'stock_document_id'],
            'suppliers' => ['id', 'code', 'name'],
            'customers' => ['id', 'code', 'name', 'segment'],
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
            ."Nilai kolom teks (pakai persis, case-sensitive): stock_documents.type ∈ {Penerimaan, Pengeluaran, Transfer Gudang, Stock Adjustment, Stock Opname, Retur Pembelian, Retur Penjualan}; stock_documents.status ∈ {Draft, Menunggu Approval, Selesai, Dibatalkan, Dalam Perjalanan}; stock_movements.direction ∈ {IN, OUT}.\n"
            .'Semantik angka (WAJIB): items.cost = harga BELI, items.price = harga JUAL (jangan pakai price untuk nilai stok). '
            .'QTY BERTANDA BEDA PER TABEL: stock_document_lines.qty SIGNED (baris Pengeluaran NEGATIF by design — agregat qty/nilai SELALU dengan ABS(), mis. SUM(ABS(l.qty * l.unit_price))); '
            ."stock_movements.qty SELALU ≥0 dengan flag stock_movements.direction (IN/OUT). Nilai negatif di hasil = rumus lupa ABS(), BUKAN data kotor.\n"
            ."Contoh benar: SELECT name, sku, stock, min_stock FROM items WHERE stock < min_stock ORDER BY (min_stock - stock) DESC.\n"
            ."Contoh agregasi dokumen (perhatikan kolom jenis = `type`, BUKAN `document_type`): SELECT i.name, SUM(ABS(l.qty)) AS total_qty FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.type = 'Pengeluaran' AND d.status = 'Selesai' GROUP BY i.name ORDER BY total_qty DESC LIMIT 10.\n"
            ."Contoh per segmen customer (kolom customers.segment ADA — Retail/Distributor/Proyek/Korporat): SELECT c.segment, SUM(ABS(l.qty * l.unit_price)) AS total FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id LEFT JOIN customers c ON c.id = d.customer_id WHERE d.type = 'Pengeluaran' AND d.status = 'Selesai' GROUP BY c.segment ORDER BY total DESC.\n"
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
