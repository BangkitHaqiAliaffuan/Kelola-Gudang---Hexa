# Kelola Gudang Pro — Dokumen Pengujian Komprehensif (Delta)

> **Melengkapi** `Frontend/docs/manual-testing.txt` v2026-08-21 (1433 baris, S-Axx s/d S-Ixx). Dokumen ini **tidak mengulang** S-Axx–S-Ixx, hanya delta 2026-08-21 → 2026-08-24 (15 commit + 3 file tertunda `e78b96e`). Lihat `tes-manual-2026-08-18.md`/`tes-manual-2026-08-19.txt` untuk history patch (sudah diarsipkan).

**Versi:** 2026-08-24  
**Cakupan:** 62 file backend/frontend (+2142/-531) dalam 15 commit + 363 test PHPUnit + 43 Vitest
**Prasyarat:** `composer dev` (8000) + `npm run dev` (8080), DB `kelolagudang`, `DEMO_PASSWORD`, akun `docs/akun-login.md` (Rudi Admin, Siti Supervisor, Bayu Operator, Dewi Auditor, Agus Operator, Nur Supervisor)

---

## Cara Memakai

- Kode skenario `S-Jxx` s/d `S-Oxx` melanjutkan penomoran `manual-testing.txt`.
- Kolom: `Endpoint / Route` | `Pre-kondisi (Role)` | `Langkah` | `Hasil Harap (status + json path)` | `File Acuan:line`
- Marker `HARAP LIHAT` untuk verifikasi visual, `Lulus/Gagal+Catatan` per skenario.
- Re-login per role untuk menguji RBAC.

---

## S-Jxx — Departemen & Harga Minimal 100

### S-J01 — `POST /api/master/departments` cegah Administrator (Backend `StoreDepartmentRequest.php:20`)
| Endpoint | Pre-kondisi | Langkah | Hasil Harap |
|----------|-------------|---------|-------------|
| `POST /api/master/departments` `role.access:Master Data` Tulis | Login `Administrator` (Master Data Kelola) | `{"name":"Dept Test","head_user_id":1}` dimana `1 = Rudi Admin` | `422` `errors.head_user_id` = `"Administrator tidak boleh menjadi kepala departemen atau user tidak aktif."` |
| `POST /api/master/departments` | Login `Supervisor` | `{"name":"Dept Valid","head_user_id":2}` (`Siti Supervisor`, `is_active=true`) | `201` `data.head_user_id=2` `data.head="Siti Aminah"` |

### S-J02 — `PUT /api/master/departments/{id}` (Backend `UpdateDepartmentRequest.php:22`)
| Langkah | Hasil Harap |
|---------|-------------|
| Buat dept valid (`S-J01` kedua), lalu `PUT {head_user_id:1}` | `422` |
| `PUT {head_user_id:null}` | `200` `head=null` `head_user_id=null` |

### S-J03 — Model guard (`Department.php:20` `booted()`)
| Langkah | Hasil Harap |
|---------|-------------|
| `Department::factory()->create(['head_user_id'=>adminId])` via tinker | `ValidationException` |

### S-J04 — Factory & Seeder (`DepartmentFactory.php:21`, `DepartmentSeeder.php:22`)
| Langkah | Hasil Harap |
|---------|-------------|
| `Department::factory()->create()` tanpa override | `head.role` ∈ `Supervisor/Operator/Auditor` (bukan `Administrator`) |
| `php artisan db:seed --class=DepartmentSeeder` | `DEP-001 Produksi` → `Siti Aminah` (Supervisor), bukan `Rudi` |

### S-J05 — Migrasi data (`2026_08_21_000003_fix_admin_department_heads.php:10`)
| Langkah | Hasil Harap |
|---------|-------------|
| DB lama `head_user_id IN (SELECT id WHERE role='Administrator')` → `php artisan migrate` | `head_user_id` menjadi `NULL` |

### S-J06 — Frontend Filter (`master-forms.tsx:3182`)
| Route | Langkah | Hasil Harap |
|-------|---------|-------------|
| `Master → Departemen → Tambah` | Buka dropdown Kepala | Tidak menampilkan `Rudi Hartono — USR-001`, hanya 5 user non-admin aktif (`Siti — USR-002` dst) + hint `Administrator tidak dapat menjadi kepala departemen.` |

### S-J07 — Harga Minimal 100 (`StoreItemRequest.php:34`, `schemas.ts:34`)
| Endpoint | Langkah | Hasil Harap |
|----------|---------|-------------|
| `POST /api/master/items` | `{"sku":"SKU-TEST-001","name":"Test","category_id":1,"cost":1,"price":2}` | `422` `errors.cost/price` `min:100` |
| `POST /api/master/items` | `{"cost":2500,"price":4000}` | `201` `data.cost=2500` |

