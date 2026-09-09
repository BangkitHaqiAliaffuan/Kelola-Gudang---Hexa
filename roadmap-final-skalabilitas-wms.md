# ROADMAP FINAL SKALABILITAS JANGKA PANJANG — Kelola Gudang Pro
**Target desain**: ~50.000 SKU · ~1.000.000 movement/tahun · dokumen ratusan baris · multi-gudang · multi-operator paralel
**Tanggal**: 2026-09-09 · **Status**: Final, siap dieksekusi bertahap
**Sumber**: `blueprint-roadmap-skalabilitas-wms.md` (Antigravity) + crosscheck faktual per `file:line` + koreksi kritis.
**Luar cakupan**: infra/deploy (ngrok, Vercel) — ditunda, fokus murni kode.
**Aturan eksekusi**: satu fase dalam satu waktu; tiap fase selesai → `composer test` + `npm run lint` + `npx tsc --noEmit` + `npm test` hijau sebelum lanjut. DILARANG `migrate:fresh` di DB dev (lihat root `AGENTS.md`).

---

## 0. Keputusan desain yang sudah dikunci (jangan dibuka lagi saat eksekusi)

| # | Keputusan | Alasan |
|---|---|---|
| K1 | Counter penomoran O(1) via `document_counters`; increment di dalam `DB::transaction` CodeGenerator (bersarang sebagai savepoint bila pemanggil punya outer txn → burn ikut rollback/gapless; standalone → gap kecil diterima). Jangan pisahkan ke transaksi autocommit di luar outer txn (membalik urutan lock → deadlock, terbukti di audit 1.3) | Menyamakan perilaku dengan sequence PG tanpa profil deadlock baru. |
| K1b | Kolom key bernama `counter_key` (bukan `key` — reserved-ish); cakupan `(scope, counter_key)`; `needsHeal()` (cek tabrakan + nomor-lebih-tinggi berindeks) + fallback legacy-max menjaga kontrak monotonik max+1 untuk nomor manual di atas counter | Menutup regresi semantik MAX-scan yang ditemukan test `ItemApiTest::test_store_auto_generates_incremental_internal_barcode`. |
| K2 | Counter mencakup **yearly DAN non-yearly** via key `(scope, key)` | Blueprint hanya cover `nextYearly`; 14 call-site `next()` (PRJ/SUP/DEP/USR/VDR/UNT/IB/KAT/MRK/SUB/CUS/GDG) ikut dimigrasi. RAK/BIN tidak tersentuh (tidak memakai `CodeGenerator` — kode dirakit dari komponen lokasi). |
| K3 | Migrasi counter **wajib backfill** dari `MAX()` nomor eksisting per key | Tanpa ini → duplikat `unique(no)` pada hari pertama. |
| K4 | Batch guard opname **wajib mempertahankan predikat bin** (NULL-aware) | Versi tanpa bin = over-blocking opname sah (false positive). |
| K5 | Total valuasi global **harus se-metode dengan halaman** (FIFO/Average/Max) | `SUM(stock×unit_cost_avg)` hanya = Average; total FIFO/Max dihitung dengan metodenya atau dilabeli eksplisit. |
| K6 | Batas `per_page`: **100** untuk index umum, **500** khusus laporan agregat; frontend `DOCS_PER_PAGE=10000` turun mengikuti | Menyelesaikan inkonsistensi 100-vs-500 di blueprint. |
| K7 | Dashboard overview: **satu endpoint agregat + gate per-modul di server** | Endpoint lintas-modul tidak muat di satu gate `role.access:*` — server memfilter bagian agregat mengikuti `access` user (atau 403 per bagian). |
| K8 | Search `LIKE %…%` → `pg_trgm`; equality `LOWER()` → functional B-tree | B-tree tidak membantu leading-wildcard. Keduanya dipasang, bukan salah satu. |

---

## FASE 1 — Fondasi Database & Counter (risiko rendah, efek langsung)

### 1.1 Migrasi index performa (baru, satu file migrasi)
**File baru**: `Backend/database/migrations/YYYY_MM_DD_HHMMSS_add_performance_indexes.php`
**File dibaca saat eksekusi**: index eksisting di `2026_08_11_000001_create_stock_documents_table.php:30-31`, `2026_08_10_000002_create_stock_movements_table.php:32-33`.

