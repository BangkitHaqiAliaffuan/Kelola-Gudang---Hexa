# Tes Manual — Perubahan 18 Agustus 2026

Dokumen uji manual untuk perubahan yang di-commit hari ini (`git log --since="2026-08-18"`):

| Commit    | Perubahan                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c088208` | API Stock Adjustment + fix warning over-stok form OUT + dashboard stat BM/BK + panel Perlu Perhatian + label bin `full_address` + stat card stock-minimum compact |
| `d2fe017` | Dashboard: stat card "hari ini" → total semua waktu                                                                                                               |
| `d045bda` | Form Stock Adjustment frontend + route `/persediaan/adjustment/new` + tombol "Buat Penyesuaian"                                                                   |
| `1bfe8b3` | Dashboard cepat via endpoint `summary` agregat + Aktivitas Terkini perPage=50 + Stock Opname Berjalan filter Draft                                                |
| `339199e` | Perbaikan layout route `/persediaan/adjustment` (list di index, parent `Outlet`) — form `/new` tampil                                                             |
| `9eaf6a5` | Retur Penjualan merujuk dokumen Barang Keluar sumber (`source_document_id`/`source_line_id`)                                                                      |
| `9373899` | Posting Opname = koreksi otomatis via Stock Adjustment ter-link                                                                                                   |
| `65d563d` | Gate kartu/tombol persetujuan pengadaan (Menunggu Saya / Perlu Persetujuan Saya)                                                                                  |

## Prasyarat

- Backend + frontend jalan. Disarankan `./dev.sh` dari root (Git Bash/MSYS). Port: API `127.0.0.1:8000`, UI `localhost:8080`. Pastikan port bebas sebelum start.
- Dev DB `kelolagudang` ter-seed (`php artisan db:seed` bila kosong; jangan `migrate:fresh`).
- Akun login: lihat `Frontend/docs/akun-login.md`. Password = nilai `DEMO_PASSWORD` di `Backend/.env`.

Akun utama:

| Code    | Nama         | Email                          | Role            | Akses approval pengadaan         |
| ------- | ------------ | ------------------------------ | --------------- | -------------------------------- |
| USR-001 | Rudi Hartono | `rudi.hartono@kelolagudang.id` | Administrator   | Ya (Pengadaan Kelola — override) |
| USR-002 | Siti Aminah  | `siti.aminah@kelolagudang.id`  | Supervisor      | Ya (modul Approval Pengadaan)    |
| USR-003 | Bayu Pratama | `bayu.pratama@kelolagudang.id` | Operator Gudang | Tidak                            |
| USR-004 | Dewi Lestari | `dewi.lestari@kelolagudang.id` | Auditor         | Tidak                            |

---

## Skenario A — Gate persetujuan pengadaan (commit `65d563d`)

Tujuan: role tanpa akses approval pengadaan **tidak** melihat tombol "Perlu Persetujuan Saya" / kartu "Menunggu Saya".

### A1. Role ber-akses approval melihat elemen approval

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Buka menu **Pengadaan → Purchase Request** (`/pengadaan/purchase-request`).
3. **Harap lihat**: kartu stat **"Perlu Persetujuan Saya"** dan tombol filter **"Perlu Persetujuan Saya"** (kanan bawah panel Filter) **muncul**.
4. Buka menu **Pengadaan → Purchase Order** (`/pengadaan/purchase-order`).
5. **Harap lihat**: kartu stat **"Menunggu Saya"** **muncul**.
6. Ulangi langkah 2–5 dengan **USR-002 Siti Aminah** (Supervisor). Hasil sama (elemen approval muncul).
7. Pada daftar PR, jika ada baris berstatus _Menunggu Approval_ yang dapat diputuskan role ini, **harap lihat**: pill kuning **"Perlu Persetujuan"** muncul di kolom Status (desktop) / **"Perlu Persetujuan Anda"** pada kartu mobile.

**Kolom hasil**: Lulus / Gagal + Catatan.

### A2. Role tanpa akses approval tidak melihat elemen approval

1. Login sebagai **USR-003 Bayu Pratama** (Operator Gudang).
2. Buka **Pengadaan → Purchase Request**.
3. **Harap lihat**: kartu stat **"Perlu Persetujuan Saya"** dan tombol filter **"Perlu Persetujuan Saya"** **TIDAK muncul**. Kartu lain (Total PR, Menunggu Approval, Disetujui, Nilai Total) tetap tampil.
4. Buka **Pengadaan → Purchase Order**.
5. **Harap lihat**: kartu **"Menunggu Saya"** **TIDAK muncul**.
6. Klik baris PR mana pun → detail sheet terbuka. **Harap lihat**: tombol **Setujui / Tolak TIDAK tersedia** untuk role ini.
7. Ulangi langkah 1–6 dengan **USR-004 Dewi Lestari** (Auditor). Hasil sama.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario B — Form Stock Adjustment (commit `c088208`, `d045bda`, `339199e`)

Tujuan: membuat dokumen penyesuaian stok (nomor `ADJ/YYYY/#####`) dengan qty bertanda + bin per arah + alasan wajib.

