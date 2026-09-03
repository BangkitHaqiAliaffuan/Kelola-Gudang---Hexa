<?php

namespace Database\Seeders;

use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class RackSeeder extends Seeder
{
    public function run(): void
    {
        // Kode rak hanya unik per gudang (composite), jadi guard memakai A-01 pertama.
        if (Rack::where('code', 'A-01')->exists()) {
            return;
        }

        $warehouses = Warehouse::orderBy('id')->get();

        foreach ($warehouses as $warehouse) {
            foreach (['A', 'B', 'C', 'D'] as $aisle) {
                foreach (range(1, 3) as $bayNumber) {
                    $bay = str_pad((string) $bayNumber, 2, '0', STR_PAD_LEFT);

                    Rack::create([
                        'warehouse_id' => $warehouse->id,
                        'aisle' => $aisle,
                        'bay' => $bay,
                        'code' => "{$aisle}-{$bay}",
                        'name' => "Rak {$aisle}-{$bay}",
                        'is_active' => true,
                    ]);
                }
            }
        }
    }
}
