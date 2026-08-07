<?php

namespace Database\Seeders;

use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class RackSeeder extends Seeder
{
    public function run(): void
    {
        $warehouses = Warehouse::orderBy('id')->get();

        foreach ($warehouses as $warehouse) {
            foreach (['A', 'B', 'C', 'D'] as $aisle) {
                Rack::create([
                    'warehouse_id' => $warehouse->id,
                    'aisle' => $aisle,
                    'bay' => '01',
                    'code' => "{$aisle}-01",
                    'name' => "Rak {$aisle} — {$warehouse->name}",
                    'is_active' => true,
                ]);
            }
        }
    }
}