---

## S-Kxx — SoD Laporan (StockDocument)

### S-K01 — `POST /api/persediaan/stock-documents` `requester_user_id` (`StockDocument.php:32`, `StockDocumentController.php:181`)
| Langkah | Hasil Harap |
|---------|-------------|
| Login `Auditor` (Persediaan Kelola), `POST {type:"Stock Adjustment", status:"Draft", ...}` | `201` `data.requester_user_id == Auditor.id` `data.requester == "Dewi Lestari"` |
| `GET /api/persediaan/stock-documents/{id}` | `requester_user_id` + `requester` ter-expose |

### S-K02 — Self-post Draft Adjustment/Opname (`StockDocumentController.php:237,413,438`)
| Langkah | Hasil Harap |
|---------|-------------|
| Buat `Stock Adjustment Draft` sebagai `Auditor` → `POST .../{id}/post` sebagai `Auditor` sama | `422` `"Pembuat dokumen tidak boleh memposting laporannya sendiri. Minta user lain untuk memposting."` |
| `POST .../post` sebagai `Supervisor` (Persediaan Kelola, bukan requester) | `200` `status Selesai` `posted_at != null` |
| `POST .../cancel` sebagai requester | `422` (sama) |

**Catatan:** `Penerimaan`/`Pengeluaran`/`Transfer`/`Retur` dengan `status Selesai` langsung **tidak** terblokir (hanya `Adjustment`/`Opname`).

### S-K03 — `postOpname` → `ADJ Draft` inherit (`StockDocumentService.php:103`)
| Langkah | Hasil Harap |
|---------|-------------|
| Selesaikan Opname (variance ≠0) → cek `ADJ` baru `GET /api/persediaan/stock-documents?source_document_id={opnameId}` | `ADJ` `requester_user_id == opname.requester_user_id` |

### S-K04 — Frontend Gate (`stock-document-sheet.tsx:148`)
| Route | Langkah | Hasil Harap |
|-------|---------|-------------|
| `/persediaan/adjustment` buka `Stock Adjustment Draft` milik sendiri | Tombol `Posting`/`Batalkan` disabled + banner merah `Pembuat dokumen tidak boleh...` |

---

## S-Lxx — Barang Keluar & Retur Pembelian

### S-L01 — Barang Keluar filter per Gudang (`barang-keluar-form.tsx:140-210`)
| Langkah | Hasil Harap |
|---------|-------------|
| Belum pilih Gudang → Barang combobox | `[]` + placeholder `Pilih Gudang dulu` |
| Pilih Gudang A (`warehouse_id=1`) | Barang hanya yang `stock>0` di `warehouse_id=1` (`itemIdsInWarehouse`) — barang hanya di Gudang B tidak muncul |
| Ganti Gudang A→B | `binId` ter-reset `""`, Barang list refresh |
| Pilih Barang X (stok di Bin 1 & 3) → Asal Bin | Hanya `Bin 1, Bin 3, Lantai` (jika ada) di Gudang A, urut `available` desc (`binCandidatesByItem`) |

### S-L02 — Tujuan Wajib (`barang-keluar-form.tsx:283`, `StoreStockDocumentRequest.php:46`)
| Langkah | Hasil Harap |
|---------|-------------|
| Submit tanpa Tujuan | FE `toast.error("Pilih tujuan terlebih dahulu.")`, BE `422` `errors.partner` `The partner field is required.` |
| Isi Tujuan `Departemen Produksi` → Submit Draft | `201` `data.partner="Departemen Produksi"` |

### S-L03 — Retur Pembelian Sisa & Available (`retur-pembelian-form.tsx:189,237,262,618`, `persediaan-types.ts:154`)
| Langkah | Hasil Harap |
|---------|-------------|
| Buat BM `qty 50` Gudang A Bin X lantai, posting Selesai → buat Retur 30 (Selesai) → sisa `20` | Buka **Tambah Retur Pembelian** pilih BM yang sama → `Sisa 20 dari 50 — BM/2026/001` (bukan `Maks 50`), `Tersedia di Bin 20` (bukan 50 atau nilai Gudang B) |
| Ganti Gudang A→B | `Tersedia —` (tidak ada stok X di B), `Sisa` tetap `20` |
| Coba qty `25` | FE `Melebihi jumlah dari dokumen sumber (maks 20)` merah + BE `422 sisa 20` sinkron |

