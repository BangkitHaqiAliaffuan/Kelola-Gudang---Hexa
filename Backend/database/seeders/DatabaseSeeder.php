<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
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
            StockMovementSeeder::class,
            RolePermissionSeeder::class,
        ]);
    }
}