### B1. Akses halaman & route

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Buka **Persediaan → Adjustment** (`/persediaan/adjustment`) → daftar dokumen Stock Adjustment tampil.
3. **Harap lihat**: tombol **"Buat Penyesuaian"** (+ ) tampil (hanya bila role punya Persediaan **Tulis**).
4. Klik **"Buat Penyesuaian"** → form terbuka di `/persediaan/adjustment/new` (bukan blank/404 — regresi dari commit `339199e`).
5. Kembali ke daftar, buka langsung `/persediaan/adjustment/new` via URL → form tetap tampil.

**Kolom hasil**: Lulus / Gagal + Catatan.

### B2. Simpan Draft (penambahan stok)

1. Pada form: **Nomor** read-only berformat `ADJ/2026/#####`. Pilih **Tanggal** (default hari ini), **Gudang**, isi **PIC**, **Catatan** opsional.
2. Tambah baris: pilih **Barang** (combobox, bisa scan barcode), **Bin** tujuan, set arah **"+ Tambah"**, isi **Qty** (positif, mis. 5), pilih **Alasan** (mis. "Kesalahan penerimaan").
3. **Harap lihat**: tanpa memilih Alasan, muncul indikator amber pada field Alasan (alasan wajib selalu di form). Pilih alasan.
4. Klik **Simpan Draft**.
5. **Harap lihat**: toast sukses, dokumen Draft muncul di daftar `/persediaan/adjustment` dengan status _Draft_; **stok di Stock Saat Ini TIDAK berubah** (belum posting).
6. Klik baris Draft → detail sheet: **Harap lihat** kolom arah (+), rak/bin, dan alasan selisih terisi.

**Kolom hasil**: Lulus / Gagal + Catatan.

### B3. Validasi (harus ditolak/diblokir)

Coba masing-masing pada form baru (Simpan Draft):

1. **Qty 0** pada baris → ditolak (422 / validasi form).
2. Arah **"+ Tambah"** tanpa **Bin** → ditolak (bin tujuan wajib untuk IN).
3. Arah **"− Kurangi"** tanpa **Bin** → ditolak (bin asal wajib untuk OUT).
4. **Alasan kosong** → form menolak simpan (amber + tidak bisa submit).

**Kolom hasil**: Lulus / Gagal + Catatan.

### B4. Simpan & Posting (pengurangan stok)

