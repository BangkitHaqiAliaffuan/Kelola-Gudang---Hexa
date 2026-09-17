# ROADMAP — WAREHOUSE SCOPING PER ROLE (Fase F7)

**Tanggal**: 2026-09-17 · **Status**: Draft, siap dieksekusi bertahap
**Sumber**: Crosscheck mendalam live code (2026-09-17) atas model otorisasi RBAC + verifikasi absennya dimensi gudang.
**Cakupan**: Menambahkan dimensi **lingkup gudang** (row-level scoping) ke atas RBAC yang sudah ada, secara **dinamis** (role pusat lintas-gudang ↔ role terikat gudang tertentu; admin atur gudang mana saja yang boleh dipegang per role/user).
**Luar cakupan**: Perombakan auth cookie HttpOnly (masih usulan jangka panjang terpisah).
**Aturan eksekusi**: satu fase dalam satu waktu; tiap fase selesai → `composer test` (Backend) + `npm run lint` + `npx tsc --noEmit` + `npm test` (Frontend) hijau sebelum lanjut. **DILARANG** `migrate:fresh` di DB dev `kelolagudang` (lihat root `AGENTS.md`). Klaim path di `.dev/claims.md` sebelum edit. **JANGAN** `git add .` — commit per-path eksplisit bila diminta.

---

## 0. Latar & Temuan Crosscheck (fakta live code)

### 0.1 Kondisi saat ini: gudang = filter klien, bukan kontrol server
| Fakta | Bukti (file:line) |
|---|---|
| `warehouse_id` = query param **nullable** yang dikirim klien, dipakai `->when(...)` | `StockController.php:40`, `StockDocumentController.php:69,95`, `ProcDocController.php:60`, `LaporanController.php:38,68,152` |
| Tidak ada global scope / paksa-gudang dari user | grep `globalScope`/`scopeForUser` → **kosong** |
| `users.default_warehouse_id` = **1 FK nullable**, murni preferensi FE | `use-warehouse-filter.ts` (localStorage `kg-wh-filter:<userId>` → fallback "Semua") |
| `GET /master/warehouses` **tak di-scope** | `WarehouseController::index` — semua role lihat semua gudang |
| Tidak ada tabel pivot multi-gudang | grep `user_warehouse` → **tidak ada** |

**Konsekuensi**: user dengan `default_warehouse_id = Gudang A` **tetap** bisa (a) memilih "Semua" di FE, (b) memanggil API langsung `?warehouse_id=B` → server mengembalikan data Gudang B. **Tidak ada batas.**

### 0.2 Role dinamis sekarang TIDAK bisa mewadahi skenario ini (struktural)
Role dinamis memodelkan **tepat satu dimensi**: `(role, module, level)`.
| Artefak | Ada dimensi gudang? |
|---|---|
| `RolePermission::MODULES` (9 modul domain) / `LEVELS` | ❌ |
| `StoreRoleRequest` / `UpdateRoleRequest` (`access[].module/level`) | ❌ |
| `RoleController::store/update`, `RoleResource` | ❌ |
| `EnsureRoleAccess` (cek module×level dari verb) | ❌ |
| FE `ACCESS_MODULES` / `RoleEditDialog` | ❌ |

**Akar konseptual**: RBAC menjawab *"boleh apa"*; skenario pusat-vs-operator menjawab *"atas data mana"* (row-level). Itu **ABAC/row-level scoping** — kelas otorisasi berbeda, **orthogonal** terhadap RBAC. Role dinamis tetap berguna (memisahkan *jenis* pekerjaan), tapi tidak akan pernah menutup lingkup gudang.

### 0.3 Crosscheck dokumen proyek
`blueprint-roadmap-skalabilitas-wms.md` & `roadmap-final-skalabilitas-wms.md` menyebut **"multi-gudang"** sebagai **target SKALA** (kapasitas/parallelisme), **bukan** kontrol akses. Tidak ada rencana scoping gudang per-role di roadmap mana pun.

**Kesimpulan §0**: perlu **lapisan otorisasi baru di atas RBAC** — bukan sekadar konfigurasi role. Dokumen ini merancangnya.

---

## 0b. Keputusan desain yang DIKUNCI (jangan dibuka lagi saat eksekusi)

