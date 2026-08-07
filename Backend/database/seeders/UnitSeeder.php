<?php

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    public function run(): void
    {
        $units = [
            ['code' => 'UNT-001', 'name' => 'PCS'],
            ['code' => 'UNT-002', 'name' => 'BOX'],
            ['code' => 'UNT-003', 'name' => 'SET'],
            ['code' => 'UNT-004', 'name' => 'ROLL'],
            ['code' => 'UNT-005', 'name' => 'LTR'],
            ['code' => 'UNT-006', 'name' => 'KG'],
            ['code' => 'UNT-007', 'name' => 'DUS'],
            ['code' => 'UNT-008', 'name' => 'METER'],
            ['code' => 'UNT-009', 'name' => 'UNIT'],
        ];

        foreach ($units as $unit) {
            Unit::create($unit);
        }
    }
}
