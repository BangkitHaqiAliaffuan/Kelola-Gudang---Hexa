# DOKUMEN BLUEPRINT & ROADMAP PERBAIKAN SKALABILITAS JANGKA PANJANG
## Kelola Gudang Pro (WMS Monorepo) — Target: Skala Menengah-Besar
**Target Skala**: ~50.000 SKU | ~1.000.000 movement/tahun | Dokumen ratusan baris | Multi-gudang | Multi-operator paralel  
**Tanggal**: 2026-09-09  
**Status**: Siap untuk Dieksekusi Bertahap  

---

## 1. RINGKASAN EKSEKUTIF & PRINSIP ARSITEKTUR

Audit mendalam terhadap performa dan ketahanan menunjukkan bahwa Kelola Gudang Pro saat ini mengandalkan pendekatan *in-memory collection processing* di PHP dan *fetch-all client-side pagination* di React. Pola ini bekerja baik pada dataset demo (<500 SKU), namun akan mengalami **OOM (Out Of Memory), HTTP 504 Timeout, Concurrency Deadlock, dan Truncation Data Finansial** pada target skala 50.000 SKU dan 1.000.000 pergerakan/tahun.

### 5 Pilar Arsitektur Baru:
1. **SQL-First Aggregation**: Semua perhitungan matematis, saldo berjalan, opening balance, dan agregasi analitik dilakukan oleh engine PostgreSQL menggunakan query terindeks, Window Functions, dan CTE — bukan `Collection::get()->map()->reduce()` di RAM PHP.
2. **True Database Pagination**: Endpoint index dan laporan wajib menggunakan `paginate()` level database dengan batas keamanan `max: 100`. Respon pagination selalu membawa metadata utuh (`total`, `last_page`, `per_page`).
3. **High-Throughput Atomic Concurrency**: Menghapus `pg_advisory_xact_lock` dan `pluck()` pada generator kode. Menggantinya dengan atomic counter table via `INSERT ... ON CONFLICT DO UPDATE RETURNING` (<1ms per request tanpa memblokir operator lain).
4. **Incremental Ledger & Eager Relations**: Menghindari full-scan riwayat pergerakan dari awal waktu saat posting transaksi. Update saldo dan HPP rata-rata berjalan dilakukan secara inkremental pada tabel `item_stock`.
5. **DOM Virtualization & Search-as-You-Type**: Form combobox dan tabel master di frontend menggunakan *virtual windowing* (`@tanstack/react-virtual`) dan debounced server search untuk menjamin konsumsi memori browser tetap <50 MB dan UI stabil pada 60 FPS.

---

## 2. SPESIFIKASI TEKNIS & RINCIAN PER KOMPONEN

### A. Core Ledger, Concurrency & Penomoran Dokumen

#### 1. Arsitektur Atomic Counter Penomoran (`App\Support\CodeGenerator`)
* **File Terdampak**:
  - `Backend/app/Support/CodeGenerator.php`
  - `Backend/database/migrations/YYYY_MM_DD_HHMMSS_create_document_counters_table.php` (Baru)
* **Masalah**: Mengunci advisory lock global per-tahun/tabel dan me-`pluck()` semua nomor ke memory PHP.
* **Desain Solusi**:
  - Buat tabel `document_counters`:
    ```sql
    CREATE TABLE document_counters (
        prefix VARCHAR(30) NOT NULL,
        year SMALLINT NOT NULL,
        current_number INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (prefix, year)
    );
    ```
  - Metode `nextYearly(string $model, string $prefix, string $column, int $width)`:
    ```php
    $year = (int) date('Y');
    $row = DB::selectOne("
        INSERT INTO document_counters (prefix, year, current_number)
        VALUES (?, ?, 1)
        ON CONFLICT (prefix, year)
        DO UPDATE SET current_number = document_counters.current_number + 1
        RETURNING current_number
    ", [$prefix, $year]);

    $seq = $row->current_number;
    return sprintf("%s/%d/%0{$width}d", $prefix, $year, $seq);
    ```
  - **Dampak**: O(1) time complexity, zero lock contention antar-operator paralel.

