# ROADMAP PERBAIKAN KEAMANAN & SKALABILITAS — Kelola Gudang Pro

**Tanggal**: 2026-09-16 · **Status**: Draft, siap dieksekusi bertahap
**Sumber**: Audit mendalam frontend + backend (static review per `file:line`) + verifikasi empiris via test ad-hoc (`php artisan test`).
**Cakupan**: 3 temuan KRITIS/TINGGI yang terbukti empiris, 6 temuan SEDANG, 7 titik panas skala.
**Luar cakupan**: Perombakan arsitektur auth (pindah ke cookie HttpOnly) — dicatat sebagai usulan jangka panjang, bukan fase eksekusi.
**Aturan eksekusi**: satu fase dalam satu waktu; tiap fase selesai → `composer test` (Backend) + `npm run lint` + `npx tsc --noEmit` + `npm test` (Frontend) hijau sebelum lanjut. **DILARANG** `migrate:fresh` di DB dev `kelolagudang` (lihat root `AGENTS.md`). Klaim path di `.dev/claims.md` sebelum edit.

---

## 0. Ringkasan Temuan & Prioritas

| Kode | Temuan | Severity | Bukti | Fase |
|---|---|---|---|---|
| P0-1 | Batas hak akses longgar: `roles`/`users` dapat diubah oleh `Master Data Tulis`, bukan hanya Administrator | 🟠 **TINGGI** | Test ad-hoc: `PUT roles` → 200, `POST users(Administrator)` → 201 | ✅ F1 |
| P0-2 | Tidak ada proteksi "Administrator terakhir" + bisa hapus diri sendiri | 🔴 **KRITIS** | Test ad-hoc: `DELETE users/{self}` → 200 | ✅ F1 |
| P0-3 | `settings` dapat diubah tanpa role Administrator | 🟡 **SEDANG** | Test ad-hoc: `PUT settings` sbg `System Tulis` → 200 | ✅ F1 |
| P1-1 | Semua `authorize()` FormRequest `return true` (**43 class**; 44 file di direktori `Requests/`) | 🟠 **TINGGI** (defense-in-depth) | Static grep | F2 |
| P1-2 | `fetchAll()` menarik SEMUA baris ke klien (cap 50.000) | 🟠 **TINGGI** (skala) | `api.ts:122-156` | F4 |
| P1-3 | `StockLedger::rebuildForItem` fold O(n) tiap transaksi | 🟠 **TINGGI** (skala) | `StockLedger.php:31-111` | F5 |
| P1-4 | Analitik laporan memuat dokumen periode ke memori + N+1 | 🟠 **SEDANG–TINGGI** (skala) | `LaporanController@keluarAnalytics` | F5 |
| P2-1 | `APP_DEBUG=true`/`APP_ENV=local` di `.env.example` | 🟡 **SEDANG** | `.env.example:2,4` | F3 |
| P2-2 | `Item`: `stock`/`reserved` mass-assignable | 🟢 **RENDAH** (higiene — `validated()` allowlist sudah menahan) | `Item.php` `$fillable` | F3 |
| P2-3 | `company.logo` diinterpolasi mentah ke `src="..."` | 🟢 **RENDAH** (higiene — regex backend sudah menahan) | `use-settings.ts:45` | F3 |
| P2-4 | Rate limit hanya di `login` (`throttle:5,1`) | 🟡 **SEDANG** | `routes/api.php:29` | F3 |
| P2-5 | Verifikasi: `vercel.json` hardcode ngrok + tanpa header keamanan | 🟡 **SEDANG** | `Frontend/vercel.json` | F6 |
| P3-2 | `hasModule` fail-open saat `status !== "authenticated"` | 🟢 **RENDAH** | `use-auth.tsx:164-166` | F6 |
| P3-3 | `printHtml` iframe tanpa `sandbox` (**bukan** `print-doc.ts` — file itu `window.open`; iframe = `barcode-label.ts:829`) | 🟢 **RENDAH** | `barcode-label.ts:829` | F6 |
| P3-4 | `opname-count-page.tsx` copy-paste header auth + hardcode `/api` | 🟢 **RENDAH** | `opname-count-page.tsx:362-379` | F6 |
| P3-5 | `bulkImport` plain `Request` + `syncCost` pakai `BulkItemDeleteRequest` | 🟢 **RENDAH** (kebersihan) | `ItemController.php:309,282` | F2 |

> **Catatan revisi (pasca-review Opencode):** P0-1 & P0-3 diturunkan dari KRITIS/SEDANG–TINGGI ke TINGGI/SEDANG karena **tidak ada seed role dengan `Master Data Tulis`/`System Tulis` selain Administrator** (lihat §0c). Ini *coarse privilege boundary*, bukan vuln yang dieksploitasi dari kondisi seed — namun tetap layak diperbaiki karena model peran adalah konfigurasi runtime (admin bisa menaikkan level role lain). P0-2 tetap KRITIS (murni, tanpa mitigasi). P2-2 & P2-3 diturunkan ke RENDAH (higiene). P3-1 (`/pengaturan` tak ter-gate) **dibatalkan** — lihat §0c.

**Hal yang sudah BAIK (jangan diubah, hanya dijaga):**
- Tidak ada SQL injection — semua `whereRaw`/`selectRaw`/`whereHas` pakai binding `?`.
- Tidak ada `$guarded = []`; tidak ada `$request->all()` / `->update($request->all())`.
- Tidak ada password/secret di `UserResource`/`SettingResource`; `.env` tidak ter-track; tidak ada file upload.
- Tidak ada `eval`/`innerHTML`/`outerHTML` dari data backend; escaping cetak konsisten (`escPrintText`/`escHtml`); bwip-js `toSVG` meng-encode ke `<path>` (bukan `<text>`) → XSS via barcode terblokir.
- Tidak ada token di log/URL/query; `bootstrap/app.php` menutup kebocoran QueryException.
- `EnsureRoleAccess` (level dari verb) bekerja benar — diverifikasi via `RoleAccessTest` (8 passed).

---

## 0b. Keputusan desain yang dikunci (jangan dibuka lagi saat eksekusi)

