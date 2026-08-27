# Tes Faktual — 26 Agustus 2026 (Opsi B & Kartu Stock Ledger)

Dokumen uji manual faktual untuk 7 commit 2026-08-26 (bukan 8 — hash `81de7c4/02b644c/02d72fb` tidak ada di `git log`).

| Commit | Ringkasan faktual |
|--------|-------------------|
| `018aa3a` | Opsi B retur & kartu-stock: `StockController` skip `IN` mirror Transfer global, `StoreStockDocumentRequest` hapus cek `bin==source`, cap `min(sisa,total gudang)` → pesan `di gudang`, `retur-*-form` header `Tersedia di Gudang` + `globalAvailableByKey`, `DataTable` reset halaman |
| `def969f` | Hapus 4 baris `service->post` di `StockDocumentController::store` — `store Selesai` jadi Draft-only (intermediate, dibatalkan `d7546be`) |
| `637b221` | Docs `testing-2026-08-26-opsiB-SoD.md` (klaim SoD `Draft-only` **stale** setelah `d7546be`, tetap dibiarkan sebagai histori) |
| `d7546be` | Restore posting: `initialStatus=Draft` + `service->post` bila `Selesai` di `store` (Draft-first, langsung `Selesai`), test `Penerimaan Selesai creates movements` |
| `edcb2b5` | Sync 42 file Frontend (kartu-stock/mutasi/stock-minimum/nilai, master-forms, transaction-form, vercel.json, AGENTS.md, README, docs) |
| `cb519e1` | Kartu-stock: label `Saldo Awal` → `Saldo Sekarang` (`current_stock ?? saldo_akhir`) |
| `9abffce` | Kartu-stock ledger windowed: `dateFrom/dateTo` dikirim ke `GET /persediaan/stock-card?from&to` (server recompute `saldo_awal/akhir`), sort `asc`, `sortable:false` masuk/keluar/saldo/nilai |

> **Koreksi SoD vs docs lama:** `testing-2026-08-26-opsiB-SoD.md` lampiran "store Selesai = Draft-only, posting via `/post` terpisah" menggambarkan `def969f` (10:00) dan **tidak berlaku** di HEAD (`d7546be`+). Di HEAD, `POST /api/persediaan/stock-documents {status:Selesai}` **langsung 201 `Selesai` + `posted_at!=null`** via `service->post` dalam transaksi yang sama (SoD tetap di `POST /{id}/post` & `POST /{id}/cancel`: `requester_user_id !== auth` → 422).

## Prasyarat

- Dua server: `composer dev` di `Backend/` → `http://127.0.0.1:8000` + `npm run dev` di `Frontend/` → `http://localhost:8080`. Proxy `vite.config.ts:17-22` `/api`+`/sanctum` → `8000`, tapi auth **bearer-token** `kg-token` (`src/lib/api.ts:34-59` `Authorization: Bearer`), bukan cookie/CSRF.
- Dev DB `kelolagudang` seeded (jangan `migrate:fresh`). Akun lihat `Frontend/docs/akun-login.md`, password `DEMO_PASSWORD` (`Backend/.env`): `USR-001 Rudi Hartono` (Administrator), `USR-002 Siti Aminah` (Supervisor, Persediaan Tulis), `USR-003 Bayu Pratama`/`USR-004 Dewi Lestari` tanpa approval.

---

## S-P01 — Penerimaan Selesai langsung posting (Draft-first)

**Tujuan:** `StockDocumentController.php:183-252` `initialStatus` + `service->post` — `Selesai` tanpa endpoint `/post` terpisah, saldo langsung bertambah (`d7546be` test).

1. Login **USR-001**.
2. Via UI **Transaksi → Barang Masuk** (`/transaksi/masuk`) klik **Buat**, atau langsung `POST /api/persediaan/stock-documents` (Bearer) — `use-persediaan.ts:121-129`:
   ```json
   {"type":"Penerimaan","status":"Selesai","document_date":"2026-08-26","warehouse_id":1,"lines":[{"item_id":1,"qty":10,"to_bin_id":1,"unit_cost":1500}]}
   ```
3. Harap **201** `data.status=Selesai`, `data.posted_at!=null`, nomor `BM/2026/#####` (server `CodeGenerator`).
4. Cek **Persediaan → Stock Saat Ini** (`/persediaan/stock`, `useStockRows:22-27` `GET /persediaan/stock?per_page=500`) — stok item +10; atau `SELECT stock FROM item_stock WHERE item_id=1 AND warehouse_id=1 AND bin_id=1` =10.
5. Cek `stock_movements` `direction=IN qty=10`.

**Harap gagal bila:** tanpa `warehouse_id`/`to_bin_id`/`unit_cost` → 422.

---

## S-P02 — Kartu Stock: Transfer global 1 baris, filter gudang pemisah IN/OUT

**Tujuan:** `StockController.php` `isTransferInGlobal` skip mirror `IN` bila `warehouse_id` kosong (`018aa3a:226`); `persediaan.kartu-stock.tsx` kolom `A → B`.

1. Login **USR-001**, buka `/persediaan/kartu-stock`, pilih barang (mis. Beras 5kg), filter **Gudang = Semua** (kirim `warehouse_id=null` ke `GET /persediaan/stock-card?item_id=&method=FIFO&warehouse_id&from&to`, `use-persediaan.ts:30-59`).
2. Buat **Transfer Gudang** A→B 5 pcs `Selesai` via `/transaksi/transfer` (`destination_warehouse_id` beda).
3. Kembali kartu-stock **Gudang=Semua** → **1 baris** `A → B` (bukan OUT+IN duplikat). `Gudang=A` → `A → —`, `Gudang=B` → `— → B`.

---