#### 2. Optimasi Ledger Posting & Guard Opname (`StockDocumentService` & `StockLedger`)
* **File Terdampak**:
  - `Backend/app/Services/StockDocumentService.php`
  - `Backend/app/Services/StockLedger.php`
* **Perbaikan**:
  1. **Batch Guard Opname**: Ganti loop serial N query `EXISTS` di `assertOpnameReadyForPost` dengan satu query SQL agregat:
     ```php
     $movedItemIds = StockMovement::whereIn('item_id', $lines->pluck('item_id'))
         ->where(function ($q) use ($frozenAt) {
             $q->where('created_at', '>', $frozenAt)
               ->orWhere('occurred_at', '>', $frozenAt);
         })
         ->where(function ($q) use ($document) {
             $q->whereNull('stock_document_id')
               ->orWhere('stock_document_id', '!=', $document->id);
         })
         ->pluck('item_id')
         ->unique();
     ```
  2. **Eager Loading Bin Rack**: Pada `StockLedger::rebuildForItem()`, lakukan pre-fetch relasi bin ke rack sebelum loop penyimpanan `item_stock`:
     ```php
     $bins = Bin::with('rack')->whereIn('id', $validBinIds)->get()->keyBy('id');
     ```

---

### B. Optimalisasi Endpoint Laporan & Persediaan (Backend)

#### 1. Refactor `StockController::valuation()`
* **File Terdampak**: `Backend/app/Http/Controllers/StockController.php`
* **Desain Solusi**:
  - Paginasi level query SQL:
    ```php
    $items = $query->select('items.*')
        ->with(['category', 'unit'])
        ->orderBy('items.name')
        ->paginate($perPage);
    ```
  - Ambil nilai stok dan HPP rata-rata dari `item_stock` yang sudah dikalkulasi saat transaksi, atau hitung layer FIFO hanya untuk SKU di halaman yang sedang aktif (`$items->pluck('id')`).
  - Total valuasi global dihitung melalui single SQL query `SUM(item_stock.stock * item_stock.unit_cost_avg)` untuk ditampilkan pada metadata response.

#### 2. Refactor `LaporanController::mutasi()`
* **File Terdampak**: `Backend/app/Http/Controllers/LaporanController.php`
* **Desain Solusi**:
  - Lakukan paginasi pada tabel master `Item`.
  - Untuk page item yang aktif (mis. 20–50 SKU), jalankan query agregasi SQL berindeks:
    ```sql
    SELECT 
        item_id,
        COALESCE(SUM(CASE WHEN occurred_at < :from THEN (CASE WHEN direction = 'IN' THEN qty ELSE -qty END) ELSE 0 END), 0) AS saldo_awal,
        COALESCE(SUM(CASE WHEN occurred_at BETWEEN :from AND :to AND direction = 'IN' THEN qty ELSE 0 END), 0) AS masuk,
        COALESCE(SUM(CASE WHEN occurred_at BETWEEN :from AND :to AND direction = 'OUT' THEN qty ELSE 0 END), 0) AS keluar,
        COALESCE(SUM(CASE WHEN occurred_at <= :to THEN (CASE WHEN direction = 'IN' THEN qty ELSE -qty END) ELSE 0 END), 0) AS saldo_akhir
    FROM stock_movements
    WHERE item_id IN (:pageItemIds)
      AND (:warehouseId IS NULL OR warehouse_id = :warehouseId)
    GROUP BY item_id;
    ```
  - Gabungkan hasil agregat ke `ItemResource`. Memory PHP stabil di <15 MB terlepas dari ada 1.000.000 baris movement.

#### 3. Refactor Analitik Transaksi & Barang Keluar (`keluarAnalytics` & `transaksiAnalytics`)
* **File Terdampak**: `Backend/app/Http/Controllers/LaporanController.php`
* **Perbaikan**:
  - Hilangkan scanning filter in-memory `$posted->filter(...)`.
  - Gunakan query SQL `GROUP BY customer_id, department_id, project_id, DATE_TRUNC('month', document_date)` untuk menghasilkan ringkasan bulanan dan Pareto share.
  - Hilangkan N+1 query serapan proyek dengan melakukan join sekali jalan antara `work_orders` dan baris pengeluaran terkait.

---

### C. Indexing & Skema Database