| # | Keputusan | Alasan |
|---|---|---|
| W1 | Scoping diterapkan **di server (global scope + middleware)**, bukan FE | FE hanya kosmetik; API bisa dipanggil langsung (termasuk Developer Console). Konsisten S1 (chokepoint tunggal). |
| W2 | **Dua mode lingkup** per role: `Semua` (lintas-gudang) dan `Terbatas` (hanya gudang yang ditugaskan) | Memenuhi "pusat vs operator" tanpa membelah modul. |
| W3 | Sumber lingkup = **KOMBINASI**: default dari **role** (`warehouse_scope_mode`), daftar gudang konkret dari **user** (pivot `user_warehouse`) | Role menentukan *apakah* dibatasi; user menentukan *gudang mana*. Role pusat → user tak perlu pivot. |
| W4 | User ber-role `Terbatas` **WAJIB** punya ≥1 gudang di `user_warehouse`; bila kosong → tolak simpan user (422) **kecuali** `default_warehouse_id` diisi sebagai fallback otomatis | Cegah user "terkunci buta" (tidak bisa lihat apa pun) karena salah konfigurasi. |
| W5 | **`default_warehouse_id` tetap ada** sebagai *gudang aktif/default tampilan*; bila user `Terbatas` dan belum punya pivot, `default_warehouse_id` otomatis jadi satu-satunya gudang | Kompatibilitas mundur + tidak memaksa migrasi data langsung. |
| W6 | Operasi **BACA** → filter **diam** (scope menyempitkan hasil). Operasi **TULIS** ke gudang di luar izin → **403/422 eksplisit** | Konsisten pola S8 (baca ikut akses, tulis diperketat) + kejelasan error. |
| W7 | **`GET /master/warehouses` di-scope**: user `Terbatas` hanya menerima gudang miliknya | Dropdown FE otomatis benar tanpa logika ganda; menutup enumerasi gudang. |
| W8 | **Transfer Gudang**: user `Terbatas` hanya boleh transfer **DARI** gudang yang diizinkan; gudang **tujuan** bebas (selama aktif) | Barang bisa keluar lintas gudang (proses bisnis sah), tapi tidak boleh *memulai* dari gudang asing. Dokumentasikan sebagai aturan eksplisit. |
| W9 | **Master `items` TIDAK di-scope** — hanya **stok/transaksi/dokumen bergudang** yang di-scope | `items.default_warehouse_id` nullable & item itu global; salah scope → item hilang dari master (regresi). |
| W10 | Role baru lahir `warehouse_scope_mode = 'Semua'` **kecuali** admin memilih `Terbatas` | Deny-by-default sudah dijaga deny permission; scope default permisif agar tidak memutus role lama. Perubahan ke `Terbatas` = keputusan sadar admin. |
| W11 | Mode `Terbatas` **fail-closed**: bila data scope tak bisa di-resolve (mis. role tak ditemukan) → user dianggap **punya nol gudang** (lihat kosong), bukan semua | Keamanan: jangan pernah gagal terbuka ke lintas-gudang. |
| W12 | Semua user/sesi **console & test** dianggap `Semua` **kecuali** mode role-nya `Terbatas`; untuk menjaga suite lama, `seedBaseRoles()` (test) **wajib** men-set 4 role seed ke `warehouse_scope_mode='Semua'`, sehingga user test apa pun (termasuk `Operator Gudang`) tetap lintas-gudang | ⚠️ **KOREKSI crosscheck**: asumsi awal "user test default Semua" **SALAH** — mode ditentukan oleh **role**, bukan konteks test. **168 kemunculan** test memakai role non-Admin (41 Auditor + 30 Operator Gudang + 97 Supervisor, di 14 file — hitungan eksak crosscheck ketiga) yang akan jadi `Terbatas`. `UserFactory` juga `randomElement([...])` memilih `Operator Gudang`. Tanpa set ini, **168 titik gagal fail-closed**. |

### W8a — `StockDocument`: ikut `destination_warehouse_id`?
Crosscheck: `StockDocumentController::index:95` **HANYA** memfilter `warehouse_id` (bukan `destination_warehouse_id`). **TERKUNCI (keputusan produk 2026-09-17): opsi (a)** — pertahankan perilaku live, dokumen terlihat hanya via gudang asal. Tidak ada perluasan scope ke gudang tujuan.