```sql
-- 1. Agregat demand 30/60/90 hari (stockMinimum: StockController.php:108-115)
CREATE INDEX idx_stock_movements_demand
    ON stock_movements (direction, movement_type, occurred_at);
-- 2. Fold per-item scoped gudang (valuation/mutasi/stockCard/ledger)
--    URUTAN (item, warehouse, date) — cocok pola WHERE aktual, BUKAN (warehouse, item, date)
CREATE INDEX idx_stock_movements_item_wh_date
    ON stock_movements (item_id, warehouse_id, occurred_at);
-- 3. Lookup barcode exact-match (ItemController.php:73-77)
CREATE INDEX idx_items_lower_sku ON items (LOWER(sku));
CREATE INDEX idx_items_lower_barcode ON items (LOWER(barcode));
CREATE INDEX idx_items_lower_internal_barcode ON items (LOWER(internal_barcode));
-- 4. Filter dokumen: EXTEND index (type,status) eksisting, JANGAN tambah di sampingnya
DROP INDEX IF EXISTS stock_documents_type_status_index; -- nama aktual Laravel (bukan idx_stock_documents_type_status)
CREATE INDEX idx_stock_documents_type_status_date
    ON stock_documents (type, status, document_date DESC, id DESC);
-- 5. Search substring: butuh ekstensi pg_trgm (B-tree LOWER tidak cukup untuk LIKE %x%)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_items_name_trgm ON items USING gin (lower(name) gin_trgm_ops);
CREATE INDEX idx_items_sku_trgm ON items USING gin (lower(sku) gin_trgm_ops);
-- 6. Guard opname batch (Fase 2): cover kolom yang dipakai EXISTS
CREATE INDEX idx_stock_movements_opname_guard
    ON stock_movements (item_id, bin_id, occurred_at);
```
**Kandidat drop setelah verifikasi EXPLAIN**: `(document_date, type)` eksisting (urutan terbalik vs filter aktual).
**Kriteria lulus**: `EXPLAIN ANALYZE` untuk query 1–6 memakai index scan; `php artisan migrate` + rollback bersih di DB dev.

### 1.2 Batas `per_page` di semua index mentah
**File terdampak**: `ItemController.php:50`, `StockController.php:61-63,117`, `StockDocumentController.php:34,69`, `ProcDocController.php:44-50,92`, `UserController.php:31`, + seluruh master controller (`Category/SubCategory/Merk/Unit/Warehouse/Rack/Bin/Supplier/Customer/Vendor/Department/Project/WorkOrder` — pola `paginate((int)$request->query('per_page',20))` mentah).
**Spesifikasi**: validasi `'per_page' => 'nullable|integer|min:1|max:100'` (K6); laporan agregat tetap `max:500` (`StockController.php:306`, `LaporanMutasiRequest.php:23`, `CostDriftRequest.php:20` — sudah ada, jangan diubah).
**Kriteria lulus**: `?per_page=1000000` → 422; default 20 tidak berubah; semua test index hijau.

### 1.3 Migrasi `CodeGenerator` → counter table (yearly + non-yearly, dengan backfill)
**File terdampak**: `Backend/app/Support/CodeGenerator.php` (68 baris — baca utuh), call-site yearly (`StockDocumentController.php:239`, `StockDocumentService.php:128`, `ProcDocController.php:109`, `WorkOrderController.php:50`) + 14 call-site `next()` non-yearly.
**File baru**: migrasi `create_document_counters_table`:
```sql
CREATE TABLE document_counters (
    scope VARCHAR(30) NOT NULL,   -- 'yearly' | 'plain'
    key   VARCHAR(60) NOT NULL,   -- yearly: 'BM/2026' ; plain: 'PRJ'
    current_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, key)
);
```
**Spesifikasi**:
- `nextYearly(model, prefix, column, width)` → kunci `('yearly', "$prefix/$year")`; `next(model, prefix, column)` → kunci `('plain', $prefix)`. Width dipertahankan per call-site (5 dokumen stok, 4 PR/PO/WO, 3 kode master).
- Increment = `INSERT ... ON CONFLICT (scope,key) DO UPDATE SET current_number = document_counters.current_number + 1 RETURNING current_number` dalam **transaksi pendek sendiri** (K1 — terima gap).
- **Backfill wajib dalam migrasi yang sama**: isi `current_number` dari `MAX()` numerik eksisting per key (parse suffix setelah `/` atau `-`; abaikan baris tak-terparse secara eksplisit/log). Tanpa ini = duplikat.
- `str_pad` melebar >width dipertahankan (kompatibel perilaku lama), tapi tambahkan `Log::warning` saat overflow width agar terpantau.
**Kriteria lulus**: test konkurensi 100× insert paralel per prefix → 100 nomor unik, tanpa deadlock, p95 <500ms; test rollback → gap diterima & terdokumentasi; seeder + seluruh suite hijau.

