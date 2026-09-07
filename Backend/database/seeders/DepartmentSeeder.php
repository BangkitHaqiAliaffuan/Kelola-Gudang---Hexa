<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        if (Department::where('code', 'DEP-001')->exists()) {
            return;
        }

        $departments = [
            'Produksi',
            'Maintenance',
            'Logistik',
            'QC',
            'Proyek',
            'Umum',
        ];

        $users = User::where('role', '!=', 'Administrator')->where('is_active', true)->orderBy('id')->get();

        // Fallback jika tidak ada user non-admin (mis. fresh DB sebelum UserSeeder) — gunakan semua user aktif.
        if ($users->isEmpty()) {
            $users = User::where('is_active', true)->orderBy('id')->get();
        }

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