---

## 0c. Konsep domain

```
Role.warehouse_scope_mode ∈ { 'Semua', 'Terbatas' }        ← apakah dibatasi (per role)
User ──< user_warehouse >── Warehouse                       ← gudang konkret (per user)
User.default_warehouse_id (FK)                              ← gudang aktif/default tampilan
```

**Matriks contoh (role dinamis, admin atur bebas):**
| Role | warehouse_scope_mode | gudang efektif user |
|---|---|---|
| Administrator | Semua | semua gudang |
| Koordinator Pusat | Semua | semua gudang |
| Supervisor Regional | Terbatas | sesuai `user_warehouse` (mis. Jakarta + Bekasi) |
| Operator Gudang | Terbatas | sesuai `user_warehouse` (mis. 1 gudang) |
| Auditor | Semua | semua (perlu audit lintas-gudang — **TERKUNCI** keputusan produk 2026-09-17) |

**Resolusi "gudang efektif" untuk user U:**
```
mode = Role(U.role).warehouse_scope_mode (default 'Semua' bila role tak terdaftar)
jika mode == 'Semua'      → allowed = null        (artinya: tanpa batas)
jika mode == 'Terbatas'   → allowed = pivot(U) ∪ {U.default_warehouse_id?}
                            jika allowed kosong → allowed = {}  (fail-closed, W11)
```

---

## FASE 7.1 — Model data & migrasi (fondasi)

**Tujuan**: menyiapkan storage tanpa mengubah perilaku (mode default `Semua` = no-op).

### 7.1.1 Migrasi
- `roles.warehouse_scope_mode` — `string(16)`, default `'Semua'`, index. (enum via `Rule::in` di validasi, bukan DB enum — konsisten pola proyek.)
- Tabel pivot `user_warehouse`: `id`, `user_id` (FK cascade), `warehouse_id` (FK cascade), `timestamps`, `unique(user_id, warehouse_id)`.
- **Opsional (bila ada backfill perlu)**: tidak ada perubahan `users.default_warehouse_id` (tetap seperti sekarang, W5).

### 7.1.2 Model
- `Role`: tambah `warehouse_scope_mode` ke `$fillable`; konstanta `WAREHOUSE_SCOPES = ['Semua','Terbatas']`; cast bila perlu.
- `User`: relasi `warehouses(): BelongsToMany` (pivot `user_warehouse`); helper `allowedWarehouseIds(): ?array` (null = semua, [] = nol, [..] = terbatas); helper `warehouseScopeMode(): string`.
- `Warehouse`: relasi `users()` saat ini menunjuk `default_warehouse_id`; tambah `assignedUsers(): BelongsToMany` (pivot) — **jangan** ganti relasi lama (kompatibilitas).

**Kriteria lulus**: `php artisan migrate` bersih (bukan fresh); `php artisan test --filter=RoleApiTest|UsersApiTest|WarehouseApiTest` hijau; tidak ada perubahan perilaku.

**Estimasi**: 0.5 hari. **Risiko**: RENDAH.

---

## FASE 7.2 — Middleware & resolusi scope (chokepoint)

**Tujuan**: satu titik yang menentukan "user ini boleh gudang mana" per request.

### 7.2.1 Helper bersama
- **`app/Support/WarehouseScope.php`** (single source of truth, pola `RoleAccessLevels`):
  - `effectiveIdsFor(User $user): ?array` — null=Semua, []=nol, [..]=terbatas.
  - `modeFor(User $user): string`.
  - Dipakai bersama oleh middleware + global scope + FormRequest (anti-drift).

### 7.2.2 Middleware `scope.warehouse`
- Didaftarkan sebagai alias di `bootstrap/app.php` (sejajar `role.access`).
- Tugas: hitung `effectiveIdsFor($user)` sekali, simpan di container/request attribute (`warehouse_scope`), siap dipakai global scope.
- **Tidak** menolak di sini untuk baca (biarkan scope menyempitkan). Untuk **tulis**, penolakan terjadi di validasi/controller (W6) — atau middleware khusus `warehouse.write` bila lebih rapi.
- Fail-closed (W11): role tak terdaftar → `[]` bila ada indikasi Terbatas; default `null` bila mode tak diketahui (lihat W10/W11 — putuskan: role tak terdaftar = `null` supaya tidak memutus role lama, karena deny sudah di layer permission).