| # | Keputusan | Alasan |
|---|---|---|
| S1 | Otorisasi level-role ditegakkan **di middleware/Gate**, bukan hanya di `authorize()` FormRequest | Middleware adalah chokepoint tunggal & sudah terbukti; policy menambah lapisan, bukan pengganti. |
| S2 | Perubahan hak akses role & CRUD user **hanya untuk role `Administrator`** (bukan sekadar `Master Data Tulis`) | Mencegah eskalasi privilege lintas-role. |
| S3 | Guard "minimal 1 Administrator aktif" **fail-closed** — tolak transaksi yang akan menyisakan 0 admin | Cegah lockout operasional. |
| S4 | `fetchAll()` **tidak dihapus** — dipertahankan untuk tabel master kecil; halaman berat dipindah ke **server-side pagination** | Kompatibilitas mundur + progresif. |
| S5 | Perbaikan skala ledger **tidak mengubah semantik fold** — hanya memangkas frekuensi/ruang (incremental) | Konsistensi nilai FIFO/Average/Max sudah dikunci di `roadmap-final-skalabilitas-wms.md` K5. |
| S6 | `role_permissions` tetap tabel flat string-enum (bukan tabel `roles` baru) | Hindari migrasi besar; cukup gate. |
| S7 | Jika terjadi konflik dengan sesi lain (file `claimed`), **berhenti & lapor** — jangan timpa | Protokol multi-sesi root `AGENTS.md`. |
| S8 | Gate administrator hanya untuk **operasi tulis** (`POST/PUT/DELETE`) pada `users`/`roles`/`settings`; **operasi baca tetap** `role.access` | `GET /users` dipakai form non-admin (PIC select di PR/opname); `GET /roles` dipakai RolePage untuk semua role dengan `Master Data Baca`. Menutup baca = regresi fitur. |
| S9 | **`/pengaturan` TIDAK di-gate** ke modul System | Halaman hibrida (theme picker untuk semua role + profil perusahaan yang graceful-degrade). Gating akan mengunci theme picker dari Supervisor/Operator/Auditor. Cukup pertahankan gating level internal yang sudah ada (`canWrite = hasModuleLevel("System","Tulis")`). |
| S10 | **Larangan mutlak hapus/ubah diri sendiri** (tanpa pengecualian "masih ada admin lain") | Kejelasan audit & mencegah salah-hapus diri yang tidak bisa dibatalkan. Kontradiksi §1.3 lama diputuskan. |

---

## 0c. Hasil Review & Verifikasi Independen (2026-09-16)

Reviewer (Opencode) mengangkat 3 keberatan. Setiap klaim **diverifikasi ulang terhadap kode** — ketiganya **akurat**:

| # | Klaim reviewer | Verifikasi | Keputusan |
|---|---|---|---|
| R1 | P0-1/P0-3 severity *overstated* — tak ada seed role dengan `Master Data Tulis`/`System Tulis` selain Administrator; bukti ad-hoc pakai permission artifisial | **BENAR** — `RolePermissionSeeder`: Master Data Kelola = Administrator saja; Supervisor/Operator/Auditor = `Baca`. System = Administrator saja. | Turunkan severity (lihat §0). Tetap fase F1 karena matriks role adalah **konfigurasi runtime** — admin dapat menaikkan level role, membuka jalur ini; perbaikan murah & tepat. |
| R2 | F1.2 *blast radius*: memindah seluruh `apiResource('users')` + `GET roles` ke gate admin merusak form non-admin | **BENAR** — `useUsers()` dipakai di `purchase-request-form.tsx:80`, `purchase-request-sheet.tsx:140`, `opname-create-dialog.tsx:35`, `master-forms.tsx:3179,3337,3619,3940` (semua role). `useRoles()` di `RolePage` (`master-crud-pages.tsx:1546`) — halaman `MasterCrudPage` butuh `Master Data Baca` yang dimiliki Supervisor/Operator/Auditor. | **F1.2 direvisi** (S8): gate admin hanya untuk operasi tulis; baca tetap `role.access`. |
| R3a | F6.2-1 (gate `/pengaturan` → System) jangan diimplementasikan | **BENAR** — `/pengaturan` = theme picker (semua role) + profil (graceful-degrade). Gating = regresi UX. | **Dropped** (S9). |
| R3b | P3-3 salah atribusi file (bukan `print-doc.ts`) | **BENAR** — `print-doc.ts:68` = `window.open`; iframe tempat lain = `barcode-label.ts:829` (`printHtml`). `barcode.tsx:803` preview sudah `sandbox=""`. | Koreksi atribusi di §0; perbaikan F6.2-3 → arahkan ke `barcode-label.ts` iframe (bukan `print-doc.ts`). |
| R3c | P2-2/P2-3 higiene, bukan SEDANG | **BENAR** — `StoreItemRequest` tak punya rule `stock` → `validated()` menyaringnya; `SettingUpdateRequest:26` regex `^data:image/(png\|jpeg);base64,...$` menahan logo. | Turunkan ke RENDAH. |

**Konsekuensi**: dokumen direvisi (severity, scope F1.2, drop F6.2-1, koreksi atribusi, putuskan §1.3). **F1 siap dieksekusi** setelah revisi ini.

---

## 0e. Perubahan Working Tree Sesi Lain (`flex-roles`) — 2026-09-16

Saat audit berjalan, terdeteksi **sesi lain aktif** di working tree yang sama mengerjakan fitur **role dinamis** (`flex-roles-*` di `.dev/claims.md`), menyentuh 26 file (662+/199-). Ini **mengubah basis temuan** dan **wajib disinkronkan sebelum eksekusi F1**.

### Yang BERUBAH (belum di-commit) — semua di `Backend/` + `Frontend/`
- **Baru**: `app/Models/Role.php`, `app/Http/Requests/StoreRoleRequest.php`, migrasi `2026_09_16_000001_create_roles_table.php`, `tests/Feature/RoleCrudTest.php`.
- **Diubah**: `RoleController` (+146), `RolePermissionSeeder` (+89), `User.php` (+`canReview()`), `routes/api.php` (+`POST roles`, `DELETE roles/{role}`), `master-forms.tsx` (+247), `use-master.ts`, `schemas.ts`, dll.
- **Kolom baru** `roles.can_review` (boolean) menggantikan pengecekan `role === 'Auditor'` hardcoded → `User::canReview()`. Ini **perbaikan nyata** (menghapus magic-string).

### Yang SUDAH diperbaiki sesi itu
- `can_review` DB-driven (bukan `'Auditor'` hardcoded) → menutup sebagian C3.
- **Self-lockout guard**: user tak bisa mencabut `System:Kelola` dari role-nya sendiri (`RoleController::update:69-83`).
- Role baru lahir **deny-by-default** (nol baris permission).
- `destroy` menolak role yang masih dipakai user.

