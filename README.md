# Kelola Gudang Pro

Sistem Manajemen Gudang (Warehouse Management System / WMS) berbahasa Indonesia — monorepo berisi frontend React dan API backend Laravel yang sudah terintegrasi dan siap dipakai operasional gudang: master data, persediaan, transaksi barang, stock opname, pengadaan, laporan, barcode, sampai kontrol akses berbasis role.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Arsitektur & Tech Stack](#arsitektur--tech-stack)
- [Prasyarat](#prasyarat)
- [Cara Menjalankan](#cara-menjalankan)
- [Akun Demo](#akun-demo)
- [Struktur Repository](#struktur-repository)
- [Alur Kerja Penting](#alur-kerja-penting)
- [Ringkasan API](#ringkasan-api)
- [Verifikasi (Lint / Typecheck / Test)](#verifikasi-lint--typecheck--test)
- [Deploy Produksi](#deploy-produksi)
- [Aturan Penting](#aturan-penting)

## Fitur Utama

| Modul | Isi |
| ----- | --- |
| **Dashboard** | Widget stok, grafik barang masuk/keluar, timeline aktivitas, quick action |
| **Master Data** | Barang (+ bulk import/eksport CSV), Kategori, Sub Kategori, Merk, Satuan, Gudang, Rak, Bin Location, Supplier, Customer, Vendor, Departemen, Proyek, Work Order, User, Role (+ matriks hak akses) |
| **Persediaan** | Stock Saat Ini, Kartu Stock (FIFO / Average / Maximum Cost), Mutasi Stock, Stock Minimum, Stock Adjustment, Nilai Persediaan |
| **Transaksi** | Barang Masuk, Barang Keluar, Transfer Gudang (pasangan OUT+IN), Retur Pembelian, Retur Penjualan |
| **Stock Opname** | Jadwal → Proses (scan barcode + input fisik) → Hasil/Selisih; penyelesaian opname membuat dokumen Adjustment **Draft** untuk diposting terpisah |
| **Pengadaan** | Purchase Request, Purchase Order (+ cetak), Receive Goods, alur approval berjenjang |
| **Laporan** | Stock, Mutasi, Kartu Stock, Nilai Persediaan, Stock Minimum, analitik barang keluar & transaksi |
| **Barcode** | Generate barcode/QR, preview & cetak label (30×20, 50×30, 100×50, A4), scan via kamera |
| **System** | Pengaturan, audit trails, hak akses per modul |

UI sepenuhnya Bahasa Indonesia, responsif (tabel menjadi kartu di mobile, bottom navigation + FAB), dengan 8 tema pastel dan mode gelap/terang.

## Arsitektur & Tech Stack

```
Kelola-Gudang---Hexa/
├── Frontend/   # TanStack Start + React 19 + TanStack Router/Query, Tailwind CSS v4, shadcn/ui
├── Backend/    # Laravel 13 API (PHP 8.3+), Sanctum bearer-token, PostgreSQL 16
└── dev.sh      # Menjalankan kedua server sekaligus (+ tunnel ngrok opsional)
```

- **Frontend** (`http://localhost:8080` saat dev): file-based routing di `src/routes/`; halaman yang butuh data server mengambil dari API Laravel, sisanya memakai dummy data realistis (`src/lib/wms-data.ts`). Tidak ada paginasi server — hooks mengambil semua (`per_page=10000`) lalu paginasi di sisi klien.
- **Backend** (`http://127.0.0.1:8000` saat dev): REST API di bawah prefix `/api`. Kebenaran stok adalah ledger `item_stock` + `stock_movements` (kolom `items.stock`/`reserved` hanya proyeksi denormalisasi).
- **Auth**: Sanctum bearer-token saja (tanpa cookie/CSRF). Token disimpan di `localStorage` (`kg-token`) dan dikirim sebagai `Authorization: Bearer`.
- **RBAC**: peta `(role, module)` → level (`Baca`/`Tulis`/`Kelola`) di tabel `role_permissions`; level kebutuhan diturunkan dari HTTP verb (GET/HEAD baca, POST/PUT/PATCH tulis, DELETE kelola). Detail: `AGENTS.md`.

## Prasyarat

- **Node.js + npm** (frontend), **PHP 8.3+ + Composer** (backend)
- **PostgreSQL 16** di `127.0.0.1:5432`, user/password `postgres`/`postgres`
- Dua database: `kelolagudang` (dev) dan `kelolagudang_test` (test):

```sql
CREATE DATABASE kelolagudang;
CREATE DATABASE kelolagudang_test;
```

## Cara Menjalankan

### 1. Backend (Laravel)

```sh
cd Backend
cp .env.example .env          # lalu isi DEMO_PASSWORD (wajib, lihat bawah)
composer install
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve              # http://127.0.0.1:8000
```

> `DEMO_PASSWORD` di `Backend/.env` **wajib diisi** sebelum seeding — ini menjadi password semua akun demo. Nilai password tidak disimpan di repo. Jika login gagal ("Kredensial tidak cocok"), kemungkinan DB kosong: jalankan `php artisan db:seed` (aman diulang, setiap seeder punya guard).

### 2. Frontend

```sh
cd Frontend
npm install
npm run dev                   # http://localhost:8080
```

> Butuh **kedua server** berjalan: Vite mem-proxy `/api` + `/sanctum` ke Laravel. Error "Tidak dapat terhubung ke server backend" = Laravel belum jalan.

### 3. Sekaligus via `dev.sh` (Linux / Git Bash)

```sh
./dev.sh                 # backend + frontend + tunnel ngrok
SKIP_TUNNEL=1 ./dev.sh   # tanpa ngrok (cukup untuk dev lokal)
```

Log di `.dev/logs/`; berhenti dengan Ctrl+C. Gagal start jika port 8000/8080 sudah terpakai.

## Akun Demo

Password semua akun = nilai `DEMO_PASSWORD` di `Backend/.env`:

| Code | Nama | Email | Role |
| ---- | ---- | ----- | ---- |
| USR-001 | Rudi Hartono | `rudi.hartono@kelolagudang.id` | Administrator |
| USR-002 | Siti Aminah | `siti.aminah@kelolagudang.id` | Supervisor |
| USR-003 | Bayu Pratama | `bayu.pratama@kelolagudang.id` | Operator Gudang |
| USR-004 | Dewi Lestari | `dewi.lestari@kelolagudang.id` | Auditor |
| USR-005 | Agus Salim | `agus.salim@kelolagudang.id` | Operator Gudang |
| USR-006 | Nur Hidayat | `nur.hidayat@kelolagudang.id` | Supervisor |

Gunakan **USR-001 (Administrator)** untuk akses semua modul. Hak akses role lain bisa diubah di halaman Master → Role.

## Struktur Repository

```
.
├── AGENTS.md            # Instruksi lintas-sisi untuk sesi AI (kontrak, git, multi-session)
├── dev.sh               # Runner 2 server + ngrok
├── README.md            # File ini
├── Frontend/
│   ├── AGENTS.md        # Aturan sisi frontend (routing, API hooks, konvensi UI)
│   ├── src/
│   │   ├── routes/      # File-based routing (routeTree.gen.ts = auto-generated, jangan edit)
│   │   ├── hooks/       # use-master.ts, use-persediaan.ts, use-auth.tsx, ...
│   │   ├── lib/         # api.ts (klien HTTP), master-types.ts, schemas.ts (zod), wms-data.ts (dummy)
│   │   └── components/wms/  # kit.tsx, data-table.tsx, master-crud.tsx, nav.ts, ...
│   ├── docs/            # Panduan tes manual (.txt) + spec/login (.md)
│   └── vercel.json      # Rewrite /api + /sanctum → tunnel ngrok (produksi)
└── Backend/
    ├── AGENTS.md        # Aturan sisi backend (konvensi API, skema, seeder)
    ├── routes/api.php   # Kebenaran permukaan API
    ├── app/
    │   ├── Http/Controllers/  # Auth, *Controller master, Stock*, ProcDoc, Laporan, Role
    │   ├── Http/Middleware/EnsureRoleAccess.php  # Gate RBAC (alias role.access)
    │   ├── Models/      # RolePermission (MODULES/LEVELS), StockDocument, ...
    │   └── Services/    # StockLedger, StockDocumentService (posting dokumen)
    └── database/seeders/  # UserSeeder, RolePermissionSeeder, StockDocumentSeeder, ...
```

## Alur Kerja Penting

- **Barang Masuk/Keluar/Transfer/Retur** (menu Transaksi) mem-posting ke `POST /api/persediaan/stock-documents` — butuh hak **Persediaan Tulis** walau menunya di bawah Transaksi.
- **Transfer Gudang** menulis pasangan movement OUT+IN yang tertaut (`pair_id`) dan mengirim `destination_warehouse_id`.
- **Retur** wajib merujuk dokumen sumber (`source_document_id`/`source_line_id`): Retur Pembelian → dokumen Penerimaan (nomor `RP`), Retur Penjualan → dokumen Pengeluaran (nomor `RJ`).
- **Stock Opname** tidak langsung menggerakkan stok (0 movement). Saat opname diselesaikan, sistem membuat dokumen **Adjustment Draft** — stok baru berubah setelah dokumen itu diposting dari halaman Penyesuaian.
- **Pengadaan**: PR/PO → submit → approval berjenjang (hanya approver yang ditugaskan) → receive goods. `reassign` approver butuh Pengadaan Kelola.
- **Kartu Stock & Nilai Persediaan** dihitung (fold) dari ledger `stock_movements` per metode penilaian (FIFO/Average/Maximum Cost).

## Ringkasan API

Kebenaran penuh: `Backend/routes/api.php`. Garis besarnya:

- `POST /api/auth/login` (throttle 5/menit → `{data, access, token}`), `GET /api/auth/me`, `POST /api/auth/logout`
- `/api/master/*` → `Master Data`: `categories`, `sub-categories`, `merks`, `units`, `warehouses`, `racks`, `bins`, `suppliers`, `customers`, `vendors`, `users`, `roles`, `departments`, `projects`, `work-orders`, `items` (+ `bulk-delete`/`bulk-status`/`bulk-import`, `lookup`, `cost-drift`, `sync-cost`)
- `/api/persediaan/*` → `Persediaan`: `stock`, `stock-card`, `stock-minimum`, `valuation`, `stock-documents` (+ `summary`, `post`/`cancel`, `submit-approval`/`submit-review`, `lock`/`heartbeat`/`unlock`/`force-unlock`, `approve`/`reject`/`approve-review`/`reject-review`)
- `/api/pengadaan/*` → `Pengadaan`: `proc-docs` (+ `submit`/`cancel`/`approve`/`reject`/`reassign`)
- `/api/laporan/*` → `Laporan`: `mutasi`, `keluar-analytics`, `transaksi-analytics`

Respons memakai envelope `{data}` untuk tunggal dan `{data, links, meta}` untuk koleksi paginasi; error validasi mengikuti format Laravel (`message` + `errors` per field).

## Verifikasi (Lint / Typecheck / Test)

```sh
# Frontend (dari Frontend/)
npm run lint          # eslint
npx tsc --noEmit      # typecheck (tidak ada script khusus)
npm test              # vitest run

# Backend (dari Backend/)
composer test         # php artisan test di DB kelolagudang_test
php artisan test --filter=NamaTest   # satu test
vendor/bin/pint       # formatter
```

Catatan: instalasi `bun` punya guard `minimumReleaseAge` 24 jam (`bunfig.toml`) — dependensi yang baru rilis <24 jam akan gagal diinstal kecuali dimasukkan ke daftar pengecualian (konfirmasi dulu).

## Deploy Produksi

Frontend di-deploy ke Vercel dengan `VITE_API_URL` **dikosongkan** (fallback same-origin `/api`). `Frontend/vercel.json` me-rewrite `/api/*` + `/sanctum/*` ke URL tunnel ngrok yang menunjuk ke backend. Karena URL ngrok berubah tiap restart, `dev.sh` otomatis memperbarui `vercel.json` — commit + redeploy Vercel setiap kali URL berubah.

## Aturan Penting

- **JANGAN PERNAH** menjalankan `migrate:fresh` (atau perintah penghapus DB lain) di DB dev `kelolagudang` tanpa instruksi eksplisit — menghapus user/master/stok/`role_permissions` dan merusak login. Untuk DB kosong cukup `php artisan db:seed`.
- Jangan commit secret: `.env*`, `*.key`/`*.pem`/`*.p12`, `ngrok.yml`, kredensial/password literal.
- Panduan tes manual ada di `Frontend/docs/*.txt` (verifikasi via UI browser saja). Detail aturan kontribusi AI: `AGENTS.md`.