**Kriteria lulus**: middleware terpasang di grup gudang-sensitif; request tanpa user → 401; unit test `WarehouseScope::effectiveIdsFor` (Semua/Terbatas/nol/fallback default).

**Estimasi**: 0.5–1 hari. **Risiko**: RENDAH.

---

## FASE 7.3 — Global scope di model bergudang

**Tujuan**: menyempitkan SEMUA query bergudang otomatis, tanpa mengubah signature controller.

### 7.3.1 Trait `ScopesToWarehouse`
Global scope (atau `scopeVisibleTo`) membaca `WarehouseScope::effectiveIdsFor(auth()->user())`:
- `null` → tanpa `where`.
- `[..]` → `whereIn(<kolom>, [..])`.
- `[]` → `whereRaw('1=0')` (kosong total, fail-closed).

**Kolom gudang per model (terverifikasi live code):**
| Model | Kolom | Catatan |
|---|---|---|
| `ItemStock` | `warehouse_id` | PK gabungan `(item_id, warehouse_id, bin_id)` |
| `StockMovement` | `warehouse_id` | |
| `StockDocument` | `warehouse_id` (+ opsi `destination_warehouse_id`) | lihat keputusan W8a di bawah |
| `ProcDoc` | `warehouse_id` | |
| opname | **= `StockDocument`** (tipe `Stock Opname`/`Stock Adjustment`) | **tidak ada model terpisah** (terverifikasi: `ls app/Models` tidak punya model opname) |

`Warehouse`, `Rack`, `User`, `Item` juga punya kolom `warehouse_id`/`default_warehouse_id` **tetapi TIDAK di-scope** (W9 + `Rack` harus tetap terlihat untuk form; `Warehouse` di-scope lewat controller, lihat 7.5).

### 7.3.1b ⚠️ KOREKSI KRITIS — query builder **BYPASS** global scope
Crosscheck menemukan **4 titik memakai `DB::table(...)` yang TIDAK terpengaruh Eloquent global scope**:
| Lokasi | Isi | Dampak |
|---|---|---|
| `ItemController.php:249` | `DB::table('item_stock')` — **cost drift** (agregat **semua gudang**, komentar pun bilang "lintas gudang+bin") | **BOCOR** — user Terbatas melihat drift lintas-gudang |
| `ItemController.php:301` | `DB::table('item_stock')` — agregat avg cost | **BOCOR** |
| `StockDocumentController.php:114` | `DB::table('stock_documents')` — **summary dashboard** | **BOCOR** |
| `StockLedger.php:79` | `DB::table('item_stock')` — jalur **tulis** sistem | **SENGAJA bypass** (reconciliation; jangan di-scope) |

**Konsekuensi desain**: global scope Eloquent **tidak cukup**. Diperlukan **juga** penanganan manual (tambah `whereIn` eksplisit dari `WarehouseScope`) di keempat titik baca di atas — kecuali `StockLedger` (tulis sistem). Ini menambah pekerjaan di 7.3 dan wajib masuk checklist.

### 7.3.1c ⚠️ KOREKSI — laporan menggabungkan `Item` (nir-gudang) + `StockMovement` (bergudang)
`LaporanController::mutasi` (dan varian lain) memaginasi **`Item`** lalu mengagregasi **`StockMovement`** per halaman:
- Global scope pada `StockMovement` **menyempitkan agregat** ✅, tetapi paginasi `Item` **tetap** mengembalikan **semua item** (termasuk item tanpa pergerakan di gudang izin → tampil saldo 0).
- **TERKUNCI (keputusan produk 2026-09-17): opsi (a)** — terima item-0 tampil. Tidak ada subquery `whereExists`; nol perubahan di `LaporanController::mutasi` selain scope otomatis pada dua query `StockMovement`.

### 7.3.2 Interaksi dengan `warehouse_id` query param klien
Global scope **menimpa**, bukan bergabung: untuk user `Terbatas`, filter klien hanya boleh **mempersempit** dalam himpunan izin. Implementasi: bila scope aktif, `whereIn(kolom, allowed)` **AND** `when(klien.warehouse_id)` — sehingga klien tak bisa keluar dari himpunan. (Sudah otomatis aman karena `AND`.)