### Yang MASIH bermasalah (terbukti empiris via test ad-hoc — lihat bukti di bawah)
| Status | Uji | Hasil |
|---|---|---|
| ❌ | Non-admin (`Master Data:Tulis`) `POST /api/master/roles` dengan `System:Kelola` | **201** — bikin role backdoor |
| ❌ | Non-admin `PUT /api/master/roles/{role lain}` grant `System:Kelola` | **200** — **bypass self-lockout** (guard hanya jaga role sendiri) |
| ✅ | Non-admin `DELETE /api/master/roles/{role}` | **403** — benar (DELETE butuh `Kelola`, non-admin hanya `Tulis`) |

**Bukti (test `HermesVerifyRoleEscalationTest`, dihapus setelah run):** `[CREATE-ROLE]=201`, `[REWRITE-OTHER-ROLE]=200`, `[DELETE-ROLE]=403`.

### Implikasi untuk F1
1. **C2 tetap valid & naik prioritas** — permukaan eskalasi bertambah (create/rename/delete role), tanpa gate administrator.
2. **F1.2 harus mencakup `roles`** — `POST/PUT/DELETE roles` masuk grup `role.administrator`; `GET roles` tetap `role.access` (dibaca RolePage).
3. **Self-lockout guard tidak cukup** — harus **admin-only** untuk operasi tulis role, bukan sekadar jaga role sendiri.
4. **`can_review` menggeser C3** — kewenangan approve kini data-driven; tinjau apakah role non-Auditor boleh punya `can_review=true` (kini admin bisa set bebas). Pastikan hanya role yang sah (mis. Auditor) yang ditandai.
5. ⚠️ **Koordinasi**: file F1 (`routes/api.php`, `RoleController`, `User.php`) **sedang disentuh sesi lain**. **JANGAN eksekusi F1 sebelum sesi `flex-roles` commit/selesai** — risiko konflik.

### Artefak debug (koreksi §6.3, terverifikasi)
Keenam file artefak **SUDAH ter-track** (`git ls-files`; commit `28e844f`). Tambahan yang ditemukan: command `rebuild:drift` dengan **8 ID item hardcoded** di `Backend/routes/console.php:14-25` — artefak operasional ad-hoc yang sebaiknya dihapus/digeneralisasi.

---

## FASE 1 — Perbaikan KRITIS (isolated, risiko rendah, dampak langsung) ✅ SELESAI (uncommitted)

> **STATUS: SUDAH DIEKSEKUSI** (working tree, belum di-commit) — lihat §F1-Hasil di bawah. **JANGAN ulangi F1.** Mulai eksekusi dari **FASE 2**.

**Tujuan**: menutup jalur eskalasi privilege & lockout admin. Semua perubahan bersifat tambahan (middleware/policy + guard) tanpa mengubah alur normal.

### F1-Hasil (2026-09-16) — ringkasan eksekusi & temuan

**Yang dikerjakan** (semua lulus `php artisan test`: **523 passed, 1 skipped, 14151 assertions**):
| Item | File | Catatan |
|---|---|---|
| 1.1 Middleware | `app/Http/Middleware/EnsureAdministrator.php` (baru) | Gate `role.administrator`, cek `$user->role === 'Administrator'` |
| 1.1b Alias | `bootstrap/app.php` | `'role.administrator' => EnsureAdministrator::class` |
| 1.2 Gate rute | `routes/api.php` | Baca tetap `role.access`; tulis users/roles/settings = `role.administrator` |
| 1.3 Guard model | `app/Models/User.php` | `booted()` deleting/updating → `guardSelfMutation` + `guardLastAdministrator` |
| 1.4 Test | `tests/Feature/AdministratorGuardTest.php` (baru) | 11 kasus (403 tulis non-admin, 200 baca, 422 admin terakhir/self) |
| Test lama disesuaikan | `tests/TestCase.php`, `RoleApiTest`, `RoleCrudTest`, `SettingApiTest` | lihat temuan #2 |

**Temuan penting saat eksekusi (WAJIB dipahami sebelum lanjut):**

1. **Gate admin "menelan" self-lockout lama.** `RoleController::update` punya guard self-lockout (tak boleh cabut `System:Kelola` dari role sendiri). Setelah gate F1, aktor non-Administrator ditolak **403 lebih dulu** → guard lama hanya relevan bila aktor = Administrator yang mengedit role Administrator sendiri. **Efek: pertahanan lebih kuat, bukan regresi.** Test `test_update_cannot_strip_system_kelola_from_own_role` disesuaikan (aktor kini Administrator).

2. **`actingAsMasterAdmin()` di `TestCase.php` diubah dari role fiktif `'Test Admin'` → `'Administrator'`.** Ini **memengaruhi SELURUH test feature** (helper global). Alasan: operasi tulis user/role/settings kini digate nama role `'Administrator'`. User dibuat in-memory (`new User(...)`, tanpa `save()`) agar `user_count` tetap 0. **Penting bagi sesi berikutnya: jangan kembalikan ke `'Test Admin'`.**

3. **Role kini dinamis** (`Rule::exists('roles','name')`, tabel `roles` dari commit `09b1bae`). Gate F1 tetap berbasis nama `'Administrator'` (role sistem bawaan). **Role dinamis baru TIDAK otomatis dapat hak admin** — bila kelak mau role admin kustom, perlu flag `is_admin` di tabel `roles` (belum ada; `is_system` sudah ada tapi bukan semantik admin).

4. **Verifikasi empiris sesudah F1** (test ad-hoc, dihapus setelah run): non-admin `POST roles` → **403** (dulu 201), `PUT roles/{lain}` → **403** (dulu 200), `PUT settings` → **403** (dulu 200). Eskalasi tertutup.

5. **Guard `guardLastAdministrator` di-skip saat console/seeder** (`auth()->id() === null && runningInConsole()`), agar bootstrap/seeding admin pertama tidak terkunci. Bila command tinker mencoba hapus admin terakhir **tanpa** aktor auth, guard TIDAK aktif — trade-off yang disengaja untuk operability.

**Verifikasi wajib sebelum commit**: `cd Backend && php artisan test` → hijau; `vendor/bin/pint <file F1>` bersih.

### Spesifikasi awal (referensi — sudah diimplementasikan sesuai ini)