#### 1. Migrasi Penambahan Indeks Komposit & Functional Index
* **File Baru**: `Backend/database/migrations/YYYY_MM_DD_HHMMSS_add_performance_indexes_table.php`
* **Daftar Indeks**:
  ```sql
  -- Agregasi pergerakan cepat & kalkulasi demand 30/60/90 hari
  CREATE INDEX idx_stock_movements_demand ON stock_movements (direction, movement_type, occurred_at);
  CREATE INDEX idx_stock_movements_item_wh_date ON stock_movements (warehouse_id, item_id, occurred_at);

  -- Scan barcode & pencarian case-insensitive instan
  CREATE INDEX idx_items_lower_sku ON items (LOWER(sku));
  CREATE INDEX idx_items_lower_barcode ON items (LOWER(barcode));
  CREATE INDEX idx_items_lower_internal_barcode ON items (LOWER(internal_barcode));

  -- Filtering dokumen mutasi
  CREATE INDEX idx_stock_docs_filter ON stock_documents (type, status, document_date);
  ```

---

### D. Optimasi FormRequest & Validasi Massal

#### 1. Batch Validation di `StoreStockDocumentRequest` & `ItemController::bulkImport`
* **File Terdampak**:
  - `Backend/app/Http/Requests/StoreStockDocumentRequest.php`
  - `Backend/app/Http/Controllers/ItemController.php`
* **Perbaikan**:
  - Hapus `Rule::exists` dari elemen array `lines.*.item_id`, `lines.*.from_bin_id`, `lines.*.to_bin_id`.
  - Pasang validasi batch di hook `after()`:
    ```php
    $lines = $this->input('lines', []);
    $itemIds = array_unique(array_filter(array_column($lines, 'item_id')));
    $existing = Item::whereIn('id', $itemIds)->count();
    if ($existing !== count($itemIds)) {
        $validator->errors()->add('lines', 'Terdapat barang yang tidak valid atau telah dihapus.');
    }
    ```

---

### E. Frontend UI Scalability, Virtualisasi & Payload Minimization

#### 1. Async Search & Virtualisasi di `FormCombobox`
* **File Terdampak**:
  - `Frontend/src/components/wms/form-combobox.tsx`
  - `Frontend/src/components/wms/data-table.tsx`
* **Spesifikasi**:
  - Pasang paket `@tanstack/react-virtual`.
  - Untuk input pencarian barang di form transaksi, gunakan *server-side debounced search* (`/api/master/items?search=...&per_page=20`).
  - Render list dropdown menggunakan `useVirtualizer` sehingga hanya 8–10 DOM node yang dirender secara fisik di layar, berapapun jumlah data di cache.

#### 2. Restrukturisasi Dashboard Queries (`routes/index.tsx`)
* **File Terdampak**:
  - `Frontend/src/routes/index.tsx`
  - `Backend/app/Http/Controllers/DashboardController.php` (Baru)
* **Spesifikasi**:
  - Buat dedicated endpoint `GET /api/dashboard/overview` yang mengembalikan agregat siap pakai:
    ```json
    {
      "total_sku": 50000,
      "total_warehouses": 5,
      "inventory_value": 45200000000.00,
      "pending_approvals_count": 3,
      "running_opname_count": 1,
      "monthly_chart": [...],
      "recent_activities": [...],
      "stock_attention": [...]
    }
    ```
  - Hapus pemanggilan paralel `useItems()` (10.000 row), `useStockDocuments()` (10.000 row), dan `useStockValuation()` dari `routes/index.tsx`.

#### 3. Penghapusan Data Truncation di Seluruh Hook Persediaan & Laporan
* **File Terdampak**:
  - `Frontend/src/hooks/use-persediaan.ts`
  - `Frontend/src/hooks/use-laporan.ts`
  - `Frontend/src/components/wms/laporan-mutasi.tsx`
  - `Frontend/src/routes/persediaan.kartu-stock.tsx`
* **Spesifikasi**:
  - Hapus konstanta `PER_PAGE = 500` yang memotong data secara diam-diam.
  - Implementasikan server-driven pagination di halaman Laporan Mutasi dan Valuasi Stok (`page`, `per_page`, `onPageChange`).
  - Di Kartu Stock (`persediaan.kartu-stock.tsx`), hanya panggil `useStockCard` untuk metode yang aktif dipilih user, dan terapkan sampling titik grafik jika riwayat transaksi > 100 baris.

