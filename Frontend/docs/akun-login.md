# Akun Login Kelola Gudang Pro

Daftar akun yang di-seed oleh backend (`Backend/database/seeders/UserSeeder.php`) dan bisa dipakai untuk login di halaman `localhost:8080`.

**Password semua akun: `IndomieGoreng`**

| Code | Nama | Email | Role |
| ---- | ---- | ----- | ---- |
| USR-001 | Rudi Hartono | `rudi.hartono@kelolagudang.id` | Administrator |
| USR-002 | Siti Aminah | `siti.aminah@kelolagudang.id` | Supervisor |
| USR-003 | Bayu Pratama | `bayu.pratama@kelolagudang.id` | Operator Gudang |
| USR-004 | Dewi Lestari | `dewi.lestari@kelolagudang.id` | Auditor |
| USR-005 | Agus Salim | `agus.salim@kelolagudang.id` | Operator Gudang |
| USR-006 | Nur Hidayat | `nur.hidayat@kelolagudang.id` | Supervisor |

## Rekomendasi

Gunakan **USR-001 Rudi Hartono** (Administrator) jika ingin mengakses semua modul. Akun lain memakai akses berbasis role dari `role_permissions` (dapat diubah di halaman Master → Roles).

## Catatan

- Akun-akun ini muncul hanya jika dev DB sudah di-seed (`php artisan db:seed` di `Backend/`).
- Jika login gagal dengan "Kredensial yang Anda masukkan tidak cocok.", kemungkinan dev DB kosong — jangan jalankan `migrate:fresh`, cukup jalankan `php artisan db:seed` (lihat AGENTS.md).
