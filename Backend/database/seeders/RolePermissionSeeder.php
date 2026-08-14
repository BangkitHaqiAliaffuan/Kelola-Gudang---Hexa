<?php

namespace Database\Seeders;

use App\Models\RolePermission;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'Administrator' => [
                ['module' => 'Master Data', 'level' => 'Kelola'],
                ['module' => 'Transaksi', 'level' => 'Kelola'],
                ['module' => 'Persediaan', 'level' => 'Kelola'],
                ['module' => 'Stock Opname', 'level' => 'Kelola'],
                ['module' => 'Pengadaan', 'level' => 'Kelola'],
                ['module' => 'Laporan', 'level' => 'Kelola'],
                ['module' => 'System', 'level' => 'Kelola'],
                ['module' => 'Audit Trails', 'level' => 'Kelola'],
            ],
            'Supervisor' => [
                ['module' => 'Master Data', 'level' => 'Baca'],
                ['module' => 'Transaksi', 'level' => 'Tulis'],
                ['module' => 'Persediaan', 'level' => 'Tulis'],
                ['module' => 'Stock Opname', 'level' => 'Baca'],
                ['module' => 'Pengadaan', 'level' => 'Tulis'],
                ['module' => 'Approval Pengadaan', 'level' => 'Baca'],
                ['module' => 'Laporan', 'level' => 'Baca'],
            ],
            'Operator Gudang' => [
                ['module' => 'Master Data', 'level' => 'Baca'],
                ['module' => 'Transaksi', 'level' => 'Tulis'],
                ['module' => 'Persediaan', 'level' => 'Tulis'],
                ['module' => 'Stock Opname', 'level' => 'Tulis'],
                ['module' => 'Pengadaan', 'level' => 'Baca'],
            ],
            'Auditor' => [
                ['module' => 'Master Data', 'level' => 'Baca'],
                ['module' => 'Transaksi', 'level' => 'Baca'],
                ['module' => 'Persediaan', 'level' => 'Baca'],
                ['module' => 'Stock Opname', 'level' => 'Baca'],
                ['module' => 'Pengadaan', 'level' => 'Baca'],
                ['module' => 'Laporan', 'level' => 'Baca'],
                ['module' => 'System', 'level' => 'Baca'],
                ['module' => 'Audit Trails', 'level' => 'Baca'],
            ],
        ];

        foreach ($defaults as $role => $access) {
            foreach ($access as $entry) {
                RolePermission::firstOrCreate(
                    ['role' => $role, 'module' => $entry['module']],
                    ['level' => $entry['level']],
                );
            }
        }
    }
}