---

### F. Security, Sanctum Token Lifecycle & Storage Garbage Collection

#### 1. Sanctum Expiration & Automated Pruning
* **File Terdampak**:
  - `Backend/config/sanctum.php`
  - `Backend/app/Http/Controllers/AuthController.php`
  - `Backend/routes/console.php`
* **Spesifikasi**:
  - Set `expiration => 1440` (24 jam) di `config/sanctum.php`.
  - Di `AuthController::login`:
    ```php
    $user->tokens()->where('created_at', '<', now()->subHours(24))->delete();
    ```
  - Daftarkan scheduled task harian di `routes/console.php`:
    ```php
    Schedule::command('sanctum:prune-expired --hours=24')->daily();
    ```

#### 2. LocalStorage Garbage Collection untuk Draft Opname
* **File Terdampak**: `Frontend/src/components/wms/opname/opname-count-page.tsx`
* **Spesifikasi**:
  - Tambahkan utilitas pembersihan `pruneOpnameLocalStorage()` yang membuang key `kg-opname-*` yang berusia >7 hari saat user membuka modul Opname.

---

## 3. ROADMAP TAHAPAN EKSEKUSI (PHASED EXECUTION PLAN)

```
+-----------------------------------------------------------------------------------+
| FASE 1: Concurrency & Database Foundation                                         |
| -> Migrasi Tabel document_counters & Refactor CodeGenerator                       |
| -> Migrasi Performance & Functional Indexes (LOWER SKU, Movements, Documents)     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 2: Backend Query Engine & Eliminasi Memory Leak                              |
| -> Refactor StockController::valuation() & LaporanController::mutasi() ke SQL     |
| -> Refactor LaporanController analitik (Eliminasi O(T*D) & N+1 queries)           |
| -> Batch Guard Opname di StockDocumentService                                     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 3: FormRequest & Ledger Optimization                                         |
| -> Batch Foreign Key Validation di StoreStockDocumentRequest & bulkImport         |
| -> Eager Loading & Reconcile Cache di StockLedger                                 |
| -> Limitasi parameter per_page (max: 100) di seluruh controller index             |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 4: Frontend UI Scalability & Dashboard Refactor                              |
| -> Buat Dashboard Overview Endpoint & Refactor routes/index.tsx                   |
| -> Integrasi @tanstack/react-virtual pada FormCombobox & Master Data              |
| -> Hapus Truncation 500 & Aktifkan Server Pagination di Laporan Mutasi/Valuasi    |
| -> Optimasi Kartu Stock (Single Method Fetch + Downsampled Chart)                 |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 5: Security, Token Lifecycle & Storage Maintenance                           |
| -> Sanctum Expiration, Prune Command & Login Cleanup                              |
| -> LocalStorage TTL & Garbage Collector untuk Opname Draft                        |
+-----------------------------------------------------------------------------------+
```

---

## 4. STRATEGI TESTING & VERIFIKASI KUALITAS

Setiap fase wajib diverifikasi dengan serangkaian pengujian sebelum dianggap selesai:

1. **Unit & Feature Tests (`Backend`)**:
   - Menjalankan `php artisan test` pada `kelolagudang_test`.
   - Memastikan test case ledger, posting dokumen mutasi (IN/OUT/TF/ADJ/SO), FIFO calculation, RBAC module level, dan validasi form tetap berstatus hijau (100% pass).
2. **Concurrency & Race Condition Simulation**:
   - Menjalankan script simulasi pembuatan nomor dokumen paralel (100 request simultan) untuk memverifikasi tidak ada nomor duplikat dan tidak ada lock contention.
3. **Frontend Tests & Linting (`Frontend`)**:
   - Menjalankan `npm run lint` dan `npx tsc --noEmit` untuk validasi tipe TypeScript.
   - Menjalankan `npm test` (`vitest run`) untuk menguji integrasi hooks dan komponen.
4. **Memory Profiling**:
   - Memastikan endpoint `/laporan/mutasi` dan `/persediaan/valuation` mengonsumsi memori <20 MB pada database terisi 50.000 SKU.