### 1.1 Middleware `role.administrator` (baru)

**File baru**: `Backend/app/Http/Middleware/EnsureAdministrator.php`

```php
public function handle(Request $request, Closure $next): Response
{
    $user = $request->user();
    if (! $user) {
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
    if ($user->role !== 'Administrator') {
        return response()->json(['message' => 'Hanya Administrator yang dapat melakukan operasi ini.'], 403);
    }
    return $next($request);
}
```

**File diubah**: `Backend/bootstrap/app.php` — daftarkan alias `role.administrator` di `withMiddleware` (sejajar `role.access`).

**Kriteria lulus**: `RoleAccessTest` tetap hijau; user non-Administrator dengan `Master Data Tulis` → 403 pada endpoint yang digate.

### 1.2 Terapkan gate `role.administrator` di rute sensitif

**File diubah**: `Backend/routes/api.php`

**⚠️ REVISI (S8, pasca-review)**: JANGAN pindahkan `apiResource('users')` atau `GET roles` secara utuh ke gate administrator — `GET /users` dipakai form non-admin (PIC select di PR/opname) dan `GET /roles` dipakai `RolePage` (Supervisor/Operator/Auditor punya `Master Data Baca`). **Gate administrator HANYA untuk operasi tulis.**

**Perubahan**:
- **Manajemen user** — pecah resource: `GET users` + `GET users/{user}` tetap di grup `role.access:Master Data`; `POST/PUT/DELETE users` dipindah ke grup baru `['auth:sanctum', 'role.administrator', 'role.access:Master Data']`.
  - Implementasi: ganti `Route::apiResource('users', ...)` menjadi eksplisit — `Route::get(...)`/`Route::get('{user}', ...)` di grup lama, dan `Route::post/put/delete` di grup administrator.
- **Manajemen role** — `GET roles` tetap `role.access:Master Data` (dibaca RolePage); **`POST roles` + `PUT roles/{role}` + `DELETE roles/{role}`** masuk grup `['auth:sanctum', 'role.administrator']`. ← **diperluas §0e**: sesi `flex-roles` menambah `POST`/`DELETE roles`, dan `PUT` terbukti bisa dipakai non-admin untuk grant `System:Kelola` ke role lain (bypass self-lockout).
- **Settings** — `GET settings` tetap `role.access:System` (kop dokumen dibaca role ber-`System Baca`); `PUT settings` masuk grup `['auth:sanctum', 'role.administrator', 'role.access:System']`.

**Catatan desain**: pola S8 = "baca mengikuti `role.access`, tulis mengikuti administrator". Ini mempertahankan semua konsumen baca yang ada (diverifikasi di §0c R2) sambil menutup jalur eskalasi.

**Kriteria lulus**:
- Test baru (F1.4) hijau.
- Regresi: `RoleApiTest`, `UsersApiTest`, `SettingApiTest` hijau (mungkin perlu update ekspektasi test lama — lihat 1.4).
- **Verifikasi manual eksplisit**: Operator Gudang masih bisa membuka dialog opname (select PIC memuat user) & membuat PR (select PIC); Supervisor masih bisa membuka halaman Role.

### 1.3 Guard "Administrator terakhir" & larangan hapus/ubah diri sendiri

**File diubah**: `Backend/app/Http/Controllers/UserController.php` (+ opsional `Backend/app/Models/User.php`)

**Keputusan (§0 S10)**: **larangan mutlak** — seorang user TIDAK boleh menghapus atau mengubah (role/is_active) akunnya sendiri, TANPA pengecualian. Tambahan: tidak boleh menghapus/me-nonaktifkan **Administrator terakhir**.

**Perubahan**:
- `destroy(User $user)`: 422 bila `$user->id === auth()->id()`; 422 bila `$user->role === 'Administrator'` dan jumlah admin aktif ≤ 1.
- `update(UpdateUserRequest, User $user)`: 422 bila `$user->id === auth()->id()` dan terjadi perubahan `role`/`is_active`; 422 bila mengubah admin terakhir menjadi non-admin/nonaktif.
- **Implementasi (pilih salah satu, konsisten)**:
  - *Controller-level* (lebih sederhana, mudah di-test): guard di `UserController` sebelum operasi.
  - *Model-level* (`User::booted()` `deleting`/`saving`): berlaku juga untuk tinker/command. Bila dipilih ini, **pastikan seeder pembuat admin pertama tidak terblokir** (guard hanya aktif bila sudah ada ≥1 admin aktif, dan skip saat `app()->runningInConsole() && ! runningUnitTests()` bila perlu).

**Kriteria lulus**: test F1.4 membuktikan hapus/ubah admin terakhir → 422; hapus diri sendiri → 422.

### 1.4 Test regresi permanen (WAJIB sebelum fase dianggap selesai)

**File baru**: `Backend/tests/Feature/AdministratorGuardTest.php`

Cakupan minimal:
1. `Master Data Tulis` non-admin → `PUT roles/{role}` = **403**.
2. `Master Data Tulis` non-admin → `POST users` = **403**.
3. `System Tulis` non-admin → `PUT settings` = **403**.
4. Admin → hapus admin terakhir = **422**; admin → hapus diri sendiri = **422**.
5. Admin → ubah role admin terakhir = **422**.
6. Admin (dengan admin lain) → hapus user biasa = **200** (jalur normal tidak rusak).
7. Unauthenticated → **401**.
8. **($8 S8) Regresi baca**: non-admin dengan `Master Data Baca` → `GET /users` = **200**; `GET /roles` = **200**; `GET /settings` (System Baca) = **200**. ← membuktikan gate tulis tidak merusak baca.

**Kriteria lulus**: `php artisan test --filter=AdministratorGuardTest` hijau; seluruh suite `composer test` tetap hijau.

**Estimasi**: 0.5–1 hari. **Risiko**: SEDANG (perubahan rute) → mitigasi: test regresi + verifikasi manual login tiap role seed.

---

## FASE 2 — Pertahanan Berlapis Otorisasi (defense-in-depth)

**Tujuan**: `authorize()` bukan lagi `return true` buta; bila suatu saat ada route lupa dibungkus middleware, otorisasi tetap dicek.

### 2.1 Implement `authorize()` berbasis gate/level modul

**Pendekatan**: buat trait `App\Http\Requests\Concerns\AuthorizesModule` yang membaca `$this->user()->role` + `RolePermission::accessForRole` untuk menurunkan `(module, level)` dari method, lalu kembalikan `bool`. Terapkan ke 44 FormRequest.