### 1.4 Sanctum expiry + prune (sesuai dok resmi Laravel 13)
**File terdampak**: `Backend/config/sanctum.php:53`, `AuthController.php:37`, `routes/console.php` (tambah `use Illuminate\Support\Facades\Schedule;`).
**Spesifikasi** (verbatim pola resmi):
- `config/sanctum.php`: `'expiration' => 1440` (24 jam).
- `AuthController::login`: `$user->tokens()->where('created_at', '<', now()->subHours(24))->delete();` sebelum `createToken`.
- `routes/console.php`: `Schedule::command('sanctum:prune-expired --hours=24')->daily();`
- Catatan: tanpa `expiration`, prune adalah no-op (`expires_at` selalu NULL) — ketiga langkah satu paket, tidak boleh setengah.
**Kriteria lulus**: login → `expires_at` terisi +24 jam; token lama (>24 jam) terhapus saat login berikutnya; `php artisan sanctum:prune-expired --hours=24` menghapus token kedaluwarsa; catatan: jadwal `daily()` butuh scheduler OS (cron) di prod — dokumentasikan.

---

## FASE 2 — Mesin Query Backend (eliminasi full-load PHP)

### 2.1 `StockController::valuation()` → agregat SQL + paginasi server
**File**: `Backend/app/Http/Controllers/StockController.php:302-416`.
**Spesifikasi**:
- Paginasi `items` di SQL dulu (`paginate`, order `items.name`), lalu hitung hanya untuk id di halaman aktif.
- **Average**: langsung dari `item_stock` (`SUM(stock)`, rata-rata tertimbang `unit_cost_avg`) — tanpa menyentuh `stock_movements`.
- **FIFO/Max**: fold movement hanya untuk id halaman (20–50 SKU), ganti `array_shift` dengan antrean ber-pointer (indeks head, tanpa geser array).
- Total global per K5: Average via `SUM(stock×unit_cost_avg)` satu query; FIFO/Max via metode yang sama pada scope filter (atau labeli "Total (Average)" bila memakai jalan pintas).
**Kriteria lulus**: DB seed 50rb item + 1jt movement (skala target, siapkan sekali) → halaman valuation p95 <3 dtk, peak PHP <256MB; angka FIFO/Avg/Max identik dengan implementasi lama pada dataset uji (test perbandingan).

### 2.2 `LaporanController::mutasi()` → agregat SQL per halaman item
**File**: `Backend/app/Http/Controllers/LaporanController.php:34-167`.
**Spesifikasi**: paginasi `Item` di SQL; untuk id halaman jalankan satu agregat `GROUP BY item_id` (saldo_awal/masuk/keluar/saldo_akhir via `CASE` atas `direction IN/OUT` — nilai enum terkonfirmasi) dengan filter `warehouse_id` opsional + rentang `occurred_at`. Gabung ke resource. Hapus `->get()` + `groupBy` collection + fold FIFO PHP untuk kolom agregat (kolom kartu FIFO per-baris bila ada, ikut pola 2.1).
**Kriteria lulus**: sama dengan 2.1 (p95 <3 dtk, peak <256MB, angka identik).

### 2.3 Analitik → `GROUP BY` SQL, hapus O(T×D) & N+1
**File**: `Backend/app/Http/Controllers/LaporanController.php` — seksi `keluarAnalytics:470-471,517-527`, `transaksiAnalytics:870-871`.
**Spesifikasi**: aktivitas-terakhir per tujuan/pihak via `GROUP BY key, MAX(document_date)` di SQL (bukan `$posted->filter` per kunci); serapan per proyek via satu join `work_orders`↔lines (bukan query per proyek). Bagian single-pass yang sudah ada (omzet, retur, varians) tidak disentuh.
**Kriteria lulus**: periode 50rb dokumen → p95 <5 dtk; angka aktivitas/serapan identik dengan implementasi lama pada dataset uji.