1. Form baru: pilih **Barang** yang punya stok, set arah **"− Kurangi"**, **Qty** ≤ stok tersedia di bin, pilih **Alasan**.
2. **Harap lihat**: bin OUT hanya menampilkan bin yang berisi stok barang tsb; jika qty melebihi stok tersedia, muncul peringatan.
3. Klik **Simpan & Posting** → dialog konfirmasi → konfirmasi.
4. **Harap lihat**: toast sukses, dokumen berstatus **Selesai**, muncul di daftar.
5. Verifikasi dampak: **Persediaan → Stock Saat Ini** — stok barang/bin terkoreksi sesuai arah; **Persediaan → Kartu Stock** — ada baris mutasi baru dari dokumen ADJ tersebut (alasan tampil).

**Kolom hasil**: Lulus / Gagal + Catatan.

### B5. Posting OUT melebihi stok (harus gagal)

1. Form baru, arah **"− Kurangi"**, **Qty lebih besar** dari stok tersedia, Alasan diisi.
2. Klik **Simpan & Posting**.
3. **Harap lihat**: posting ditolak (422 "stok tidak cukup" / pesan server), dokumen tidak menjadi Selesai.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario C — Opname posting = koreksi ADJ otomatis (commit `9373899`)

Tujuan: menyelesaikan opname menghasilkan dokumen Stock Adjustment ter-link yang mengoreksi stok.

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Buka **Opname → Proses** (`/opname/proses`). Mulai sesi opname bila belum ada (atau gunakan sesi Draft yang ada).
3. Isi **hitungan fisik** (buat **selisih** untuk beberapa barang — fisik ≠ sistem; biarkan ≥ 1 baris **belum dihitung**).
4. Buka **Tinjau Hasil Opname**:
   - **Harap lihat**: ada ≥ 1 baris belum dihitung → tombol "Selesaikan Opname" nonaktif + pesan jumlah belum dihitung.
   - Isi fisik semua baris. Baris dengan selisih (variance ≠ 0) **wajib memilih Alasan**; tanpa alasan tombol tetap nonaktif.
   - Pilih alasan (mis. "Hilang / susut") untuk baris selisih.
5. Klik **"Selesaikan Opname"** → toast **"Opname selesai — koreksi ADJ dibuat otomatis"**.
6. Buka **Persediaan → Adjustment**:
   - **Harap lihat**: dokumen ADJ baru berstatus **Selesai** yang mengoreksi stok sesuai variance opname (baris +/−, alasan dari review).
   - Klik baris ADJ → detail: **Harap lihat** referensi/asal dari opname ter-link.
7. Verifikasi **Persediaan → Stock Saat Ini**: stok barang terkoreksi mengikuti hasil opname.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario D — Retur Penjualan sumber Barang Keluar (commit `9eaf6a5`)

Tujuan: retur penjualan (`RJ/YYYY/#####`) memakai dokumen Barang Keluar sumber (harga & bin dari baris Pengeluaran, qty dibatasi sisa).

1. Login sebagai **USR-001 Rudi Hartono** (Administrator).
2. Siapkan referensi: pastikan ada **Barang Keluar Selesai** (bisa buat via **Transaksi → Barang Keluar**).
3. Buka **Transaksi → Retur Penjualan** → **Buat Retur**.
4. Pilih **Gudang** → field **Dokumen Barang Keluar** menampilkan dokumen Pengeluaran Selesai di gudang tsb. Pilih salah satu.
5. **Harap lihat**: baris item muncul dengan **harga** dari baris Pengeluaran sumber dan **bin kembali** dari baris tsb.
6. Isi **qty retur ≤ sisa** yang dapat diretur. **Harap lihat**: qty melebihi sisa ditolak (cap sisa di server).
7. Isi **alasan retur** (masuk ke catatan). Kirim (Simpan/Selesai).
8. **Harap lihat**: toast sukses, dokumen `RJ/YYYY/#####` muncul di daftar retur penjualan; **Stock Saat Ini** barang kembali naik; **Kartu Stock** ada mutasi IN dari dokumen RJ.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario E — Dashboard (commit `c088208`, `d2fe017`, `1bfe8b3`)