> **Catatan**: `index`/baca memakai **inline `Request::validate()`**, bukan FormRequest (mis. `StockDocumentController::index:64`, `ProcDocController::index:55`, `StockController::index:21`). Jadi scoping baca **wajib** lewat global scope/query-builder, **tidak bisa** mengandalkan FormRequest.

**Kriteria lulus**: test baru `WarehouseScopeTest` — user Terbatas A: `GET /persediaan/stock` hanya berisi gudang A; `?warehouse_id=B` → hasil **kosong** (bukan 403, karena baca); `GET /persediaan/stock-documents` tak memuat dokumen gudang B; `GET /master/items/cost-drift` **tidak** membocorkan agregat gudang B (uji query-builder); `GET /persediaan/stock-documents/summary` **tidak** membocorkan dokumen gudang B. Suite lama tetap hijau (lihat koreksi W12 di 7.7).

**Estimasi**: 1.5–2 hari (**naik** dari 1–1.5 karena 4 titik bypass + laporan). **Risiko**: SEDANG–TINGGI → mitigasi test parity + suite lama sebagai oracle.

---

## FASE 7.4 — Scoping tulis & validasi (403/422)

**Tujuan**: menutup jalur klien mengirim `warehouse_id`/`destination_warehouse_id` di luar izin.

### 7.4.1 FormRequest / controller / service
- `StoreStockDocumentRequest`, `StoreProcDocRequest`, dll.: tambah validasi "warehouse_id ∈ allowed" (Rule kustom / `different` / closure).
- Controller `store`/`update`/lifecycle: bila scope aktif dan gudang di luar izin → **422** dengan pesan jelas (atau 403 di middleware tulis). Pilih **satu** konsisten: **rekomendasi 403 di middleware `warehouse.write`** untuk endpoint yang seluruhnya bergudang, **422** bila gudang salah satu field.
- **Guard service (wajib, temuan crosscheck ketiga)**: validasi asal ∈ allowed juga di `StockDocumentService::post()` setelah `assertBinsBelongToWarehouse()` (`:35`) — menutup jalur `post`/lifecycle yang tidak lewat `store`. ADJ buatan `postOpname()` (`:127-139`) mewarisi gudang opname sehingga ikut terjaga.
- **Transfer Gudang (W8)**: validasi gudang **asal** ∈ allowed; gudang **tujuan** hanya wajib `exists` + aktif.

**Kriteria lulus**: test — user Terbatas A: `POST stock-documents` `warehouse_id=A` → 201; `warehouse_id=B` → 403/422; transfer `A→B` → 201; transfer `B→A` → 403/422; `POST proc-docs` gudang asing → 403/422.

**Estimasi**: 1 hari. **Risiko**: SEDANG.

---

## FASE 7.5 — Scoping `GET /master/warehouses` & payload sesi

**Tujuan**: FE menerima hanya gudang yang relevan; dropdown otomatis benar (W7).

### 7.5.1 Backend
- `WarehouseController::index`: bila user `Terbatas` → `whereIn('id', allowed)`.
- `AuthController::login`/`me`: tambahkan ke payload `{ warehouse_scope: { mode, ids } }` (atau `allowed_warehouse_ids`) agar FE tahu harus mengunci UI. `UserResource` boleh memuat relasi `warehouses` untuk user Terbatas.
- **Audit limitation (temuan crosscheck ketiga)**: `AuditLog` tidak punya `warehouse_id` (model + migrasi + `routes/audit.php` gate `role.access:Audit Trails` saja). Untuk user Terbatas, `AuditLogController@index` dibatasi ke aksi user sendiri (atau catat eksplisit sebagai known limitation bila diputuskan sebaliknya).

