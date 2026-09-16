<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'Administrator' => [
                'description' => 'Akses penuh semua modul.',
                'can_review' => false,
                'access' => [
                    ['module' => 'Master Data', 'level' => 'Kelola'],
                    ['module' => 'Transaksi', 'level' => 'Kelola'],
                    ['module' => 'Persediaan', 'level' => 'Kelola'],
                    ['module' => 'Stock Opname', 'level' => 'Kelola'],
                    ['module' => 'Pengadaan', 'level' => 'Kelola'],
                    ['module' => 'Laporan', 'level' => 'Kelola'],
                    ['module' => 'System', 'level' => 'Kelola'],
                    ['module' => 'Audit Trails', 'level' => 'Kelola'],
                ],
            ],
            'Supervisor' => [
                'description' => 'Pengawas operasional gudang.',
                'can_review' => false,
                'access' => [
                    ['module' => 'Master Data', 'level' => 'Baca'],
                    ['module' => 'Transaksi', 'level' => 'Tulis'],
                    ['module' => 'Persediaan', 'level' => 'Tulis'],
                    ['module' => 'Stock Opname', 'level' => 'Baca'],
                    ['module' => 'Pengadaan', 'level' => 'Tulis'],
                    ['module' => 'Approval Pengadaan', 'level' => 'Baca'],
                    ['module' => 'Laporan', 'level' => 'Baca'],
                ],
            ],
            'Operator Gudang' => [
                'description' => 'Pelaksana harian keluar-masuk barang.',
                'can_review' => false,
                'access' => [
                    ['module' => 'Master Data', 'level' => 'Baca'],
                    ['module' => 'Transaksi', 'level' => 'Tulis'],
                    ['module' => 'Persediaan', 'level' => 'Tulis'],
                    ['module' => 'Stock Opname', 'level' => 'Tulis'],
                    ['module' => 'Pengadaan', 'level' => 'Baca'],
                ],
            ],
            'Auditor' => [
                'description' => 'Me-review dan menyetujui dokumen persediaan.',
                'can_review' => true,
                'access' => [
                    ['module' => 'Master Data', 'level' => 'Baca'],
                    ['module' => 'Transaksi', 'level' => 'Baca'],
                    ['module' => 'Persediaan', 'level' => 'Baca'],
                    ['module' => 'Stock Opname', 'level' => 'Baca'],
                    ['module' => 'Pengadaan', 'level' => 'Baca'],
                    ['module' => 'Laporan', 'level' => 'Baca'],
                    // System: Tidak Ada (tanpa baris = tanpa akses; grup System
                    // + /system/* + API System tak terlihat oleh non-admin).
                    ['module' => 'Audit Trails', 'level' => 'Baca'],
                ],
            ],
        ];

        foreach ($defaults as $role => $spec) {
            // Registry role lahir dulu (idempoten) — sebelum baris permission.
            Role::firstOrCreate(
                ['name' => $role],
                [
                    'description' => $spec['description'],
                    'is_system' => true,
                    'can_review' => $spec['can_review'],
                ]
            );

            foreach ($spec['access'] as $entry) {
                RolePermission::firstOrCreate(
                    ['role' => $role, 'module' => $entry['module']],
                    ['level' => $entry['level']],
                );
            }
        }
    }
}
