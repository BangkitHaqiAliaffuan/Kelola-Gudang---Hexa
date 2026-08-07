<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        $departments = [
            'Produksi',
            'Maintenance',
            'Logistik',
            'QC',
            'Proyek',
            'Umum',
        ];

        $users = User::orderBy('id')->get();

        foreach ($departments as $i => $name) {
            Department::create([
                'code' => 'DEP-'.str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT),
                'name' => $name,
                'head_user_id' => $users[$i % $users->count()]?->id,
                'is_active' => true,
            ]);
        }
    }
}
