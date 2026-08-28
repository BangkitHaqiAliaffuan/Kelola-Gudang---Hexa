# Dokumen Tes — Mulai Commit Filter Label Kartu Stock (23e33f8) s/d UI Approval ADJ (44412c1)

> Cakupan: 12 commit 27 Aug 2026 — dari `fix(kartu-stock): Filter Periode Transaksi` sampai `feat(adjustment): UI approval`

---

## 1) `23e33f8` Filter Periode Transaksi — Kartu Stock

**File:** `Frontend/src/routes/persediaan.kartu-stock.tsx:627`

**Tes:**
- [ ] Buka `/persediaan/kartu-stock`, pilih barang → panel filter terlihat label `Filter Periode Transaksi` (text-xs muted) di atas 2 input date, dalam 1 container `rounded-xl border` dengan separator `–` di tengah.
- [ ] Cek `aria-label="Dari tanggal"` & `Sampai tanggal` masih ada (aksesibilitas), placeholder tidak ada (type=date).
- [ ] Isi `Dari=2026-07-01` `Sampai=2026-08-01` → Network `GET /api/persediaan/stock-card?item_id=X&from=2026-07-01&to=2026-08-01` param `from/to` benar.
- [ ] Tabel: baris `2026-07-15` muncul, `2026-06-15` tidak muncul.
- [ ] Responsive: `md` (768px) container full-width, `xl` (1280px) 2 kolom, tidak pecah, gap rapat `gap-1`.

---

## 2) `e89ec88` Clear Filter — Grup Persediaan (6 file)

**File:** `kit.tsx:17 ClearFiltersButton` + `persediaan.*.tsx` 5 file + `kartu-stock` pilot

**Tes per halaman (contoh `persediaan/stock`):**
- [ ] Tanpa filter → tombol `Hapus Filter` **tidak muncul**.
- [ ] Isi `Cari` atau pilih `Gudang/Kategori` → tombol muncul di ujung kanan baris filter (`ml-auto`).
- [ ] Klik `Hapus Filter` → `q=""`, `wh=ALL`, `cat=ALL` (atau `days=30` untuk stock-minimum) ter-reset, tabel balik semua data, Network `stock?per_page` tanpa `search/warehouse_id`.
- [ ] Mobile: tombol tetap kanan, tidak wrap ke baris baru sendirian.

**Khusus `kartu-stock`:** `q/jenis/pic/wh/dateFrom/dateTo` semua reset.

---

## 3) `af3a4e5` Grup Transaksi (3 file)

**File:** `transaksi-masuk/keluar/transfer.tsx`

**Tes (contoh `transaksi/masuk`):**
- [ ] Filter `Gudang/Supplier/Status` + search → `Hapus Filter` muncul.
- [ ] Klik → semua `q/wh/partner/status` balik `ALL`, rows `Penerimaan` semua muncul.

---

## 4) `cb60892` Grup Retur & Pengadaan (4 file)

**File:** `retur-list.tsx` (shared 2 route) + `purchase-request/order` + `receive-goods`

**Tes:**
- [ ] `retur-pembelian` & `retur-penjualan` pakai `retur-list` yang sama → isi filter di salah satu, pindah route lain tidak bocor (state per-mount).
- [ ] `purchase-request` dengan toggle `Perlu Persetujuan Saya (myApproval)` → `Hapus Filter` reset juga `myApproval=false`.
- [ ] Klik `Hapus` → semua filter termasuk toggle kembali `false`.

---

## 5) `90fa897` Grup Laporan (5 file)

**File:** `laporan-barang-masuk-keluar/mutasi/kartu-stock/stock` + `laporan.$report.tsx` fallback

**Tes khusus `laporan.$report` (uncontrolled → controlled):**
- [ ] Filter `Gudang` + `Tanggal` (sebelumnya `defaultValue="2026-07-01"` kosmetik) → isi `2026-08-01` → `Hapus Filter` → tanggal balik `2026-07-01` (bukan kosong), `q` & `wh` reset. (Pakai `value` + `useState` + `key` remount jika perlu).

**Tes umum:**
- [ ] `laporan-barang-masuk-keluar` dengan `from/to` default 11 bulan lalu → `Hapus` balik ke default (bukan kosong).

---

## 6) `8d94f8a` Grup Master, Opname, System (3 file)

**File:** `master.barang.index.tsx` (5 dropdown) + `opname-laporan.tsx` + `system.$section.tsx`

**Tes:**
- [ ] `master/barang` isi `Kategori/Sub/Merk/Stock/Status` + search → `Hapus` reset semua 5 + `q`.
- [ ] `opname/laporan` dengan `visible` pagination → `Hapus` reset `q/wh/status/dateFrom/dateTo` **dan** `visible=2`.
- [ ] `system/audit-trails` `q/action/module` → `Hapus` reset.