### 7.5.2 Frontend
- `useAuth`: simpan `warehouseScope` dari `me()`/login.
- `useWarehouseFilter`: bila `mode = Terbatas` → **hapus opsi "Semua"**, kunci ke gudang (tunggal → langsung pilih; banyak → batasi opsi). Rantai resolusi: untuk Terbatas, `default_warehouse_id` (bila ∈ allowed) → else gudang pertama `allowed`.
- Hapus penyimpanan localStorage lintas-gudang untuk user Terbatas (atau validasi terhadap `allowed` saat baca).
- Form gudang (**11 file form** menyentuh `warehouse_id` — hitungan eksak crosscheck ketiga; 14 hasil grep minus komponen/kit/laporan) → opsi select = `allowed` (otomatis dari `useWarehouses` yang sudah di-scope).
- **Pivot Rekap Stock** (`persediaan.rekap-stock.tsx`): kolom dibangun dari master gudang (`warehouseList`), sel kosong = 0. Untuk user Terbatas, kolom **wajib** dibangun dari `allowedIds ∩ warehouseList` — bila tidak, gudang di luar izin tampil sebagai kolom penuh 0 (bocor keberadaan + membingungkan).

**Kriteria lulus**: `npx tsc --noEmit` + `npm test` hijau; spec `use-warehouse-filter` diperbarui (kasus Terbatas: tanpa "Semua", kunci ke allowed); manual: login Operator Gudang → dropdown hanya gudangnya, tak ada "Semua".

**Estimasi**: 1–1.5 hari. **Risiko**: SEDANG (banyak file FE).

---

## FASE 7.6 — Manajemen (admin atur scope dinamis)

**Tujuan**: admin bisa atur mode per role + gudang per user dari UI (sesuai permintaan "dapat diatur secara dinamis").

### 7.6.1 Role
- `StoreRoleRequest`/`UpdateRoleRequest`: field `warehouse_scope_mode` (`Rule::in(Role::WAREHOUSE_SCOPES)`).
- `RoleController`: persist; `RoleResource`: sertakan `warehouse_scope_mode`.
- FE `RoleEditDialog`: tambah kontrol "Lingkup Gudang: Semua / Terbatas".

### 7.6.2 User
- `StoreUserRequest`/`UpdateUserRequest`: `warehouse_ids` (array, `exists:warehouses,id`) opsional.
- `UserController::store/update`: sync pivot `user_warehouse` dalam transaksi; validasi W4 (user Terbatas wajib ≥1 gudang, atau fallback default).
- FE user form: multi-select gudang (tampil/aktif hanya bila role ber-mode Terbatas).
- `UserResource`: sertakan `warehouse_ids` / `warehouses`.

**Kriteria lulus**: test — admin set role Terbatas + assign 2 gudang ke user → user itu hanya lihat 2 gudang; ubah assignment → efek setelah resync; hapus semua gudang user Terbatas tanpa default → 422.

**Estimasi**: 1–1.5 hari. **Risiko**: RENDAH–SEDANG.

---

## FASE 7.7 — Test regresi & parity (WAJIB sebelum fase dianggap selesai)

**File baru**: `tests/Feature/WarehouseScopeTest.php` (+ `tests/Unit/WarehouseScopeTest.php` untuk helper).
Cakupan minimal:
1. User Terbatas A → `GET /persediaan/stock` hanya gudang A; `?warehouse_id=B` → kosong.
2. User Terbatas A → dokumen stok/`proc-docs`/laporan tak memuat gudang B.
3. User Terbatas A → `POST stock-documents` gudang B → 403/422; gudang A → 201.
4. Transfer Gudang: asal A → 201; asal B → 403/422 (W8).
5. `GET /master/warehouses` untuk Terbatas → hanya gudang miliknya.
6. User Semua (pusat) → tak terbatas (semua gudang), regresi tak rusak.
7. Fail-closed (W11): role hilang / pivot kosong tanpa default → lihat nol.
8. `Item` master **tidak** ter-scope (W9).
9. Suite lama (~48 file Feature; **~168 kemunculan role non-Admin di 14 file**) tetap hijau — **wajib** set mode `Semua` di `seedBaseRoles()` (koreksi W12), bukan asumsi.

**Kriteria lulus**: `php artisan test` seluruhnya hijau; `--filter=WarehouseScopeTest` hijau.

**Estimasi**: 1–1.5 hari. **Risiko**: SEDANG.

---

## Checklist Verifikasi Final (per fase)

