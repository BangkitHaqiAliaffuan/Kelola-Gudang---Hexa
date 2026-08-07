<?php

namespace Database\Seeders;

use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        $warehouses = [
            ['code' => 'GDG-001', 'name' => 'Gudang Pusat Jakarta', 'city' => 'Jakarta Timur'],
            ['code' => 'GDG-002', 'name' => 'Gudang Bekasi', 'city' => 'Bekasi'],
            ['code' => 'GDG-003', 'name' => 'Gudang Surabaya', 'city' => 'Surabaya'],
            ['code' => 'GDG-004', 'name' => 'Gudang Bandung', 'city' => 'Bandung'],
            ['code' => 'GDG-005', 'name' => 'Gudang Semarang', 'city' => 'Semarang'],
            ['code' => 'GDG-006', 'name' => 'Gudang Medan', 'city' => 'Medan'],
            ['code' => 'GDG-007', 'name' => 'Gudang Makassar', 'city' => 'Makassar'],
            ['code' => 'GDG-008', 'name' => 'Gudang Transit Cikarang', 'city' => 'Cikarang'],
        ];

        foreach ($warehouses as $warehouse) {
            Warehouse::create($warehouse);
        }
    }
}
