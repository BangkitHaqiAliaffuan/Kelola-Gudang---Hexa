<?php

namespace Database\Seeders;

use App\Models\Merk;
use Illuminate\Database\Seeder;

class MerkSeeder extends Seeder
{
    public function run(): void
    {
        $merks = [
            ['code' => 'MRK-001', 'name' => 'Nachi', 'country' => 'Jepang'],
            ['code' => 'MRK-002', 'name' => 'Philips', 'country' => 'Belanda'],
            ['code' => 'MRK-003', 'name' => 'Maspion', 'country' => 'Indonesia'],
            ['code' => 'MRK-004', 'name' => 'SKF', 'country' => 'Swedia'],
            ['code' => 'MRK-005', 'name' => 'Panasonic', 'country' => 'Jepang'],
            ['code' => 'MRK-006', 'name' => 'Krisbow', 'country' => 'Indonesia'],
            ['code' => 'MRK-007', 'name' => 'Tekiro', 'country' => 'Indonesia'],
            ['code' => 'MRK-008', 'name' => '3M', 'country' => 'Amerika Serikat'],
            ['code' => 'MRK-009', 'name' => 'Bosch', 'country' => 'Jerman'],
            ['code' => 'MRK-010', 'name' => 'Kenmaster', 'country' => 'Tiongkok'],
            ['code' => 'MRK-011', 'name' => 'Onda', 'country' => 'Indonesia'],
            ['code' => 'MRK-012', 'name' => 'Rucika', 'country' => 'Indonesia'],
        ];

        foreach ($merks as $merk) {
            Merk::create($merk);
        }
    }
}
