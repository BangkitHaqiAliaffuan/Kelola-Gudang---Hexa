<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Satu transaksi global: abort di tengah = rollback total, tanpa sisa parsial.
        // CATATAN SKALA: ScaleBenchmarkSeeder SENGAJA tidak didaftarkan di sini —
        // ia hanya boleh jalan eksplisit (--class=...) di kelolagudang_test dan
        // punya gate anti-dev internal. Jangan tambahkan ke daftar di bawah.
        DB::transaction(function (): void {
            $this->call([
            CategorySeeder::class,
            SubCategorySeeder::class,
            MerkSeeder::class,
            UnitSeeder::class,
            WarehouseSeeder::class,
            RackSeeder::class,
            BinSeeder::class,
            SupplierSeeder::class,
            CustomerSeeder::class,
            VendorSeeder::class,
            ItemSeeder::class,
            UserSeeder::class,
            DepartmentSeeder::class,
            ProjectSeeder::class,
            WorkOrderSeeder::class,
            StockDocumentSeeder::class,
            ProcDocSeeder::class,
            RolePermissionSeeder::class,
            ]);
        });
    }
}