**Alternatif lebih murah**: karena middleware sudah jadi chokepoint, cukup tambahkan `authorize()` yang mengembalikan `true` hanya bila user terautentikasi (`$this->user() !== null`) untuk SEMUA request, dan implementasi penuh hanya untuk FormRequest pada rute non-standar (`bulk-import`, `sync-cost`, `cost-drift`, `bulk-status`).

**Keputusan (2026-09-16, dikunci): parsial.** `authorize()` = `$this->user() !== null` untuk semua FormRequest; pemetaan modul/level penuh hanya untuk 4 request non-standar (`BulkItemImportRequest`, `SyncItemCostRequest`, `CostDriftRequest`, `BulkItemStatusRequest`) via trait `AuthorizesModule` + helper bersama `RoleAccessLevels` (dipakai juga oleh `EnsureRoleAccess` agar tak drift).

> **Deviasi sesi Hermes (2026-09-16, DITERIMA user):** 5 request identitas (`Store/UpdateUserRequest`, `Store/UpdateRoleRequest`, `SettingUpdateRequest`) memakai trait terpisah `AuthorizesAdministrator` (admin-only di `authorize()`), bukan auth-check parsial. Fungsional aman — kelimanya hanya dipakai rute tulis yang sudah digate `role.administrator`, sehingga middleware selalu menolak lebih dulu (S8/baca tak tersentuh). Redundan terhadap middleware; bila kelak ada flag `is_admin`, trait ini harus ikut diperbarui.

### 2.2 Ganti `bulkImport` & `syncCost` ke FormRequest yang benar

**File diubah**: `Backend/app/Http/Controllers/ItemController.php`
**File baru**: `Backend/app/Http/Requests/BulkItemImportRequest.php` (rules dipindah dari inline `validate()`), `Backend/app/Http/Requests/SyncItemCostRequest.php`.

**Kriteria lulus**: `BulkImportItemsTest` hijau; test baru untuk `syncCost` (403 untuk non-berhak, 200 untuk berhak).

**Estimasi**: 1–2 hari. **Risiko**: RENDAH.

### 2.3 Follow-up T2 — trait `AuthorizesAdministrator` untuk request istimewa ✅ SELESAI (uncommitted)

**Konteks (hasil crosscheck Hermes atas F2)**: 3 request istimewa (`Store/UpdateUserRequest`, `Store/UpdateRoleRequest`, `SettingUpdateRequest`) semula hanya `return $this->user() !== null` — no-op di route bergate auth. Reviewer Opencode menandai ketiganya "harus mencerminkan gate administrator pasca-F1".

**Yang dikerjakan**:
- **File baru**: `app/Http/Requests/Concerns/AuthorizesAdministrator.php` — trait `authorize()` = `user !== null && user->role === 'Administrator'`.
- **Diterapkan ke 5 FormRequest**: `StoreUserRequest`, `UpdateUserRequest`, `StoreRoleRequest`, `UpdateRoleRequest`, `SettingUpdateRequest` (menggantikan `return $this->user() !== null`).
- **Test**: +2 kasus di `AdministratorGuardTest` (`authorize()` langsung: tolak non-admin, terima admin) → 13 passed.
- **Verifikasi**: full suite **533 passed / 1 skipped**; pint bersih.

**Catatan desain**: chokepoint utama tetap middleware `role.administrator` (S1) — trait ini lapisan kedua. Bila suatu saat gate route dilepas, `authorize()` tetap menolak non-admin. Nama role `'Administrator'` konsisten dengan `EnsureAdministrator`.

**Sisa (opsional, tidak dikerjakan)**: `BulkItemDeleteRequest` (POST items/bulk-delete) belum pakai `AuthorizesModule` — hanya dilindungi middleware. Minor, karena route-nya di grup `role.access:Master Data`.

**Estimasi**: 0.5 hari. **Risiko**: RENDAH.

---

## FASE 3 — Hardening Konfigurasi & Input (SEDANG, cepat)

### 3.1 `.env.example` produksi-safe
- `Backend/.env.example:2,4` → `APP_ENV=production`? **Tidak** — biarkan `local` untuk dev, tapi tambahkan komentar tegas + panduan deploy: di produksi WAJIB `APP_DEBUG=false`. Bila proyek punya `railway.toml` (terlihat pernah ada), set di sana.
- **Kriteria**: dokumentasi di `Backend/README.md` atau `AGENTS.md`; tidak ada perubahan perilaku dev.

### 3.2 `Item` model: keluarkan `stock`/`reserved` dari `$fillable`
- **File**: `Backend/app/Models/Item.php`.
- **Efek**: `Item::create()` di `ItemController::store` (baris 112-113: `$data['stock'] = $data['stock'] ?? 0`) **akan error** karena tidak lagi fillable → ganti ke assignment eksplisit setelah create, atau `forceFill`. **Perlu verifikasi** `ItemSeeder` & `bulkImport` (yang `Item::create($payload)`) tidak memuat `stock`.
- **Kriteria lulus**: `composer test` hijau (khusus `ItemApiTest`, `BulkImportItemsTest`, `DatabaseSeederConsistencyTest`).

### 3.3 Escape `company.logo` di klien
- **File**: `Frontend/src/hooks/use-settings.ts:45` → validasi nilai dengan regex `^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$` sebelum masuk `src`; jika tidak cocok, jangan render `<img>`. (Backend sudah memvalidasi — ini lapisan kedua.)
- **Kriteria lulus**: `use-settings` spec (bila ada) / verifikasi manual cetak PO tanpa logo rusak.

### 3.4 Rate limit endpoint berat
- **File**: `Backend/routes/api.php` → tambah `throttle` pada `POST stock-documents`, `POST items/bulk-import`, `POST items/sync-cost`, endpoint laporan agregat (`GET laporan/*`).
- **Saran nilai**: `throttle:60,1` untuk mutasi umum, `throttle:10,1` untuk bulk-import/sync-cost.
- **Kriteria lulus**: test bahwa melebihi batas → 429.

**Estimasi**: 1 hari. **Risiko**: RENDAH.

---

## FASE 4 — Skalabilitas Frontend: Server-side Pagination

**Tujuan**: menghentikan `fetchAll()` (cap 50.000 baris) di halaman berat. Lihat `roadmap-final-skalabilitas-wms.md` Fase 1 (sudah menyiapkan `per_page` + index).

