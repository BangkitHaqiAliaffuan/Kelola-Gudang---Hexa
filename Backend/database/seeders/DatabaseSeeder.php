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
