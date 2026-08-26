# Akun Login Kelola Gudang Pro

Daftar akun yang di-seed oleh backend (`Backend/database/seeders/UserSeeder.php`) dan bisa dipakai untuk login di halaman `localhost:8080`.

**Password semua akun diambil dari `DEMO_PASSWORD` di `Backend/.env`** (wajib diisi sebelum `php artisan db:seed`; tanpa nilai, seeder menolak jalan). Nilai password tidak disimpan di repo.

| Code    | Nama         | Email                          | Role            |
| ------- | ------------ | ------------------------------ | --------------- |
| USR-001 | Rudi Hartono | `rudi.hartono@kelolagudang.id` | Administrator   |
| USR-002 | Siti Aminah  | `siti.aminah@kelolagudang.id`  | Supervisor      |
| USR-003 | Bayu Pratama | `bayu.pratama@kelolagudang.id` | Operator Gudang |
| USR-004 | Dewi Lestari | `dewi.lestari@kelolagudang.id` | Auditor         |
| USR-005 | Agus Salim   | `agus.salim@kelolagudang.id`   | Operator Gudang |
| USR-006 | Nur Hidayat  | `nur.hidayat@kelolagudang.id`  | Supervisor      |

## Rekomendasi

Gunakan **USR-001 Rudi Hartono** (Administrator) jika ingin mengakses semua modul. Akun lain memakai akses berbasis role dari `role_permissions` (dapat diubah di halaman Master → Roles).

## Catatan

- Akun-akun ini muncul hanya jika dev DB sudah di-seed (`php artisan db:seed` di `Backend/`).
- Sebelum seed, set `DEMO_PASSWORD=<nilai>` di `Backend/.env` (placeholder di `Backend/.env.example`).
- Jika login gagal dengan "Kredensial yang Anda masukkan tidak cocok.", kemungkinan dev DB kosong — jangan jalankan `migrate:fresh`, cukup jalankan `php artisan db:seed` (lihat AGENTS.md).
- Jika DB sudah pernah di-seed dengan password lama, rotasi password semua akun ke `DEMO_PASSWORD` baru via tinker (password lama menjadi tidak berlaku):
  `php artisan tinker --execute="App\Models\User::all()->each(function ($u) { $u->password = env('DEMO_PASSWORD'); $u->save(); });"`