### 4.1 Hook server-paginated generik
- **File baru**: `Frontend/src/hooks/use-server-table.ts` — bungkus `useQuery` dengan `{ page, per_page, search, filters }` → kirim ke API, simpan `meta` untuk kontrol paginasi UI.
- **Pola SSR**: pertahankan `enabled: typeof window !== "undefined"`.

### 4.2 Migrasi bertahap (satu modul per PR)
Urutan (berat → ringan):
1. `useStockRows` (`persediaan/stock`) — `GET /api/persediaan/stock`. *(nama hook aktual di `src/hooks/use-persediaan.ts`, bukan `use-stock`)*
2. `useStockDocuments` (`transaksi`) — `GET /api/persediaan/stock-documents`.
3. `useItems` (`src/hooks/use-master.ts:103`) — `GET /api/master/items`.
4. `use-laporan` (laporan agregat — sudah server-driven sebagian).

**Pertahankan `fetchAll()`** untuk dropdown/lookup kecil (kategori, satuan, gudang) yang memang butuh seluruh opsi.

**Kriteria lulus**: halaman tetap berfungsi (filter/search/pagination) dengan `per_page ≤ 100`; `npx tsc --noEmit` + `npm test` hijau; tidak ada regresi UX (kolom Gudang, dll).

**Estimasi**: 3–5 hari (bertahap). **Risiko**: SEDANG (banyak file tersentuh) → mitigasi: satu modul per commit, test e2e `read-only.spec.ts`.

---

## FASE 5 — Skalabilitas Backend: Ledger & Analitik

**Tujuan**: memangkas O(n) per transaksi & pemuatan dokumen besar ke memori.

### 5.1 `StockLedger`: incremental update (bukan full rebuild)
- **File**: `Backend/app/Services/StockLedger.php`.
- **Pendekatan**: `rebuildForItem` saat ini memuat SELURUH movement lalu fold ulang. Ganti dengan update **delta** per movement pada `item_stock` (tambah/kurangi `stock`, update `unit_cost_avg` via weighted formula) — dengan catatan: weighted average hanya berubah pada IN (sesuai semantik saat ini). Sediakan `rebuildForItem` sebagai **fallback/reconciliation** (dipakai command perbaikan `stock:reconcile-*`).
- **PENTING**: harus ada **test parity** yang membandingkan hasil incremental vs full-fold untuk serangkaian movement acak (deterministik). **Catatan**: `ScaleFase2ParityTest` **tidak ada** — parity test dibangun **dari nol**, dengan `tests/Unit/FifoFoldTest.php` sebagai pola dan `tests/Feature/ReconcileBinMismatchCommandTest.php` sebagai contoh assertion pergerakan stok.
- **Kriteria lulus**: parity test hijau untuk FIFO/Average/Max; `stockCard`/`valuation`/`mutasi` menghasilkan angka identik sebelum-sesudah.

### 5.2 Laporan: agregasi di SQL, hindari load-all + N+1
- **File**: `Backend/app/Http/Controllers/LaporanController.php` (`keluarAnalytics`).
- Sudah ada sebagian di SQL; lanjutkan: ganti loop PHP atas `$baseDocs` dengan `GROUP BY` + eager-load relasi yang sudah di-`with`, dan hindari `->get()` seluruh dokumen periode (pakai agregat per bulan/tujuan).
- **Kriteria lulus**: `LaporanKeluarAnalyticsTest` + `TransaksiAnalyticsApiTest` hijau; EXPLAIN memakai index.

### 5.3 `CodeGenerator` heal path
- **File**: `Backend/app/Support/CodeGenerator.php:71-95` — jalur heal memakai `pluck` seluruh kolom. Tambahkan index pada kolom `no`/`code` (sebagian sudah) + batasi scan dengan `LIKE 'PREFIX/YYYY/%'` yang sudah ada; **dokumentasikan** bahwa heal adalah jalur langka. Bila perlu, ganti `pluck+reduce` dengan `MAX()` SQL (jauh lebih murah) — **catatan**: `MAX()` pada VARCHAR tidak selalu benar untuk campuran lebar; verifikasi.

**Estimasi**: 3–5 hari. **Risiko**: TINGGI (logika nilai persediaan) → mitigasi: parity test wajib, jangan ubah semantik (S5).

---

## FASE 6 — Postur Frontend & Deployment

