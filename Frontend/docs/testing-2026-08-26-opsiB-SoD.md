# Tes Manual — Perubahan 26 Agustus 2026 (Opsi B & SoD Store)

Dokumen uji manual untuk perubahan commit hari ini:
- `018aa3a` feat(persediaan): Opsi B retur & kartu-stock - Maks pakai sisa + total gudang
- `def969f` fix: remove redundant SoD gate in store for Stock Adjustment Selesai

| Commit | Perubahan |
| ------ | --------- |
| `018aa3a` | Opsi B: retur fleksibel per gudang, kartu-stock tambah kolom source, DataTable useEffect |
| `def969f` | SoD store: hapus gate otorisasi Selesai di store, posting sekarang hanya via /post terpisah |

## Prasyarat

- Backend + frontend jalan. Disarankan `./dev.sh` dari root (Git Bash/MSYS). Port: API `127.0.0.1:8000`, UI `localhost:8080`. Pastikan port bebas sebelum start.
- Dev DB `kelolagudang` ter-seed (`php artisan db:seed` bila kosong; jangan `migrate:fresh`).
- Akun login: lihat `Frontend/docs/akun-login.md`. Password = nilai `DEMO_PASSWORD` di `Backend/.env`.

Akun utama (role yang cocok skenario di bawah):

| Code | Nama | Role | Keterangan |
| ---- | ---- | ---- | ---------- |
| USR-001 | Rudi Hartono | Administrator | Punya Persediaan Tulis & Master Data Tulis |
| USR-002 | Siti Aminah | Supervisor | Punya Persediaan Tulis |
| USR-003 | Bayu Pratama | Operator Gudang | Tidak punya akses approval Persediaan |
| USR-004 | Dewi Lestari | Auditor | Tidak punya akses approval Persediaan |

---

## Skenario S-P01 — Kartu Stock: Transfer satu baris di tampilan Semua Gudang

**Tujuan:** Verifikasi `StockController:stockCard` skip `IN` mirror Transfer saat tanpa filter gudang (`018aa3a:226`).

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Buka **Persediaan → Kartu Stock** (`/persediaan/kartu-stock`), pilih barang contoh (mis. Beras 5kg).
3. Pastikan status kartu masih kosong/tidak ada mutasi Transfer.
4. Buat **Transfer Gudang** A→B barang Beras 5kg, status Selesai (bisa via `POST /api/persediaan/stock-documents` atau form UI).
5. Kembali ke halaman Kartu Stock, di filter **Gudang** pilih **Semua** (atau kosongkan filter gudang).
6. **Harap lihat:** tabel menampilkan **1 baris** dengan arah `A → B` (bukan 2 baris duplicate OUT+IN).
7. Ganti filter gudang menjadi **Gudang A** saja.
8. **Harap lihat:** hanya 1 baris keluar (`A → —`) muncul.
9. Ganti filter gudang menjadi **Gudang B** saja.
10. **Harap lihat:** hanya 1 baris masuk (`— → B`) muncul.

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Skenario S-P02 — Retur Pembelian: Boleh retur dari bin beda (selama gudang sama)

**Tujuan:** Validasi Opsi B — `from_bin` tidak harus sama dengan `to_bin` baris sumber RP (`018aa3a:334-`, `retur-pembelian-form.tsx:439-`).

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Siapkan referensi: pastikan ada **Barang Masuk Selesai** (BM) ke gudang A, bin `B01`, qty 10.
3. Buka **Transaksi → Retur Pembelian** → **Buat Retur**.
4. Pilih **Gudang** = A.
5. Isi baris: **Barang** (yamg ts tadi), **Asal Bin** = `B02` (beda, tapi gudang A sama), **Tujuan Bin** = biarkan kosong atau pilih bin lain di gudang A, **Qty** = 5, **Alasan** = "Kesalahan stok".
6. **Harap lihat:** tombol **Simpan Draft** aktif, simpan.
7. **Harap lihat:** dokumen `RP/YYYY/#####` muncul status **Draft**, stok gudang A belum berkurang.

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Skenario S-P03 — Retur Penjualan: Boleh retur ke bin beda (gudang sama)