Tujuan: kartu BM/BK total semua waktu, muat cepat, panel stok menipis/habis, opname berjalan = Draft.

1. Login sebagai **USR-001 Rudi Hartono** → dashboard (`/`).
2. **Harap lihat** kartu:
   - **Total Barang Masuk** / **Nilai Barang Masuk** / **Total Barang Keluar** — nilai = akumulasi **seluruh dokumen non-Draft** (bukan hanya hari ini; hint menampilkan jumlah dokumen).
   - **Stock Menipis** (di bawah minimum) & **Stock Habis** — terisi dari API stock-minimum.
   - **Pending Approval** & **Stock Opname Berjalan** (jumlah sesi Draft aktif).
3. **Harap lihat** panel **"Perlu Perhatian"** (stok di bawah minimum) menampilkan barang-barang kritis; klik salah satu → navigasi/aksi terkait.
4. **Harap lihat** panel **"Aktivitas Terkini"** memuat cepat (≈50 entri terbaru) tanpa menunggu seluruh dokumen.
5. **Harap lihat** panel **"Stock Opname Berjalan"** hanya berisi sesi berstatus **Draft**.
6. Muat ulang halaman: kartu BM/BK/Beli tampil seketika (data dari endpoint `summary` agregat), tidak ada "flash" kosong.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario F — Form OUT: warning over-stok saat refetch pasca-post (commit `c088208`)

Tujuan: setelah posting, warning over-stok tidak muncul selintas selama jendela refetch data.

1. Login sebagai **USR-001 Rudi Hartono**.
2. Buka form **Transaksi → Barang Keluar** (juga bisa di Retur Pembelian / Transfer Gudang).
3. Isi baris dengan qty valid, lalu **Simpan & Posting**.
4. **Harap lihat**: setelah posting, form tidak menampilkan warning "melebihi stok tersedia" yang salah/selintas saat data stok sedang di-refetch (pasca-post, stok sudah berkurang; warning harus konsisten dengan data terbaru).
5. Ulangi pada **Retur Pembelian** dan **Transfer Gudang** bila ingin cakupan penuh.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario G — Label bin memakai `full_address` (commit `c088208`)

1. Login sebagai **USR-001 Rudi Hartono**.
2. Buka **Master → Barang** → buka/edit sebuah barang (`/master/barang`).
3. Cari dropdown **Rak / Bin (Lokasi)**.
4. **Harap lihat**: label bin menampilkan **alamat penuh** (mis. kombinasi rak + bin seperti `A-01 · 01-01` atau format `full_address`), bukan hanya kode parsial.
5. Simpan perubahan bila ada → tersimpan tanpa error.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Skenario H — Stat card stock minimum compact (commit `c088208`)

1. Login sebagai **USR-001 Rudi Hartono**.
2. Buka **Persediaan → Stock Minimum** (`/persediaan/stock-minimum`).
3. **Harap lihat**: kartu stat "nilai kebutuhan" (atau kartu ringkas senama) tampil **compact** (format ringkas) dan memberi **hover** info detail (tooltip nilai penuh).
4. Layout kartu tidak bertabrakan/berantakan pada lebar layar biasa.

**Kolom hasil**: Lulus / Gagal + Catatan.

---

## Lampiran — Langkah cepat yang mungkin dibutuhkan

- Mulai server: `./dev.sh` (root, via Git Bash). Log: `.dev/logs/`.
- Buat Barang Keluar uji: **Transaksi → Barang Keluar → Buat** (butuh Persediaan Tulis).
- Buat sesi opname uji: **Opname → Proses → Mulai Sesi**.
- Lihat alasan selisih yang tersedia: _Kesalahan penerimaan, Kesalahan pengambilan, Rusak, Hilang / susut, Kekurangan dari supplier, Salah satuan, Transfer belum diproses, Salah lokasi / rak, Kesalahan input, Lainnya_.