### 6.1 Header keamanan + ganti ngrok (produksi)
- **File**: `Frontend/vercel.json` → tambah `headers` (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`).
- **CSP** untuk app yang memakai token di `localStorage` sangat penting (mitigasi token-theft bila ada XSS). Sesuaikan dengan kebutuhan (shadcn, inline style tema).
- **Ganti** rewrite `/api/*` dari URL ngrok hardcoded ke **domain backend tetap** (env/deployment config), atau minimal pindahkan URL ke secret Vercel.
- **Kriteria lulus**: aplikasi tetap berfungsi di produksi (login, API); header terverifikasi via curl; CSP tidak memblokir resource sah.

### 6.2 Perbaikan konsistensi kecil (gabung satu commit)
1. ~~`app-shell.tsx` tambah gate `/pengaturan`~~ → **DIBATALKAN (S9)**: `/pengaturan` halaman hibrida untuk semua role; gating = regresi UX. Cukup pastikan gating level internal (`canWrite = hasModuleLevel("System","Tulis")`) tetap ada.
2. `use-auth.tsx:164-166` → `hasModule` fail-closed (`status === "authenticated" && ...`); audit pemakaian agar tidak ada komponen yang bergantung pada perilaku lama.
3. **Koreksi atribusi (pasca-review)**: iframe tanpa `sandbox` ada di **`barcode-label.ts:829`** (`printHtml`), BUKAN `print-doc.ts:68` (itu `window.open`). Rekomendasi: pertimbangkan `sandbox` pada iframe `printHtml` — namun konfirmasi dulu konten selalu dari `escPrintText` (kemungkinan sudah aman; risiko rendah). Preview `barcode.tsx:803` sudah benar `sandbox=""`.
4. `opname-count-page.tsx:362-379` → ekspor `API_BASE` dari `api.ts` dan pakai (hilangkan hardcode `/api`).
5. Hapus header `ngrok-skip-browser-warning` dari `api.ts` **setelah** 6.1 selesai.

### 6.3 Bersihkan artefak debug di root `Backend/` (temuan tambahan)

**Temuan**: terdapat 4 script debug + 2 file JSON di root `Backend/` yang **SUDAH TER-TRACK git** (diverifikasi `git ls-files`; masuk via commit `28e844f` "Fixed: Changing NGROK URL" — kemungkinan tersapu `git add .`):
- `Backend/audit.php`, `Backend/check-movements.php`, `Backend/rebuild_drift.php`
- `Backend/fix-zombies.php` ⚠️ **berbahaya** — script ini **menghapus** baris & dokumen yang gagal diposting (`$doc->lines()->delete(); $doc->delete();` di baris 41-42) tanpa konfirmasi.
- `Backend/fix-result.json`, `Backend/movements.json`

> **Koreksi (pasca-review putaran 2)**: versi awal dokumen menyebut ini "tidak ter-track dan tidak di-gitignore" — **itu salah**. Artefak sudah ter-commit, jadi perbaikannya bukan sekadar "hapus file lokal" melainkan **`git rm` + commit** (butuh instruksi eksplisit user per root `AGENTS.md` git rules). Urgensi **naik**: script destruktif sudah ada di history repo, bukan sekadar risiko ter-commit di masa depan.

**Risiko**: script destruktif (`fix-zombies.php`) sudah di history & dapat dijalankan manual tanpa guard; `git add .` berikutnya akan terus membawanya; kebingungan bagi kontributor baru (tidak ada di AGENTS.md/README).

**Perubahan**: **`git rm`** keenam file, lalu tambahkan pola eksplisit ke `Backend/.gitignore` (`audit.php`, `check-movements.php`, `fix-zombies.php`, `rebuild_drift.php`, `fix-result.json`, `movements.json`) — jangan pakai `/*.php` karena bisa menyapu file sah. Bila masih diperlukan, pindahkan ke `Backend/tools/` (ter-commit sengaja) + dokumentasikan di `Backend/AGENTS.md` — **kecuali** `fix-zombies.php` sebaiknya dihapus total (perilaku destruktifnya lebih baik diganti command resmi `stock:reconcile-*` yang sudah ada).

**Kriteria lulus**: `git ls-files Backend/ | grep -E '(audit|check-movements|fix-zombies|rebuild_drift)\.php|fix-result\.json|movements\.json'` kosong; `.gitignore` mencegah kemunculan ulang.

**Estimasi**: 0.5 hari (hanya rm+ignore+commit). **Risiko**: RENDAH — **tapi butuh izin commit eksplisit**.

---

## Checklist Verifikasi Final (per fase selesai)

- [ ] `cd Backend && composer test` → hijau (semua suite)
- [ ] `cd Frontend && npm run lint && npx tsc --noEmit && npm test` → hijau
- [ ] Manual: login tiap role seed (`Administrator`, `Supervisor`, `Operator Gudang`, `Auditor`) → hak akses sesuai matriks
- [ ] F1: user non-admin → 403 di **tulis** `roles`/`users`/`settings`; **baca** tetap 200 (S8); admin terakhir/hapus-diri → 422
- [ ] F2: tidak ada FormRequest dengan `authorize(): true` (kecuali yang memang publik)
- [ ] F4: halaman berat memakai `per_page ≤ 100`; tidak ada request `per_page=100` berulang >10×
- [ ] F5: parity test ledger hijau; angka valuasi identik
- [ ] F6: header keamanan ada di respons produksi; iframe `printHtml` ditinjau; artefak debug root Backend dihapus & di-gitignore
- [ ] `.dev/claims.md` di-update → `done` untuk tiap path

---

## Usulan jangka panjang (di luar fase, butuh keputusan produk)

- **Auth HttpOnly cookie** (Sanctum stateful) menggantikan bearer di `localStorage` → menghilangkan kelas risiko XSS token-theft. Perubahan besar (backend + frontend + CORS), butuh keputusan sadar karena AGENTS.md menetapkan bearer-token sebagai keputusan desain.
- **Observability**: audit saat ini fail-open (kegagalan senyap). Pertimbangkan alert bila `AuditLog::create` gagal.
- **CI**: belum ada `.github/`. Menambahkan CI (lint + test + tsc) mencegah regresi otomatis.

---

## Riwayat Dokumen

| Tanggal | Perubahan |
|---|---|
| 2026-09-16 | Draft awal — dari audit keamanan & skalabilitas + verifikasi empiris 3 temuan kritis |
| 2026-09-16 | **Revisi pasca-review Opencode** — verifikasi independen 3 keberatan reviewer (semua akurat): turunkan severity P0-1→TINGGI, P0-3→SEDANG, P2-2/P2-3→RENDAH; revisi F1.2 (gate tulis saja, S8); drop F6.2-1 (S9); koreksi atribusi P3-3 ke `barcode-label.ts`; putuskan kontradiksi §1.3 (S10); tambah §0c + §6.3 (artefak debug) + test regresi baca |
| 2026-09-16 | **Sinkronisasi kode berevolusi (§0e)** — deteksi sesi `flex-roles` mengubah 26 file (role dinamis + `can_review`); verifikasi empiris jalur eskalasi baru (`POST roles`=201, `PUT roles/{lain}`=200 bypass self-lockout, `DELETE roles`=403); perluas F1.2 ke `POST/DELETE roles`; tandai koordinasi (tunggu sesi lain commit sebelum F1) |
| 2026-09-16 | **F1 DIEKSEKUSI** (uncommitted) — middleware `EnsureAdministrator` + alias, gate tulis users/roles/settings, guard admin-terakhir & self-mutation (model-level), test `AdministratorGuardTest` (11 kasus). Suite **523 passed / 1 skipped**. Test lama disesuaikan (`TestCase::actingAsMasterAdmin` → role `Administrator`). Lihat §F1-Hasil. **Berikutnya: F2.** |

---

## Pendapat Peninjau (Opencode — 2026-09-16)

> **STATUS: SUDAH DITINDAKLANJUTI.** Ketiga keberatan telah diverifikasi independen terhadap kode dan **dinyatakan akurat** (lihat §0c). Dokumen telah direvisi: severity diturunkan, F1.2 dibatasi ke operasi tulis (S8), F6.2-1 dibatalkan (S9), atribusi P3-3 dikoreksi, kontradiksi §1.3 diputuskan (S10). Teks asli pendapat dipertahankan di bawah sebagai jejak audit.

Dokumen ini secara umum **berkualitas dan layak dieksekusi**, dengan tiga kekuatan utama: (1) setiap temuan dirujuk ke `file:line` yang waktu saya crosscheck satu per satu, ~80% akurat; (2) keputusan desain S1–S7 dikunci sebelum eksekusi, mencegah perdebatan ulang; (3) urutan fase benar — F1 (murah, terisolasi, bukti terkuat di P0-2) didahulukan dari F5 (mahal, berisiko).

Namun ada **tiga hal yang menurut saya harus dikoreksi sebelum eksekusi**:

1. **Severity P0-1/P0-3 overstated.** Klaim "terbukti empiris" (PUT roles → 200, PUT settings → 200 sebagai non-admin Tulis) valid secara mekanisme, tetapi **tidak ada seeded role dengan `Master Data Tulis`/`System Tulis` selain Administrator** (`RolePermissionSeeder`) — bukti ad-hoc pasti memakai permission artifisial. Ini *coarse privilege boundary*, bukan vuln yang tereksploitasi dari kondisi seed. P0-1 KRITIS → TINGGI, P0-3 → SEDANG. P0-2 (tanpa guard admin-terakhir/self-delete) adalah satu-satunya KRITIS yang murni.
2. **F1.2 punya blast radius yang belum disadari.** Memindahkan seluruh `apiResource('users')` + `GET roles` ke grup administrator akan merusak `GET /users` yang dipakai form non-admin (`purchase-request-sheet`, select PIC di `master-forms`/`opname-create-dialog`) dan `GET /roles` yang dibaca `RolePage` role Baca. Gate-admin harus **hanya untuk operasi tulis**; bacaan tetap di bawah `role.access`. Ini cacat rencana paling serius.
3. **F6.2-1 (gate `/pengaturan` → System) jangan diimplementasikan.** `/pengaturan` adalah halaman hibrida untuk semua role (theme picker + profil yang graceful-degrade); proposal itu akan mengunci Supervisor/Operator/Auditor dari theme picker. Selain itu P3-3 salah atribusi file (`print-doc.ts` memakai `window.open`, bukan iframe), dan P2-2/P2-3 masing-masing sudah dijaga oleh `validated()` allowlist dan regex backend — keduanya higiene, bukan SEDANG.

Rekomendasi saya ke Hermes: fokus verifikasi independen pada (a) precondition bukti ad-hoc P0-1/P0-3, (b) daftar konsumen `GET /users` dan `GET /roles` di frontend, dan (c) perilaku `/pengaturan` untuk role tanpa System. Jika ketiganya sependapat dengan saya, dokumen perlu revisi kecil (turunkan 3 severity, batasi scope F1.2 ke operasi tulis, drop F6.2-1, putuskan kontradiksi §1.3 soal hapus-diri) lalu F1 siap jalan.

**Hasil verifikasi Hermes (2026-09-16):** ketiga keberatan **akurat** — lihat §0c untuk bukti per klaim. Revisi sudah diterapkan. **F1 siap dieksekusi.**

### Pembaruan pendapat — putaran kedua (2026-09-16, build mode)

Setelah revisi di atas saya lakukan crosscheck ulang + analisis F2 (atas permintaan user) dan menemukan **satu kesalahan faktual baru**, satu putusan analisis, dua keputusan terkunci, dan tiga nit dokumen:

1. **§6.3 salah klaim status git (temuan baru, perlu koreksi di badan dokumen).** Enam artefak debug **sudah ter-track** — `git ls-files` membuktikan semuanya ter-commit (masuk di `28e844f`, kemungkinan tersapu `git add .`), bukan "tidak ter-track dan tidak di-gitignore" seperti tertulis. Klaim destruktif `fix-zombies.php:41-42` tetap benar. Konsekuensi: penghapusan = `git rm` + commit (butuh instruksi eksplisit user per git rules), dan urgensinya justru **naik** — script destruktif sudah ada di history, bukan sekadar risiko ter-commit.
2. **Analisis F2 (full 43 FormRequest): aman secara arsitektural, risiko = human error mapping.** Semua aksi auth-only (15 method approval/lock di `StockDocumentController`, approve/reject `ProcDocController`) memakai plain `Request`, dan login memakai `Request::validate` — full rollout tidak menyentuh alur SoD maupun login. Karena middleware jalan sebelum `authorize()`, trait tidak pernah bisa melonggarkan apa pun; satu-satunya mode kegagalan adalah mapping (modul, level) yang lebih ketat dari middleware → false 403. Dari 43 class, bulk-nya mekanis, **3 istimewa** (`UpdateRoleRequest`, `Store/UpdateUserRequest`, `SettingUpdateRequest` — harus mencerminkan gate administrator pasca-F1). Syarat wajib: satu helper level bersama untuk middleware + trait (anti-drift), dan suite (~50 file feature) sebagai oracle — jika mapping sempurna, suite tetap hijau. Effort realistis ~1 hari, bukan 1–2 hari. **Rekomendasi saya tetap parsial** (nilai/harga terbaik; middleware tetap chokepoint sesungguhnya), full sebagai ekstensi opsional.
3. **Keputusan user yang mengunci rencana:** F1.3 = **model-level** (`User::booted()` `deleting`/`saving`; guard hanya aktif bila sudah ≥1 admin aktif sehingga seeder admin pertama lolos; operasi console tanpa auth melewati cek diri-sendiri); F6.1 = **headers saja** (rewrite ngrok tetap dikelola `dev.sh`).
4. **Nit dokumen untuk eksekutor/Hermes:** (a) P1-1 "44 file" → aktual **43 class FormRequest** (44 file di direktori `Requests/`); (b) nama hook F4 tidak sama dengan kode — yang ada `useStockRows`/`useStockDocuments` (`use-persediaan.ts`) dan `useItems` (`use-master.ts`); (c) F5.1 "`ScaleFase2ParityTest` yang sudah ada" → **file itu tidak ada** (yang ada `FifoFoldTest` + `ReconcileBinMismatchCommandTest`) — parity test harus dibangun dari nol dengan `FifoFoldTest` sebagai pola.

Planning eksekusi F1–F6 sudah saya susun terpisah (estimasi total ~9–15 hari bertahap, F1 pertama). Status keseluruhan: **dokumen layak eksekusi dengan 2 koreksi badan tertunda** (§6.3 status git, nit F4/F5.1) — keduanya tidak menghalangi F1.