- [ ] `cd Backend && composer test` → hijau (semua suite)
- [ ] `cd Frontend && npm run lint && npx tsc --noEmit && npm test` → hijau
- [ ] Manual: login **role pusat** (Semua) → lihat semua gudang; login **operator Terbatas** → hanya gudangnya, tanpa "Semua".
- [ ] F7.3: tidak ada query bergudang yang lolos scope (uji `?warehouse_id=B` oleh user A → kosong/403).
- [ ] F7.4: tulis lintas-gudang ditolak eksplisit.
- [ ] F7.5: `GET /master/warehouses` & dropdown FE konsisten dengan izin.
- [ ] F7.6: admin bisa ubah mode role + assign gudang user lewat UI; efek setelah resync sesi.
- [ ] Master `items` TIDAK ikut ter-scope (W9).
- [ ] `.dev/claims.md` di-update → `done` untuk tiap path.

---

## Estimasi & Risiko Total

| Fase | Estimasi | Risiko |
|---|---|---|
| 7.1 Model & migrasi | 0.5 hari | RENDAH |
| 7.2 Middleware & helper | 0.5–1 hari | RENDAH |
| 7.3 Global scope model | 1.5–2 hari | SEDANG–TINGGI |
| 7.4 Scoping tulis | 1 hari | SEDANG |
| 7.5 `GET warehouses` + FE | 1–1.5 hari | SEDANG |
| 7.6 Manajemen dinamis (UI) | 1–1.5 hari | RENDAH–SEDANG |
| 7.7 Test & parity | 1–1.5 hari | SEDANG |
| **Total** | **~6–9 hari** | **TINGGI** (integritas stok bila salah scope) |

**Mitigasi utama**: global scope fail-closed + suite lama sebagai oracle + test parity eksplisit + jangan scope master `items`.

---

## Prasyarat Keputusan Produk (TERKUNCI 2026-09-17 — jangan dibuka lagi)

1. **Transfer Gudang untuk operator Terbatas** — ~~konfirmasi W8~~ **TERKUNCI: W8** (asal terbatas, tujuan bebas; dokumen terlihat hanya via gudang asal = W8a(a)).
2. **Auditor** — **TERKUNCI: `Semua`** (lintas-gudang, demi audit).
3. **Supervisor multi-gudang** — pivot menangani banyak gudang (W3). ✅ tanpa keputusan tambahan.
4. **Laporan agregat** — **TERKUNCI: agregat hanya atas gudang izin** (scope sebelum agregasi); item tanpa movement tetap tampil saldo 0 (= 7.3.1c(a)).
5. **Fallback W5** — **TERKUNCI: ya**, `default_warehouse_id` jadi gudang tunggal bila pivot kosong, **dengan logging** agar misconfig tidak tersamarkan (tambah log warning saat fallback dipakai).

---

## Riwayat Dokumen

| Tanggal | Perubahan |
|---|---|
| 2026-09-17 | Draft awal — dari crosscheck live code: gudang = filter klien (bukan kontrol server); role dinamis tak punya dimensi gudang (RBAC vs row-level); desain F7 (mode Semua/Terbatas per role + pivot per user + global scope + UI dinamis) |
| 2026-09-17 | **Revisi pasca-crosscheck mendalam** — 4 koreksi: (1) **W12 salah** — mode ditentukan role, bukan konteks test; 73 test pakai role non-Admin, `UserFactory` acak termasuk `Operator Gudang` → `seedBaseRoles()` wajib set `Semua`; (2) **query builder bypass** — 4 titik `DB::table(...)` (cost-drift, avg-cost, summary) tak terkena global scope → wajib penanganan manual; (3) laporan gabungan `Item`+`StockMovement` → paginasi Item tak ter-scope (opsi a/b, keputusan produk); (4) angka FE 9→**17 file**; opname = `StockDocument` (bukan model terpisah); +W8a (`destination_warehouse_id` index hanya `warehouse_id` di live). Estimasi 7.3 naik → total ~7–10.5 hari |
| 2026-09-17 | **Revisi crosscheck ketiga + kunci produk** — angka eksak: 73→**168 kemunculan** (41/30/97) di 14 file; 17→**11 file form**; 5 keputusan TERKUNCI (W8a(a), laporan-0, Auditor=Semua, agregat-terbatas, fallback-W5+log); 3 sub-tugas baru (pivot-rekap allowedIds, audit-limitation, guard `post()` service). Estimasi → ~6–9 hari |
