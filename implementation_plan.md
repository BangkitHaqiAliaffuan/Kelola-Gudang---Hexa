# Final Plan Implementasi `customer_id` Backwards Compatibility (Terkoreksi)

Penyempurnaan codebase dari penambahan kolom FK `customer_id` pada entitas [StockDocument](file:///d:/Kelola-Gudang---Hexa/Backend/app/Models/StockDocument.php#10-115) untuk mengatasi isu duplikasi penamaan, tanpa merusak kompatibilitas data lawas/frontend.

## Kebijakan Inti

*   **Aturan Validasi Konsisten (Q1 & Q4):** `customer_id` *nullable* untuk type 'Pengeluaran', `customer_id` *required* HANYA untuk type 'Retur Penjualan', dan *prohibited* (dilarang ada) di type selain keduanya, sesuai dengan aturan eksisting di [Backend/app/Http/Requests/StoreStockDocumentRequest.php](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Requests/StoreStockDocumentRequest.php) baris 52.
*   **Snapshot vs Live (Q2):** Kolom `partner` pada [StockDocument](file:///d:/Kelola-Gudang---Hexa/Backend/app/Models/StockDocument.php#10-115) di-preserve sebagai **snapshot string historis**. UI akan menggunakan dynamic fallback (`doc.customer ?? doc.partner` — `customer` adalah string nama dari `StockDocumentResource.php:27`, bukan objek) dan check controller penghapusan [Backend/app/Http/Controllers/CustomerController.php](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/CustomerController.php) baris 66 (`where customer_id OR where partner`) tetap relevan.
*   **Data Anomali (Q3):** Historical `partner` = `Departemen Produksi` dibiarkan apa adanya dan `customer_id` akan bernilai `NULL`. Tidak perlu membuat data Customer palsu.

## 5-Phase Plan (Revisi Terkoreksi)

*   **Fase 0: Audit Dry-Run Script**
    *   Menggunakan Tinker script yang secara eksplisit memfilter **berdasarkan `type IN ('Pengeluaran', 'Retur Penjualan')`** saja untuk mencegah audit data Penerimaan/Transfer/SO/ADJ (karena wajar jika partner kosong/berformat lain).
    *   Hitung jumlah dokumen `customer_id IS NULL` pada 'Pengeluaran' vs 'Retur Penjualan'.
    *   Mengidentifikasi distinct `partner` yang tidak ada di master.
*   **Fase 1: Backfill SQL Migration**
    *   Pembuatan class migration anonim (`Backend/database/migrations/xxxx_xx_xx_xxxxxx_backfill_customer_id_to_stock_documents.php`).
    *   Script: `UPDATE stock_documents s SET customer_id = c.id FROM customers c WHERE s.customer_id IS NULL AND s.partner IS NOT NULL AND s.partner = c.name AND s.type IN ('Pengeluaran', 'Retur Penjualan')`
    *   Membiarkan nilai `partner` utuh. Untuk seeder dev DB `Departemen Produksi`, statement di atas diharapkan me-return 0 affected rows secara natural.
*   **Fase 2: Perbaikan Seeder Dummy Data**
    *   File: [Backend/database/seeders/StockDocumentSeeder.php](file:///d:/Kelola-Gudang---Hexa/Backend/database/seeders/StockDocumentSeeder.php)
    *   Ubah iterasi Pengeluaran (sekitar baris 107 dan 357) dengan probabilitas *per dokumen* (misal via `fake()->boolean(30)`): 70% di-set statis `partner` = `Departemen Produksi` dengan `customer_id = NULL`; 30% lookup random [Customer](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/CustomerController.php#14-76) via DB, isi `customer_id = $c->id` dan `partner = $c->name`.
    *   Pastikan dokumen 'Penerimaan', 'Transfer' (baris 196), dan 'Opname' (baris 291) tidak ikut mematuhi `customer_id`.
*   **Fase 3: Update Search Backend**
    *   File: [Backend/app/Http/Controllers/StockDocumentController.php](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/StockDocumentController.php) baris 47.
    *   Tambahkan filter `orWhereHas('customer', fn ($q) => $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]))` di query `search`.
*   **Fase 4: Update Visual & Komponen Frontend**
    *   **Sheet Detail:** Di [Frontend/src/components/wms/stock-document-sheet.tsx](file:///d:/Kelola-Gudang---Hexa/Frontend/src/components/wms/stock-document-sheet.tsx) (baris 234), refactor display logic variabel destination dari sekadar menggunakan `partner` menjadi mendahulukan `doc.customer ?? doc.partner`.
    *   **Search Box:** Di [Frontend/src/lib/stock-document-search.ts](file:///d:/Kelola-Gudang---Hexa/Frontend/src/lib/stock-document-search.ts) (baris 12), ubah agar memuat kata kunci lookup relasi live `doc.customer`.
    *   **Entri Keluar:** Di [Frontend/src/components/wms/barang-keluar-form.tsx](file:///d:/Kelola-Gudang---Hexa/Frontend/src/components/wms/barang-keluar-form.tsx) (baris 107), restrukturisasi pemilahan/pembentukan initial options agar `find(c => c.name === ...)` menjadi *by ID* atau pemisahan jelas tanpa gabungan `Set({customer, dept, project})` yang collision.
    *   **Entri Retur Penjualan:** Di [Frontend/src/components/wms/retur-penjualan-form.tsx](file:///d:/Kelola-Gudang---Hexa/Frontend/src/components/wms/retur-penjualan-form.tsx) (baris 269), pastikan setting fallback customer menangkap form state dengan ID secara kuat.
*   **Fase 5: Test Integrity Verification**
    *   File: [Backend/tests/Feature/StoreStockDocumentApiTest.php](file:///d:/Kelola-Gudang---Hexa/Backend/tests/Feature/StoreStockDocumentApiTest.php)
    *   Test case baru: Validasi 422 Required bila `customer_id` kosong untuk 'Retur Penjualan'.
    *   Test case baru: Validasi 422 Prohibited bila mencoba inject `customer_id` pada type 'Penerimaan', 'Transfer Gudang', 'Stock Opname', 'Stock Adjustment'.
    *   Pastikan test lama "Pengeluaran dengan field `partner` 'PT Sumber Jaya' tanpa `customer_id`" bisa sukses tanpa required error.

## Verifikasi Mandiri

Setelah implementasi akan disimulasikan:
*   `php artisan migrate --pretend`
*   `php artisan test --filter=StockDocument`
*   `npm run dev` pada Frontend dan pengetesan mutasi UI secara live.