**Tujuan:** Validasi Opsi B — `retur-penjualan-form.tsx` `return binOptions` tanpa filter bin sumber (`018aa3a:207+`).

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Siapkan referensi: pastikan ada **Barang Keluar Selesai** (BK) dari gudang A, bin `B01`, qty 10.
3. Buka **Transaksi → Retur Penjualan** → **Buat Retur**.
4. Pilih **Gudang** = A.
5. Isi baris: **Barang** (yamg tadi), **Asal Bin** = biarkan kosong, **Tujuan Bin** = `B02` (beda, gudang A sama), **Qty** = 4, **Alasan** = "Pengembalian customer".
6. **Harap lihat:** formulir menerima bin tujuan B02 tanpa error "harus sama dengan bin sumber".
7. Klik **Simpan Draft**.
8. **Harap lihat:** dokumen `RJ/YYYY/#####` status **Draft** berhasil disimpan.

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Skenario S-P04 — Retur Pembelian: Batas qty pakai total gudang (Selesai)

**Tujuan:** Cap `min(sisa, totalAvailable)` dengan pesan "di gudang" (`018aa3a:349`, `StockDocumentService:327`).

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Siapkan referensi: BM 10 ke gudang A, stok total gudang A benar-benar hanya 3 (bisa diaset via seeder atau cek item stock).
3. Buka **Transaksi → Retur Pembelian** → **Buat Retur** (dari BM tersebut).
4. Isi baris: **Qty** = 5, **Alasan** = "Stok banyak".
5. Pilih status **Selesai**.
6. Klik **Simpan & Posting** → konfirmasi.
7. **Harap lihat:** posting **ditolak** (422), pesan: *"Qty melebihi stok tersedia di gudang (tersedia 3, sisa 10, maks 3)"*.
8. Ulangi dari awal, tapi status **Draft**, Qty 5.
9. **Harap lihat:** posting **sukses** 201, dokumen disimpan Draft, stok tetap unchanged.

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Skenario S-Q01 — Stock Adjustment: Simpan Selesai tidak langsung posting (SoD)

**Tujuan:** `def969f` hapus SoD di `store`, SoD hanya di `post`/`cancel` (line 439/464) — sesuai `Backend/AGENTS.md`.

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Buka **Persediaan → Adjustment** → **Buat Penyesuaian**.
3. Isih form: Barang, Arah **− Kurangi**, Qty 2, Bin asal, Bin tujuan, Alasan mis. "Variance fisik".
4. Pilih status **Selesai**.
5. Klik **Simpan & Posting**.
6. **Harap lihat:** toast sukses, dokumen muncul di daftar dengan status **Selesai**, stok langsung ter-update (cek Persediaan → Stock Saat Ini).
7. *Alternatif:* Ulangi langkah 2–4, tapi klik hanya **Simpan Draft** (tanpa status Selesai).
8. **Harap lihat:** dokumen status **Draft**, stok belum berubah.

*Lalu*, tetap di halaman detail dokumen ADJ tsb, coba **POST** `.../post`:
- Sebagai **USR-001** (pembuat): **Harap lihat:** 422 pesan *"Pembuat dokumen tidak boleh memposting laporannya sendiri."*
- Sebagai **USR-002** (Supervisor/user lain): **Harap lihat:** 200 sukses, dokumen berstatus **Selesai** baru.

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Skenario S-Q02 — Tabel: Ganti filter balik ke halaman 1

**Tujuan:** `data-table.tsx:44 useEffect setPage(1)` saat `rows` berubah.

1. Login sebagai **USR-001 Rudi Hartono**.
2. Buka **Persediaan → Kartu Stock** (`/persediaan/kartu-stock`).
3. Pastikan ada filter metode (FIFO/Average/Maximum Cost) di atas tabel.
4. Pergi ke **Halaman 2** (caranya: scroll atau pilih nomor halaman manually jika ada).
5. Ganti filter metode menjadi **Average** (atau FIFO→Average).
6. **Harap lihat:** otomatis kembali ke **Halaman 1** (tanpa perlu scroll ke atas).

**Kolom hasil:** Lulus / Gagal + Catatan.

---

## Lampiran — Catatan awam

- **Opsi B** = stok dianggap satu kesatuan per gudang, bukan per bin individual. Retur bisa dari bin mana saja di gudang yang sama.
- **SoD Store** = metode `store` sekarang membuat Draft saja bila status Selesai; posting harus dipakai endpoint `/post` terpisah dan dipakaui user lain.
- Semua skenario di atas memerlukan **dua server** jalan sekaligus (Backend + Frontend).
- Jika hasil "Gagal", periksa konsol browser (Network tab) untuk status HTTP dan pesan error server.

---

**Selesai.** Lakukan `git add`, `git commit`, `git push` (tanpa force) setelah menyimpan file ini.