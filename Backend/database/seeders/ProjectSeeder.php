<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Seeder;

class ProjectSeeder extends Seeder
{
    public function run(): void
    {
        if (Project::where('code', 'PRJ-001')->exists()) {
            return;
        }

        $projects = [
            ['name' => 'Proyek Tol Cisumdawu', 'status' => 'Berjalan', 'budget' => 250000000],
            ['name' => 'Renovasi Line 3', 'status' => 'Berjalan', 'budget' => 95000000],
            ['name' => 'Instalasi Panel Gedung B', 'status' => 'Perencanaan', 'budget' => 120000000],
            ['name' => 'Maintenance Rutin Q3', 'status' => 'Selesai', 'budget' => 42000000],
            ['name' => 'Ekspansi Gudang Bekasi', 'status' => 'Berjalan', 'budget' => 375000000],
        ];

        $users = User::orderBy('id')->get();

        foreach ($projects as $i => $project) {
            Project::create([
                'code' => 'PRJ-'.str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT),
                'name' => $project['name'],
                'pic_user_id' => $users[$i % $users->count()]?->id,
                'start_date' => '2026-0'.(($i % 6) + 1).'-01',
                'end_date' => '2026-'.str_pad((string) (($i % 6) + 4), 2, '0', STR_PAD_LEFT).'-28',
                'status' => $project['status'],
                'budget' => $project['budget'],
            ]);
        }
    }
}