## S-P03 — Kartu Stock ledger windowed + Saldo Sekarang

**Tujuan:** `9abffce` `dateFrom/dateTo` dikirim ke server (bukan filter client), recompute `saldo_awal/akhir`; `cb519e1` label `Saldo Sekarang`.

1. `/persediaan/kartu-stock` pilih barang, set **Tanggal Dari 2026-07-01 s/d 2026-08-26** (`input type=date`, `persediaan.kartu-stock.tsx:661-674`), metode `FIFO`.
2. Harap request `GET .../stock-card?from=2026-07-01&to=2026-08-26` (Network tab), tabel hanya baris dalam rentang, `Saldo Awal` dihitung ledger dan **label di atas tabel** `Saldo Sekarang: N` (`current_stock ?? saldo_akhir`), bukan `Saldo Awal`. Ganti rentang → tabel reload (bukan hide client).
3. Sort default **asc** (terlama dulu), kolom masuk/keluar/saldo/nilai **tidak sortable**.

---

## S-P04 — Retur Pembelian: bin fleksibel + cap `min(sisa,total gudang)`

**Tujuan:** `StoreStockDocumentRequest.php:237-369` hapus cek `from_bin==source.to_bin`, cap Selesai `min(remaining, SUM(stock-reserved) per gudang)`, FE header `Tersedia di Gudang` global (`retur-pembelian-form.tsx:197-265`).

1. Siapkan **BM Selesai** gudang A bin `B01` qty 10. Cek total gudang A untuk barang tsb (mis. `GET /persediaan/stock` → sum `available` per `warehouse_id:item_id` = 3 bila sudah banyak keluar).
2. **Transaksi → Retur Pembelian** (`/transaksi/retur-pembelian` → **Buat** `/transaksi/entri/retur-pembelian`) pilih **Gudang A**, search BM `Selesai`, pilih **Asal Bin = B02** (beda, gudang sama) — **tidak error** `harus sama` (Opsi B). Header kolom **Tersedia di Gudang** tampil `3` (global), `Maks` tooltip `min(sisa 10, 3)=3`.
3. Isi **Qty 5, Alasan "Kesalahan"**, status **Selesai** → **Simpan & Posting** → **422** `_Qty melebihi stok tersedia di gudang (tersedia 3, sisa 10, maks 3)_` (`018aa3a:349`).
4. Ubah Qty 3 **Selesai** → **201 Selesai**. Ubah Qty 5 **Draft** → **201 Draft** (Draft pakai `remaining` saja, `Selesai` pakai `min`).

---

## S-Q01 — Retur Penjualan: bin tujuan fleksibel (gudang sama)

**Tujuan:** `retur-penjualan-form.tsx` `lineBinOptions` = semua `binOptions` gudang.

1. Siapkan **BK Selesai** gudang A bin `B01` qty 10.
2. `/transaksi/entri/retur-penjualan` pilih **Gudang A**, sumber BK, **Tujuan Bin = B02** (beda) → tidak error `harus sama dengan bin sumber`.
3. Qty 4 **Draft** → **201 Draft** (`RJ/2026/#####`, cek `remaining` saja, tidak ada cap total gudang untuk RJ).

---

## S-Q02 — Stock Adjustment SoD Draft-first (posting langsung + gate `/post`)

**Tujuan:** `StockDocumentController.php:183-252` `Selesai` langsung posting; `post/cancel:441-471` tolak self-post; `stock-adjustment-form.tsx:315` `reason_code` wajib **baik Draft maupun Selesai** + `StockDocumentService:221-231` `Alasan selisih wajib`.

1. **Persediaan → Adjustment → Buat** (`/persediaan/adjustment/new`) isi **Barang, Bin, Arah −, Qty 2** tanpa **Alasan** → **Simpan Draft** → toast `Alasan selisih wajib diisi untuk 1 baris.` (UI block, bukan 201). Isi **Alasan = "Variance fisik"** → **Simpan Draft** → 201 `ADJ/... Draft`, **stock tidak berubah** (SoD Draft, `is_posted` false).
2. Ulangi, Alasan terisi, **Simpan & Posting (Selesai)** sebagai **USR-001** → **201 Selesai `posted_at!=null`**, stock langsung ±2 (cek `/persediaan/stock`). _Koreksi vs docs lama:_ bukan Draft-only.
3. Tetap di detail `ADJ` Draft dari langkah 1, `POST /api/persediaan/stock-documents/{id}/post` sebagai **USR-001 (pembuat)** → **422** `Pembuat dokumen tidak boleh memposting laporannya sendiri.` Sebagai **USR-002** → **200 Selesai**.

---

## S-Q03 — Tabel ganti filter kembali halaman 1

**Tujuan:** `data-table.tsx:44` `useEffect setPage(1)` saat `rows` berubah.

1. `/persediaan/kartu-stock` pilih barang, pergi **Halaman 2**, ganti metode `FIFO → Average` → otomatis **Halaman 1**.

---

## Verifikasi cepat (cURL)

```sh
TOKEN=$(curl -s http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"rudi@kelolagudang.test","password":"$DEMO_PASSWORD"}' | jq -r .token)
curl -s http://127.0.0.1:8000/api/persediaan/stock-card?item_id=1&method=FIFO&from=2026-07-01&to=2026-08-26 \
  -H "Authorization: Bearer $TOKEN" | jq .data.saldo_awal,.data.saldo_akhir
curl -s http://127.0.0.1:8000/api/persediaan/stock-documents -H "Authorization: Bearer $TOKEN" | jq '.data[]|{no,type,status}'
```

Jika **Gagal**, cek Network tab `422` + `message` (remaining/totalAvailable/reason_code), dan `Backend/storage/logs/laravel.log`.