### S-L04 — Retur Bin & Opsi A
| Langkah | Hasil Harap |
|---------|-------------|
| BM tanpa bin (lantai) → Retur | `availableByKey` key `warehouse:NULL` → `Tersedia di Bin` = `stock lantai Gudang A` (bukan tabrakan) |
| Draft boleh `qty > available` (per `b682330`), Selesai tidak | `Draft` `qty 25` → `201` (warning kuning), `Selesai` `qty 25` → `422` |

---

## S-Mxx — Scanner & Gudang-Scoped (18 picker)

### S-M01 — Hook `use-wms-scanner.ts` + `use-barcode-scanner.ts`
| Route | Langkah | Hasil Harap |
|-------|---------|-------------|
| `/transaksi/entri/keluar` `BarangKeluarForm` | Klik `ScanLine` per baris → Dialog `wms-reader` → arahkan barcode CODE128 dari `/barcode` (50×30) | `findItemByCode` normalisasi `trim+lower` → `pickItem` terisi, bin auto-suggest |
| Hardware USB (wedge) di 18 form | Scan fisik tanpa buka dialog → burst `<60ms` → `onScan` pilih barang (dialog tertutup) | `Persediaan Tulis` tanpa buka dialog tetap ter-pick |

*Daftar 18 picker:* `barang-masuk/masuk, barang-keluar, transfer, retur-pembelian/penjualan, adjustment, purchase-request/order, receive-goods, barcode, kartu-stock, nilai, stock-minimum` — semua `placeholder="Pilih barang / scan barcode"` + `searchPlaceholder="Cari nama, SKU, barcode..."`.

### S-M02 — Gudang-Scoped (`311b9d0`)
| Langkah | Hasil Harap |
|---------|-------------|
| Pilih Gudang → Barang list hanya `stock>0` di `warehouse_id` tersebut | Verifikasi via `GET /persediaan/stock?per_page=500` → `itemIdsInWarehouse` |

---

## S-Nxx — StatCard Loading (61 API)

### S-N01 — `kit.tsx:114` `loading`
| Langkah | Hasil Harap |
|---------|-------------|
| Throttling Slow 3G → buka `/persediaan/kartu-stock` | 4 StatCard `Saldo Awal` etc menampilkan `Skeleton h-7 w-24` bukan `0 pcs`/`Rp 0`; `DataTable` `TableSkeleton` |

*Daftar 61:* `index:3` (`Stock Menipis/Habis/Opname`), `kartu-stock:7`, `stock-minimum:4`, `nilai:6`, `laporan-stock:4`, `laporan-barang:8`, `opname/*:18`, `purchase-*:14`. Dummy 8 (`pengadaan.$section`, `laporan.$report` non-opname) tidak perlu skeleton.

*Verifikasi:* `isLoading ? Skeleton : formatX` + `valueTitle` hanya saat `!isLoading`; `isFetching` dengan `keepPreviousData` mempertahankan nilai lama (tidak skeleton).

---

## S-Oxx — Opsi A Lantai & Harga & Barcode Guard

* **Opsi A:** `POST Stock Opname {from_bin_id:null}` → `201` (sebelum `422`), `system_qty` = floor `stock` (`StockOpnameApiTest` uncommitted)
* **Harga:** `POST /api/master/items {cost:50}` → `422`
* **Barcode:** `ItemController@destroy` jika `stock_document_lines` ada → `422 Barang tidak dapat dihapus...`, `bwip-js` `scale:2 padding:10` → `viewBox 396x114`

---

## Verifikasi Otomatis

```bash
npx tsc --noEmit
npm run lint
npm test -- --run src/lib/barcode-label.spec.ts src/lib/stock-document-search.spec.ts # 43/43
php artisan test --filter=StoreStockDocumentApiTest # 46/46 (partner wajib)
php artisan test --filter=StockOpnameApiTest        # 21/21
php artisan test --filter=DepartmentApiTest         # 11/11
php artisan test                                     # 363/363
```

## Lampiran

* Sumber kebenaran RBAC: `Backend/app/Support/ApprovalEngine.php:35,118`, `routes/api.php:67`
* Seed: `DepartmentSeeder.php:22` → 5 user non-admin, `UserSeeder.php:29` 6 user
* File terkait: `StoreStockDocumentRequest.php:46`, `StockDocumentLineResource.php:12`, `manual-testing.txt:11` (arsipkan `tes-manual-2026-08-1x` ke `archive/`)

> Dokumen ini melengkapi `manual-testing.txt` v2026-08-21 — tidak mengulang S-Axx..S-Ixx (1433 baris). Untuk baseline penuh, gabungkan kedua file.