### 2.4 Batch guard opname (SETARA semantik, bukan longgar)
**File**: `Backend/app/Services/StockDocumentService.php:179-227`.
**Spesifikasi**: satu query menggantikan N×`EXISTS`, dengan predikat per `(item_id, from_bin_id NULL-aware)`:
- Kelompokkan lines per pasangan `(item_id, from_bin_id)`; untuk `from_bin_id NULL` → `whereNull('bin_id')`; sisanya → `whereIn` komposit `(item_id, bin_id)`.
- Syarat waktu (`created_at > frozen OR occurred_at > frozen`, `frozen = frozen_at ?? created_at`) + eksklusi dokumen sendiri (`stock_document_id IS NULL OR != id`) dipertahankan persis.
- Kembalikan **pasangan yang melanggar** (untuk pesan `labelsFor()` per-baris/bin), bukan hanya `item_id` unik.
- Index pendukung: `idx_stock_movements_opname_guard` (Fase 1.1 butir 6).
**Kriteria lulus**: matriks test guard lama vs baru identik (termasuk kasus multi-bin: movement di bin lain TIDAK memblokir; movement di bin sama MEMBLOKIR; `from_bin_id NULL` vs bin terisi dibedakan); opname 500 baris → guard <2 dtk.

### 2.5 FIFO `array_shift` → antrean ber-pointer (semua fold)
**File**: `StockController.php:208-216,360-369`, `LaporanController.php:101-109`.
**Spesifikasi**: ganti `array_shift($fifoLayers)` dengan indeks `$head` maju (atau `SplQueue` bila lebih jelas); tidak ada perubahan hasil — murni kompleksitas O(n²)→O(n).
**Kriteria lulus**: benchmark fold item 50rb movement: sebelum vs sesudah (target >10× lebih cepat); test FIFO hijau.

---

## FASE 3 — Validasi Massal, Ledger Tulis & Batas Import

### 3.1 Batch FK validation (tanpa mengorbankan pesan error sepenuhnya)
**File**: `Backend/app/Http/Requests/StoreStockDocumentRequest.php` (aturan `lines.*` di `:120,150-169`; `prepareForValidation :26-58`; `after() :181-604`).
**Spesifikasi**: hapus `Rule::exists` per-elemen untuk `item_id/from_bin_id/to_bin_id/source_line_id`; ganti dengan `whereIn` batch di `after()` + petakan kembali ke indeks baris yang gagal (pertahankan pesan per-baris — jangan turun ke satu pesan global "ada barang tidak valid"). `prepareForValidation` (lookup Customer/Department/Project by name) ikut di-batch bila memungkinkan.
**Kriteria lulus**: dokumen 200 baris → validasi <1 dtk (dari N×~4 query menjadi ~4 query); pesan error tetap menunjuk nomor baris; suite validasi hijau.

### 3.2 `StockLedger`: pre-fetch bin + siapkan jalur incremental
**File**: `Backend/app/Services/StockLedger.php:55-76`.
**Spesifikasi**: (a) pre-fetch `Bin::with('rack')->whereIn('id', $validBinIds)->keyBy('id')` sebelum loop tulis — ekuivalen semantik (rack hanya untuk guard drift). (b) Desain (belum implementasi penuh bila waktu sempit): rebuild incremental per lokasi tersentuh dokumen (delta, bukan fold seluruh history) — tandai sebagai pekerjaan lanjutan Fase 3b bila posting item bersejarah masih >5 dtk setelah (a).
**Kriteria lulus**: posting item multi-bin tanpa N+1 (hitung query per rebuild turun); tidak ada perubahan angka ledger (test konsistensi seeder hijau).

### 3.3 `bulkImport`: batas + chunk + transaksi per-chunk
**File**: `Backend/app/Http/Controllers/ItemController.php:306-559`.
**Spesifikasi**: `'items' => 'required|array|min:1|max:1000'`; ganti `pluck(sku)` seluruh tabel dengan `whereIn(sku)` per chunk (500); `insert` batch per chunk; transaksi per-chunk (bukan 1 transaksi untuk 5000 baris); respons error tetap per-indeks. Frontend (`import-barang-dialog.tsx`) mengirim otomatis per-chunk 500 dengan progres (lihat Fase 4.4).
**Kriteria lulus**: import 5000 baris → selesai tanpa OOM/timeout; gagal di chunk N tidak me-rollback chunk lain yang sukses (laporan per-chunk); advisory-lock tidak menahan seluruh durasi.

