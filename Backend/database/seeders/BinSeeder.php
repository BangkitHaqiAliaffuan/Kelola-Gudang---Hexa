<?php

namespace Database\Seeders;

use App\Models\Bin;
use App\Models\Rack;
use Illuminate\Database\Seeder;

class BinSeeder extends Seeder
{
    public function run(): void
    {
        // Kode bin hanya unik per rak (composite), jadi guard memakai 01-01 pertama.
        if (Bin::where('code', '01-01')->exists()) {
            return;
        }

        $racks = Rack::orderBy('id')->get();

        foreach ($racks as $rack) {
            foreach (range(1, 3) as $level) {
                foreach (range(1, 2) as $position) {
                    Bin::create([
                        'rack_id' => $rack->id,
                        'level' => str_pad((string) $level, 2, '0', STR_PAD_LEFT),
                        'position' => str_pad((string) $position, 2, '0', STR_PAD_LEFT),
                        'code' => str_pad((string) $level, 2, '0', STR_PAD_LEFT).'-'.str_pad((string) $position, 2, '0', STR_PAD_LEFT),
                        'name' => "Bin L{$level}-P{$position}",
                        'is_active' => true,
                    ]);
                }
            }
        }
    }
}
