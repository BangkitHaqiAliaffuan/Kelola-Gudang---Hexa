<?php

namespace Database\Seeders;

use App\Models\Bin;
use App\Models\Rack;
use Illuminate\Database\Seeder;

class BinSeeder extends Seeder
{
    public function run(): void
    {
        $racks = Rack::orderBy('id')->get();

        $n = 0;
        foreach ($racks as $rack) {
            foreach (range(1, 6) as $i) {
                $n++;

                Bin::create([
                    'rack_id' => $rack->id,
                    'code' => 'BIN-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                    'name' => "Bin {$i}",
                    'is_active' => true,
                ]);
            }
        }
    }
}
