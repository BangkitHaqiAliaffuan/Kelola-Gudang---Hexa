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

        $n = 0;
        foreach ($warehouses as $warehouse) {
            foreach (['A', 'B', 'C', 'D'] as $letter) {
                $n++;

                Rack::create([
                    'warehouse_id' => $warehouse->id,
                    'code' => 'RAK-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                    'name' => "Rak {$letter} — {$warehouse->name}",
                    'is_active' => true,
                ]);
            }
        }
    }
}
