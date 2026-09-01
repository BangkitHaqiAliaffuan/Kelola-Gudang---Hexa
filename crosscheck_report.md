# Hasil Crosscheck Plan `customer_id`

## 1. Relasi Customer Name vs ID (Risiko Duplikasi)
- **Fakta:** Saat ini di `StockDocumentController:222`, kita menyimpan teks `partner` yang bersifat denormalisasi. Jika nama "Customer A" diedit di master data di kemudian hari, nilai pada tabel `stock_documents` maupun `stock_movements` tidak akan ikut berubah karena tidak di-link via Foreign Key yang cascading.
- **Kesimpulan:** Rawan bias bila ada kesamaan/duplikasi nama atau bila nama sering direvisi. Implementasi `customer_id` yang valid via referensi database akan memecahkan ambiguitas ini dan konsisten secara jangka panjang.

## 2. Pengecekan Hidden Dependencies (Backend)
- **[LaporanController](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/LaporanController.php#15-154)**: Setelah crosscheck, laporan [mutasi](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/LaporanController.php#17-153) tidak bergantung pada kolom `partner`. Saldo dan agregasi FIFO murni berbasis `item_id`, `warehouse_id`, dan `unit_cost_avg` dari `StockMovement`. Laporan aman dari efek samping perubahan struktur `partner`.
- **[ProcDocController](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/ProcDocController.php#21-453)**: Transaksi Procurement menggunakan `supplier_id` (vendors) dan `department_id`. Tidak bersinggungan langsung dengan skema `customer_id` / `partner` pada `stock_documents`, aman.
- **`StockMovement`**: Table ini sejauh ini hanya membawa field string `partner`. Tidak divalidasi ketat dan hanya dipakai sebagai metadata tambahan, namun perhatikan bahwa nilainya meniru apa yang disimpan pada tabel utama `stock_documents`.

## 3. Pengecekan Frontend (Kartu Stok & Filter)
- **Fakta:** Pada file seperti [persediaan.mutasi.tsx](file:///d:/Kelola-Gudang---Hexa/Frontend/src/routes/persediaan.mutasi.tsx), [persediaan.kartu-stock.tsx](file:///d:/Kelola-Gudang---Hexa/Frontend/src/routes/persediaan.kartu-stock.tsx), dan backend pencarian ([stock-document-search.spec.ts](file:///d:/Kelola-Gudang---Hexa/Frontend/src/lib/stock-document-search.spec.ts)), pencarian masih berbasis string `r.partner`. 
- **Risiko / Kesimpulan:** Ini tidak merusak fitur pencarian teks, tapi Frontend belum punya filter dropdown spesifik berdasarkan [Customer](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/CustomerController.php#14-76) di DataTable Kartu Stok/Transaksi Keluar. Jika user ingin mem-filter satu PT spesifik secara akurat terlepas dari salah eja (typo), fungsi filter ID tidak ada, masih via loose-text `partner`.

## 4. Keamanan Skrip Backfill SQL
- **Fakta:** Pada fase backfill SQL (UPDATE FROM customers ...) yang mencocokkan string `stock_documents.partner = customers.name`.
- **Risiko:** 
  1. *Typo*: "PT. Aneka Mandiri" vs "PT Aneka Mandiri" akan menyebabkan field `customer_id` tetap `NULL`.
  2. Apabila terdapat duplikasi nama di `customers`, update bisa salah penempatan FK atau PostgreSQL menolak query karena constraint tertentu.
- **Rekomendasi Koreksi:** Jalankan Dry-run *Mismatches* (`SELECT DISTINCT partner FROM stock_documents WHERE partner NOT IN (SELECT name FROM customers)`) untuk mendeteksi transaksi tanpa master yang exact sebelum di-commit secara permanen.

## 5. Pengecekan Test Cases (Test Terancam Pecah)
- **Fakta:** Di dalam [StoreStockDocumentApiTest.php](file:///d:/Kelola-Gudang---Hexa/Backend/tests/Feature/StoreStockDocumentApiTest.php) (lines ~63+, 262+, 586+), terdapat banyak baris payload mock yang mengirim `partner => 'PT Sumber Jaya'` atau `'PT Aneka Mandiri'` untuk tipe Dokumen *Penerimaan*, *Pengeluaran*, *Retur*, dll.
- **Risiko:** Bila [StoreStockDocumentRequest](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Requests/StoreStockDocumentRequest.php#14-531) mewajibkan (`required`) eksistensi `customer_id` pada fase 2, test ini **pasti akan gagal** (`422 Unprocessable Entity`).
- **Rekomendasi Koreksi:** Sesuaikan test payload agar *create* Factory [Customer](file:///d:/Kelola-Gudang---Hexa/Backend/app/Http/Controllers/CustomerController.php#14-76) lalu inject `customer_id` di setiap `$this->postJson()` atau pastikan form validasi di Controller melegalkan `partner` string kosong/fallback untuk backwards-compatibility.

## Tabel Risiko

| Poin Risiko | Target File/Sistem | Impact | Probabilitas | Strategi / Mitigasi Koreksi |
|-------------|--------------------|--------|--------------|-----------------------------|
| **Test case pecah massal** | [StoreStockDocumentApiTest.php](file:///d:/Kelola-Gudang---Hexa/Backend/tests/Feature/StoreStockDocumentApiTest.php) | Tinggi | Sangat Tinggi | Update test builder/payload `$this->makeLocation()` beserta factory customer, kirim `customer_id`. |
| **Typo saat Backfill SQL** | Database (Live / Staging) | Sedang | Menengah-Tinggi | Filter `partner` yang tidak exact-match sebelum UPDATE. Manual fix nama yang typo di tabel. |
| **Pencarian FE Inakuransi** | `Frontend/src/routes/...` | Rendah | Menengah | Ubah kolom `partner Label` jadi Customer lookup jika `type == Pengeluaran`. |
| **Data Laporan Invalid** | `LaporanController.php` | Tidak Ada | Sangat Rendah | - (Aman, Laporan by item & warehouse) |
| **Snapshot History** | `StockDocumentController.php`| Menengah| Pasti Terjadi | Apakah kita menyimpan snapshot string lama biarpun ID nya ada? Perlu disepakati. |

## Daftar Pertanyaan Klarifikasi
1. **Rule Validasi API**: Apakah `customer_id` akan dijadikan sifat bawaan yang **`required`** (wajib) di payload `Pengeluaran`/`Retur Penjualan`, atau diizinkan nullable (`sometimes|nullable`) sebagai transisi? (Jika *required*, saya akan refactor puluhan test API terlebih dahulu).
2. **Snapshot vs Live Relation**: Pada FE, apakah kolom `Partner` (yang tadinya teks diam) ingin Anda ubah jadi dinamis me-look-up nama di tabel Customers bedasarkan `customer_id` supaya kalau direname berubah historisnya, ATAU tetap pakai nilai `partner` string lama untuk keperluan *snapshot* historis?
3. **Data Anomali (Backfill)**: Apabila dalam Backfill SQL kita menemukan teks `partner` yang sama sekali tidak ada di master `Customer`, haruskah SQL script dibirbirkan untuk generate Customer dummy otomatis, atau dibiarkan `customer_id = NULL`?
