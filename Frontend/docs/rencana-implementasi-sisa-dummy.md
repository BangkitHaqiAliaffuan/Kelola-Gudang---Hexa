# Rencana Implementasi & Pembersihan Sisa Komponen Dummy Frontend

Dokumen ini memuat rencana kerja terstruktur untuk menuntaskan integrasi seluruh komponen frontend yang masih menggunakan data tiruan (*mock*) atau belum terhubung ke API backend riil.

## Status Saat Ini (2026-09-11)

Seluruh **tombol operasional** (Cetak HTML, Ekspor CSV, Mutasi Pengaturan, Cetak Barcode) telah beralih ke fungsi riil. Rute yang tidak diperlukan (**Peminjaman & Pengembalian Barang**) telah diamankan dengan `404 Not Found` via `notFound()` TanStack Router.

---

## Fase 1 — Integrasi Pencarian Global (Ctrl + K)

**Target Berkas:** `Frontend/src/components/wms/app-shell.tsx`

**Masalah:** `GlobalSearch` (CommandDialog yang terbuka dengan Ctrl+K) masih membaca array statis `items`, `transactions`, `warehouses`, `suppliers` dari `wms-data.ts`. Barang atau transaksi baru yang masuk ke database tidak akan muncul di pencarian.

**Langkah Kerja:**
1. Impor `useItems()`, `useWarehouses()`, `useSuppliers()` di dalam komponen `GlobalSearch` (atau lewat prop dari `AppShell`).
2. Ganti `items.slice(0, 24)` dengan `itemsData?.data.slice(0, 24) ?? []`.
3. Ganti `warehouses` dengan `warehousesData?.data ?? []`.
4. Ganti `suppliers.slice(0, 8)` dengan `suppliersData?.data.slice(0, 8) ?? []`.
5. Untuk grup **Nomor Transaksi**, ganti `transactions.slice(0, 8)` dengan `useStockDocuments({ per_page: 8 })` atau hapus grup ini karena duplikat dengan halaman Transaksi.

**Catatan Teknis:**
- Semua hook sudah memiliki `enabled: typeof window !== "undefined"` sesuai pola SSR.
- `useSuppliers()` tersedia di `use-master.ts`.

---

## Fase 2 — Sinkronisasi Profil Perusahaan & Preferensi Pengguna

**Target Berkas:** `Frontend/src/components/wms/profile-dialog.tsx`

**Masalah:**
- Nama perusahaan di-hardcode `"PT Kelola Nusantara"` (baris 143).
- Tiga Switch preferensi (*Notifikasi stok minimum, Ringkasan harian via email, Mode tabel padat*) tidak disimpan ke mana pun; nilainya hilang setiap refresh.
- Tombol **Simpan** hanya menutup modal dan memicu toast tanpa persistensi.

**Langkah Kerja:**
1. Impor dan panggil `useCompanySettings()` di `ProfileHelpDialog`; ganti label `"PT Kelola Nusantara"` dengan `company?.company_name ?? "—"`.
2. Buat hook sederhana `useUserPreferences()` berbasis `localStorage` (key: `kg-prefs`) yang menyimpan objek `{ notifStok: boolean, emailDaily: boolean, densityMode: boolean }`.
3. Bind setiap Switch ke state hook tersebut.
4. Tombol **Simpan** memanggil `savePreferences(...)` dari hook dan menampilkan toast konfirmasi.

---

## Fase 3 — Pembersihan Rute & Fallback Mock Legacy

### 3a. Rute Pengadaan Legacy (/pengadaan/$section)

**Target Berkas:** `Frontend/src/routes/pengadaan.$section.tsx`

**Masalah:** Rute ini adalah artefak lama sebelum modul PR/PO/Receive dibuat terpisah. Masih memuat data mock `purchaseOrders` dan `goodsReceipts` dari `wms-data.ts`. Navigasi aktif sudah mengarah ke rute resmi.

**Langkah Kerja:**
1. Tambahkan `beforeLoad` yang melempar `notFound()` untuk semua slug (atau arahkan redirect ke `/pengadaan/purchase-order`).
2. Alternatif: hapus berkas `pengadaan.$section.tsx` dan update `routeTree.gen.ts` dengan menjalankan `npm run dev` (TanStack Router akan regenerasi).

### 3b. Fallback Grafik Mock pada Laporan (/laporan/$report)

**Target Berkas:** `Frontend/src/routes/laporan.$report.tsx` baris 163-189

**Masalah:** Jika slug laporan tidak dikenali, halaman fallback merender grafik batang dan tabel dari array mock `items` dan `transactions`.

**Langkah Kerja:**
1. Jika `report` tidak ada di `titles`, lempar `notFound()` lewat `beforeLoad`.
2. Hapus cabang `isItemReport` yang mengakses `items` mock karena semua laporan item-report sudah diarahkan ke komponen riil di baris 144-150.
3. Hapus impor `items`, `monthly`, `totalValue`, `transactions`, `warehouses` dari `wms-data.ts` di berkas ini.

### 3c. Generic Master Fallback (GenericMasterPage)

**Target Berkas:** `Frontend/src/components/wms/generic-master.tsx`

**Masalah:** Komponen ini aktif sebagai fallback bila slug master tidak dikenali, dengan dataset hardcoded `user` & `role`. Tombol Tambah memunculkan toast `(dummy)`.

**Langkah Kerja:**
1. Hapus dataset `masterDatasets` beserta fungsi `make()`.
2. Ganti komponen `GenericMasterPage` menjadi tampilan sederhana yang menampilkan pesan halaman tidak tersedia.

---

## Fase 4 — Header Notification dengan Data Stok Riil

**Target Berkas:** `Frontend/src/components/wms/app-shell.tsx` — komponen `NotificationCenter`

**Masalah:** Panel notifikasi di header menampilkan 3 entri statis dari array `notifications` mock.

**Langkah Kerja:**
1. Panggil `useStockMinimum()` (sudah ada di `use-persediaan.ts`).
2. Filter item dengan status `Habis` atau `Kritis`.
3. Render maksimal 5 notifikasi dinamis dari data riil dengan judul nama barang dan info stok vs minimum.
4. Jika tidak ada barang kritis, tampilkan pesan "Semua stok dalam kondisi baik".
5. Badge merah di ikon lonceng hanya muncul jika ada minimal satu item kritis/habis.

---

## Checklist Verifikasi Final

- [ ] `npx tsc --noEmit` di `Frontend/` -> 0 error
- [ ] `npm test` (vitest) -> 11/11 suite lulus
- [ ] Ctrl+K -> Ketik nama barang riil dari DB, barang muncul di hasil pencarian
- [ ] Dialog Profil -> Nama perusahaan sesuai General Setting; preferensi tersimpan setelah refresh
- [ ] URL `/transaksi/peminjaman` -> 404 Not Found (sudah diimplementasikan)
- [ ] URL `/transaksi/pengembalian` -> 404 Not Found (sudah diimplementasikan)
- [ ] URL `/laporan/sesuatu-yang-tidak-ada` -> 404 Not Found (setelah Fase 3b)
- [ ] Header notifikasi menampilkan data stok kritis riil dari database