### 3.4 `syncCost()`: transaksi + batas + batch
**File**: `Backend/app/Http/Controllers/ItemController.php:279-304`.
**Spesifikasi**: batasi `ids` (`max:500`), bungkus `DB::transaction`, agregat per-chunk (ganti N×`SUM`+`update` dengan 1 agregat `GROUP BY` + 1 `upsert`).
**Kriteria lulus**: 500 ids <5 dtk; gagal = rollback penuh (tidak ada sinkronisasi parsial).

### 3.5 Filter `status` CASE → kolom turunan (bila Fase 2 belum cukup)
**File**: `Backend/app/Http/Controllers/StockController.php:49-59`.
**Spesifikasi**: bila `stock` masih lambat di skala target setelah index Fase 1, tambahkan kolom `stock_status` terdenormalisasi pada `item_stock` (dirawat `StockLedger`) + index — ganti `CASE...END = ?` dengan equality biasa. Ini pekerjaan bersyarat: ukur dulu, eksekusi hanya bila perlu.

---

## FASE 4 — Frontend Scalability

### 4.1 Endpoint `GET /api/dashboard/overview` + refactor `routes/index.tsx`
**File baru**: `Backend/app/Http/Controllers/DashboardController.php`. **File terdampak**: `Frontend/src/routes/index.tsx:143-237` (8 query paralel: `useItems`, `useWarehouses`, `useStockValuation`, 3× `useStockDocuments`, `useStockDocumentSummary`, `useStockMinimum`).
**Spesifikasi**: satu endpoint mengembalikan agregat siap pakai (`total_sku`, `total_warehouses`, `inventory_value`, `pending_approvals_count`, `running_opname_count`, `monthly_chart[12]`, `recent_activities[14]`, `stock_attention`) — dihitung di SQL, bukan dari fetch-all. **Gate (K7)**: grup `auth:sanctum` + filter bagian respons mengikuti peta `access` user (bagian Persediaan hanya bila punya Persediaan-Baca, dst.) — JANGAN satu gate modul tunggal, JANGAN auth-only tanpa filter. Frontend: hapus 5 fetch-all berat, sisakan query ringan yang masih perlu.
**Kriteria lulus**: dashboard memuat tanpa satu pun request `per_page≥1000`; TTI dashboard di dataset skala target <3 dtk; user tiap role melihat hanya bagiannya (test matriks role).

### 4.2 Combobox async-search + virtualisasi
**File**: `Frontend/src/components/wms/form-combobox.tsx:56-137`; pemakai berat: 5 form transaksi + `stock-adjustment-form` + kartu-stock + laporan-kartu-stock + `master-forms.tsx` + `barcode.tsx`.
**Spesifikasi**: tambah paket `@tanstack/react-virtual` (belum ada di deps — perlu `bun add`, sinkronkan `bun.lock` + `package-lock.json`, konfirmasi user bila kena guard `minimumReleaseAge`); opsi A (utama): `onSearchChange` + server search (`/api/master/items?search=&per_page=20`, endpoint search sudah ada) + `useVirtualizer` (8–10 DOM node); opsi B (dataset <500): pertahankan mode lokal. Migrasi per-form, mulai dari `barang-masuk-form` + `barang-keluar-form`.
**Kriteria lulus**: buka combobox barang di 50rb SKU → dropdown interaktif <200ms, memori tab tidak naik >50MB; tidak ada regresi submit form (test hijau).

### 4.3 Server pagination di laporan/valuasi + kartu-stock satu metode
**File**: `use-persediaan.ts` (`PER_PAGE=500`, `DOCS_PER_PAGE=10000`), `use-laporan.ts`, `laporan-mutasi.tsx:85`, `persediaan.kartu-stock.tsx:158-178,238-246`, `data-table.tsx`.
**Spesifikasi**: (a) Laporan mutasi/valuasi → pager server (`page`, `per_page`, `onPageChange` ke `DataTable`; backend Fase 2 sudah paginate). (b) Kartu stock → fetch hanya metode aktif (hapus 2 request sia-sia); chart disampling bila >100 titik (agregat per tanggal, bukan 1:1 ledger). (c) Hapus cap-500-diam-diam hanya SETELAH (a) hidup — sebelum itu cap adalah pelindung, bukan bug yang boleh dicabut duluan.
**Kriteria lulus**: tidak ada request `per_page>500` ke endpoint agregat; kartu item 20rb movement → 1 request + chart <200 titik; angka laporan identik sebelum/sesudah.