---

## 7) `097c9af` Grup Master CRUD Shell (2 file, 8 halaman)

**File:** `master-crud.tsx` (shell `slotHasActive/onClearSlot`) + `master-crud-pages.tsx` (supplier, customer, vendor, departemen, proyek, work-order, user, role)

**Tes:**
- [ ] `master/supplier` isi `Kota` → tombol `Hapus Filter` di shell muncul (karena `slotHasActive`), klik → `cityFilter` & `termsFilter` reset, `q` shell juga reset (dua level).
- [ ] `master/kategori` (tanpa slot) isi `q` → tombol muncul (hanya `q`), klik → `q` reset.

---

## 8) `d590877` Fix Wrap (22 file)

**Tes:**
- [ ] Buka `master.barang` (6 filter) di `1024px` (laptop) → `Hapus Filter` tetap di **kanan baris yang sama** (`flex ml-auto`), tidak jatuh ke baris baru sendirian.
- [ ] Cek `persediaan/stock` (4 filter) di `768px` → semua filter + tombol masih 1 baris wrap natural, tombol di ujung kanan.

---

## 9) `dc7f2fe` Kartu Stock 2-leg Transfer Global

**File:** `Backend/app/Http/Controllers/StockController.php:229`

**Tes:**
- [ ] Buat item, `Penerimaan 10` ke Gudang A, `Transfer 4` A→B → `GET /stock-card?item_id=X` global (tanpa `warehouse_id`) → `saldo_akhir=10`, rows ada `OUT 4` **dan** `IN 4` (2 baris `TF/...`), `rows.last.saldo == saldo_akhir` (sebelum fix hanya `OUT`, saldo `6`).

---

## 10) `04f85da` Opname Soft Lock

**File:** `Backend/app/Services/StockDocumentService.php:179` + `StockOpnameApiTest.php`

**Tes:**
- [ ] Buat Opname Draft, `frozen_at` tercatat, insert `StockMovement` dengan `created_at = frozenAt+1s` & `occurred_at = now-2d` (backdated) → `POST /post` → `422 "Barang bergerak selama opname..."`.
- [ ] `POST /post` 2x cepat (double click) → hanya 1 `ADJ` ter-create, keduanya `200 Selesai` (idempotensi `lockForUpdate`).

---

## 11) `f607079` BE Approval ADJ (Draft→Menunggu→Selesai)

**File:** `StockDocumentController.php:183` + `stock_documents` migration `submitted_at/approver...`

**Tes:**
- [ ] `POST /stock-documents` ADJ dengan `status=Selesai` → tetap `Draft` (bypass tertutup).
- [ ] `POST /{id}/submit-approval` `Draft` → `Menunggu Approval` + `submitted_at`.
- [ ] `POST /{id}/approve` dengan `Auditor`/`Kelola` beda user dari requester → `Selesai` + ledger `stock_movements` muncul, `ItemStock` berubah.
- [ ] `approve` dengan `requester === approver` → `422 SoD`.
- [ ] `approve` tanpa role → `403`.
- [ ] `POST /{id}/reject` `Menunggu` → `Dibatalkan`, `decision_note` tersimpan, **tanpa ledger**.

---

## 12) `44412c1` FE Approval UI ADJ

**File:** `persediaan-types.ts:203` + `use-persediaan.ts:150` + `stock-document-sheet.tsx:132` + `adjustment.index.tsx:84`

**Tes:**
- [ ] `Draft` (kamu pembuat) buka sheet → tombol `Ajukan Approval` (boleh self) + `Batalkan`, tidak ada `Posting` (disable `isSelf`).
- [ ] Klik `Ajukan` → status jadi `Menunggu`, sheet tutup, tabel badge `Menunggu`.
- [ ] Login user lain `Auditor` → buka ADJ `Menunggu` → tombol `Setujui`/`Tolak` aktif ( `isApproveBlocked` false karena beda user), klik `Setujui` → `Selesai` + stok berubah; `Tolak` → `Dibatalkan` + `decision_note`.
- [ ] Coba `Setujui` dengan pembuat sendiri → `422` + toast SoD, tombol disable.

---

**Cara Jalankan:**
```bash
# BE
C:/tools/php83/php.exe vendor/bin/phpunit --filter StockControllerTest
C:/tools/php83/php.exe vendor/bin/phpunit tests/Feature/StockOpnameApiTest.php
C:/tools/php83/php.exe vendor/bin/phpunit tests/Feature/StockAdjustmentApprovalTest.php
# FE
cd Frontend && npx tsc --noEmit && npm run lint
```

