<?php

namespace App\Services\Ai;

use App\Models\RolePermission;
use App\Support\RoleAccessLevels;

/**
 * Allowlist TERTUTUP tool yang boleh dipakai AI Assistant (F8.2).
 *
 * Prinsip (permintaan: "batasi akses AI pada beberapa hal, fokus lingkup
 * KelolaGudang"):
 * - Hanya tool terdaftar di sini yang bisa dipanggil model (deny-by-default).
 * - Setiap tool membawa gate `(module, level)`; dicek ke role user sebelum
 *   eksekusi (AI mewarisi izin user — tak pernah punya izin sendiri).
 * - Tool tulis RISK medium+ → wajib konfirmasi (ditangani orchestrator).
 * - AI TIDAK pernah diberi akses: shell/filesystem/jaringan/settings tulis,
 *   tabel di luar domain WMS, atau tool di luar daftar ini.
 *
 * Handler eksekusi berada di AiToolHandler (memakai route/service NYATA
 * sehingga RBAC + warehouse scope + audit tetap berlaku).
 */
final class ToolRegistry
{
    /**
     * @return array<string, AiTool> keyed by nama tool
     */
    public static function all(): array
    {
        $tools = [
            // ---------- READ: Master / lookup ----------
            new AiTool(
                name: 'cari_barang',
                description: 'Cari barang (item) berdasarkan kata kunci nama, SKU, atau barcode. Mengembalikan daftar ringkas (id, sku, nama, satuan, stok_total, stok_minimum, di_bawah_minimum). Hasil sudah memuat stok minimum, jadi untuk pertanyaan "barang yang stoknya di bawah minimum" cukup bandingkan stok_total < stok_minimum dari hasil tool ini — tidak perlu query analitik. Pakai ini DULU sebelum membuat dokumen agar item_id valid. Bila hasilnya banyak varian, JANGAN menebak — tampilkan daftar (nama + SKU) dan minta pengguna memilih.',
                schema: [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Kata kunci nama/SKU/barcode'],
                        'limit' => ['type' => 'integer', 'description' => 'Maks hasil (default 10, maks 50)'],
                    ],
                    'required' => ['query'],
                ],
                module: 'Master Data',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'stok_barang',
                description: 'Lihat stok barang per gudang (dan bin). Filter oleh user Terbatas otomatis diterapkan server.',
                schema: [
                    'type' => 'object',
                    'properties' => [
                        'item_id' => ['type' => 'integer', 'description' => 'ID barang (dari cari_barang)'],
                        'item_ids' => ['type' => 'array', 'items' => ['type' => 'integer'], 'description' => 'Alternatif: banyak ID barang'],
                        'warehouse_id' => ['type' => 'integer', 'description' => 'Filter satu gudang (opsional)'],
                    ],
                    'required' => [],
                ],
                module: 'Persediaan',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'daftar_gudang',
                description: 'Daftar gudang yang boleh diakses user (sudah ter-scope). Untuk menentukan warehouse_id saat membuat dokumen.',
                schema: ['type' => 'object', 'properties' => (object) [], 'required' => []],
                module: 'Master Data',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'daftar_dokumen_stok',
                description: 'Cari dokumen stok (Barang Masuk/Keluar/Transfer/Retur/Opname) dengan filter opsional. Hasil ter-scope gudang user.',
                schema: [
                    'type' => 'object',
                    'properties' => [
                        'search' => ['type' => 'string'],
                        'type' => ['type' => 'string', 'description' => 'Penerimaan|Pengeluaran|Transfer Gudang|Retur Pembelian|Retur Penjualan|Stock Opname|Stock Adjustment'],
                        'status' => ['type' => 'string', 'description' => 'Draft|Menunggu Approval|Selesai|Dibatalkan'],
                        'warehouse_id' => ['type' => 'integer'],
                        'limit' => ['type' => 'integer'],
                    ],
                    'required' => [],
                ],
                module: 'Persediaan',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'daftar_supplier',
                description: 'Cari supplier (untuk pengisian partner dokumen penerimaan).',
                schema: [
                    'type' => 'object',
                    'properties' => ['query' => ['type' => 'string'], 'limit' => ['type' => 'integer']],
                    'required' => [],
                ],
                module: 'Master Data',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'daftar_customer',
                description: 'Cari customer (tujuan barang keluar).',
                schema: [
                    'type' => 'object',
                    'properties' => ['query' => ['type' => 'string'], 'limit' => ['type' => 'integer']],
                    'required' => [],
                ],
                module: 'Master Data',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),
            new AiTool(
                name: 'analisis_data',
                description: 'Analitik lanjutan: ubah pertanyaan menjadi query SQL SELECT (baca saja) atas skema WMS untuk agregasi/tren. Contoh: total nilai stok per gudang, tren barang keluar per bulan, 10 barang paling sering keluar. Gunakan NAMA KOLOM BAHASA INGGRIS sesuai skema (mis. items.name, items.stock, items.min_stock — BUKAN `nama`/`stok`). PENTING: kolom jenis dokumen di stock_documents bernama `type` (BUKAN `document_type`) — contoh benar: SELECT i.name, SUM(l.qty) AS total_qty FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.type = \'Pengeluaran\' AND d.status = \'Selesai\' GROUP BY i.name ORDER BY total_qty DESC LIMIT 10. JANGAN query information_schema/pg_catalog (akan ditolak). Hasil OTOMATIS dibatasi ke gudang yang boleh diakses user (jangan tambah filter gudang sendiri); untuk user terbatas, gunakan SELECT tunggal tanpa WITH/UNION/subquery. Filter tahun pakai EXTRACT(YEAR FROM document_date) = 2026 atau rentang document_date >= ... AND ... (PostgreSQL TIDAK punya fungsi YEAR(); kolom document_date BOLEH dipakai). "Nilai transaksi" bukan kolom — hitung SUM(ABS(l.qty * l.unit_cost)) untuk barang masuk / SUM(ABS(l.qty * l.unit_price)) untuk barang keluar via JOIN stock_document_lines l ON l.document_id = d.id lalu GROUP BY barang (qty baris Pengeluaran NEGATIF by design — TANPA ABS() total jadi negatif raksasa; itu rumus salah, bukan data kotor). DILARANG query eksplorasi skema (SELECT * LIMIT 1, cek MIN/MAX tanggal, tebak kolom): skema di system prompt sudah lengkap dan terpercaya — jawab LANGSUNG dengan SATU query final.',
                schema: [
                    'type' => 'object',
                    'properties' => [
                        'sql' => ['type' => 'string', 'description' => 'Query SELECT tunggal (tanpa titik-koma ganda) atas tabel skema WMS.'],
                        'penjelasan' => ['type' => 'string', 'description' => 'Penjelasan singkat maksud query'],
                    ],
                    'required' => ['sql'],
                ],
                module: 'Laporan',
                level: 'Baca',
                risk: AiTool::RISK_LOW,
                readOnly: true,
            ),

            // ---------- WRITE (Draft-only, wajib konfirmasi) ----------
            new AiTool(
                name: 'buat_draft_dokumen_stok',
                description: 'Membuat DRAFT dokumen stok (TIDAK memposting). v1 hanya: Penerimaan (barang masuk), Pengeluaran (barang keluar), Transfer Gudang. Status selalu Draft; posting/approval tetap dilakukan manusia. HANYA panggil bila SEMUA slot wajib sudah lengkap & dikonfirmasi: tipe, gudang asal (dalam lingkup user, pakai daftar_gudang), barang spesifik (item_id valid — pakai cari_barang dulu), qty ≥ 1, rekanan/partner (WAJIB untuk Pengeluaran), gudang tujuan (WAJIB & beda untuk Transfer). Bila ada yang kurang, JANGAN panggil tool ini — tanyakan klarifikasi dulu.',
                schema: [
                    'type' => 'object',
                    'properties' => [
                        'type' => ['type' => 'string', 'enum' => ['Penerimaan', 'Pengeluaran', 'Transfer Gudang']],
                        'warehouse_id' => ['type' => 'integer', 'description' => 'Gudang asal (harus dalam lingkup user)'],
                        'destination_warehouse_id' => ['type' => 'integer', 'description' => 'WAJIB untuk Transfer Gudang'],
                        'document_date' => ['type' => 'string', 'description' => 'Tanggal ISO (YYYY-MM-DD). Kosong = hari ini.'],
                        'partner' => ['type' => 'string', 'description' => 'Nama supplier/customer/tujuan (Pengeluaran butuh ini)'],
                        'reference_no' => ['type' => 'string'],
                        'note' => ['type' => 'string'],
                        'lines' => [
                            'type' => 'array',
                            'minItems' => 1,
                            'maxItems' => 20,
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'item_id' => ['type' => 'integer'],
                                    'qty' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 10000],
                                    'from_bin_id' => ['type' => 'integer', 'description' => 'Bin asal (opsional; kosong = lantai/gudang)'],
                                    'to_bin_id' => ['type' => 'integer', 'description' => 'Bin tujuan (Penerimaan/Transfer)'],
                                    'unit_cost' => ['type' => 'number'],
                                ],
                                'required' => ['item_id', 'qty'],
                            ],
                        ],
                    ],
                    'required' => ['type', 'warehouse_id', 'lines'],
                ],
                module: 'Persediaan',
                level: 'Tulis',
                risk: AiTool::RISK_MEDIUM,
                readOnly: false,
            ),
        ];

        $keyed = [];
        foreach ($tools as $tool) {
            $keyed[$tool->name] = $tool;
        }

        return $keyed;
    }

    public static function find(string $name): ?AiTool
    {
        return self::all()[$name] ?? null;
    }

    /**
     * Tool yang boleh dipakai role tertentu (sudah lolos gate modul/level).
     * Dipakai untuk membangun daftar tool yang dikirim ke model sehingga AI
     * tak pernah "melihat" tool di luar izin user.
     *
     * @return array<string, AiTool>
     */
    public static function forRole(string $role): array
    {
        $access = collect(RolePermission::accessForRole($role));

        return array_filter(
            self::all(),
            function (AiTool $tool) use ($access) {
                $entry = $access->firstWhere('module', $tool->module);
                if (! $entry) {
                    return false;
                }

                $have = RoleAccessLevels::LEVEL_RANK[$entry['level']] ?? 0;
                $need = RoleAccessLevels::LEVEL_RANK[$tool->level] ?? 99;

                return $have >= $need;
            }
        );
    }

    /**
     * Definisi OpenAI untuk sekumpulan tool (yang sudah difilter izin).
     *
     * @param  array<string, AiTool>  $tools
     * @return array<int, array<string, mixed>>
     */
    public static function definitions(array $tools): array
    {
        return array_values(array_map(fn (AiTool $t) => $t->definition(), $tools));
    }
}