### 4.4 Import CSV chunked + progres
**File**: `Frontend/src/components/wms/import-barang-dialog.tsx:211-217,523-572`.
**Spesifikasi**: cek `file.size` di awal (tolak >25MB dengan pesan jelas); `Papa.parse` dengan `chunk`/`worker`; lookup master via Map (bukan `list.find` per baris); preview dipaginasi/virtualisasi (jangan render semua baris); kirim per-chunk 500 ke backend Fase 3.3 dengan progress bar + resume/lanjut-saat-gagal per-chunk.
**Kriteria lulus**: CSV 5000 baris → UI tetap responsif, progres terlihat, selesai end-to-end; CSV 25MB+ ditolak dengan pesan yang dimengerti user awam.

---

## FASE 5 — Token Lifecycle & Storage Maintenance

### 5.1 Sanctum = Fase 1.4 (dipindah ke depan — satu paket, sudah dikunci)
(Lihat 1.4. Tidak ada pekerjaan tambahan di fase ini selain memastikan scheduler OS/cron prod menjalankan `schedule:run`.)

### 5.2 LocalStorage opname: GC + versioning (melengkapi TTL-24jam yang sudah ada)
**File**: `Frontend/src/components/wms/opname/opname-count-page.tsx:49-75,116-157,267-272`.
**Spesifikasi**: `pruneOpnameLocalStorage()` saat modul Opname dibuka → buang key `kg-opname-*` berumur >7 hari; tambah `schemaVersion` pada payload draft (abaikan draft versi lama); tulis draft di-debounce (bukan tiap keystroke) + tangkap quota-exceeded dengan pesan; tambah sinkron antar-tab minimal (`storage` listener → toast "draft berubah di tab lain", jangan menimpa diam-diam).
**Kriteria lulus**: draft basi >7 hari hilang otomatis; draft skema lama tidak merusak hydrate; tulis tiap ketikan tidak jank di dokumen 300 baris.

---

## STRATEGI VERIFIKASI (berlaku tiap fase)

1. **Dataset skala target (siapkan sekali, pakai untuk semua fase)**: seeder/ekstensi yang menghasilkan 50rb item + ~1jt movement + 50rb dokumen di `kelolagudang_test`. Tanpa ini, kriteria p95/peak di atas tidak operasional. (Catatan: seeder saat ini `usort` in-memory + `create` per-baris — untuk bangkitkan dataset uji perlu `insert` batch + chunk; perbaiki seeder dulu sebagai prasyarat 2.1.)
2. **Baseline sebelum ubah**: catat p95 + peak PHP (`memory_get_peak_usage`) + `EXPLAIN ANALYZE` untuk valuation/mutasi/stockMinimum/analytics/posting-200-baris. Setiap klaim "lebih cepat" dibandingkan ke baseline ini, bukan ke angka absolut.
3. **Paritas angka**: tiap refactor agregat/ledger wajib test perbandingan lama-vs-baru pada dataset sama (FIFO/Avg/Max, saldo_awal/akhir, guard opname, pesan error per-baris).
4. **Backend**: `composer test` hijau penuh + `vendor/bin/pint` per fase.
5. **Frontend**: `npm run lint`, `npx tsc --noEmit`, `npm test` hijau per fase.
6. **Beban tulis**: posting paralel (2 operator × item sama) → tanpa deadlock/duplikat; 100 insert nomor paralel per prefix → unik semua.

## URUTAN EKSEKUSI (tidak boleh dilompat)

```
Fase 1 (1.1 index → 1.2 per_page → 1.3 counter+backfill → 1.4 sanctum)
  → Fase 2 (2.5 FIFO-pointer dulu → 2.1 valuation → 2.2 mutasi → 2.3 analitik → 2.4 guard opname)
    → Fase 3 (3.1 batch-FK → 3.2 ledger prefetch → 3.4 syncCost → 3.3 bulkImport → 3.5 bersyarat)
      → Fase 4 (4.1 dashboard endpoint+gate → 4.3 pager laporan → 4.2 combobox → 4.4 CSV chunked)
        → Fase 5 (5.2 storage GC; 5.1 sudah di Fase 1)
```
Ketergantungan keras: 4.3c (cabut cap-500) setelah 2.1–2.2; 4.4 setelah 3.3; 2.1 setelah dataset uji (prasyarat §strategi-1); 1.3 butuh jendela tanpa posting paralel saat migrasi backfill berjalan.
