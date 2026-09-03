<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Warehouse;
use App\Support\CodeGenerator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $password = (string) env('DEMO_PASSWORD', '');

        if ($password === '') {
            // Saat suite test (`$this->seed()`), nilai tak penting & tak dikomit — cukup acak.
            // Di luar testing (dev/prod), password WAJIB dari env: tanpa nilai, seeder menolak jalan.
            if (app()->environment('testing')) {
                $password = Str::password(16);
            } else {
                throw new \RuntimeException(
                    'DEMO_PASSWORD belum di-set. Tambahkan DEMO_PASSWORD=<nilai> di Backend/.env (contoh di .env.example), lalu jalankan seed ulang.'
                );
            }
        }

        $warehouses = Warehouse::pluck('id')->toArray();
        $users = [
            ['name' => 'Rudi Hartono', 'role' => 'Administrator', 'wh' => 0],
            ['name' => 'Siti Aminah', 'role' => 'Supervisor', 'wh' => 0],
            ['name' => 'Bayu Pratama', 'role' => 'Operator Gudang', 'wh' => 1],
            ['name' => 'Dewi Lestari', 'role' => 'Auditor', 'wh' => null],
            ['name' => 'Agus Salim', 'role' => 'Operator Gudang', 'wh' => 2],
            ['name' => 'Nur Hidayat', 'role' => 'Supervisor', 'wh' => 3],
        ];

        foreach ($users as $user) {
            $whId = $user['wh'] !== null && isset($warehouses[$user['wh']]) ? $warehouses[$user['wh']] : null;
            User::create([
                'code' => CodeGenerator::next(User::class, 'USR'),
                'name' => $user['name'],
                'email' => strtolower(str_replace(' ', '.', $user['name'])).'@kelolagudang.id',
                'role' => $user['role'],
                'default_warehouse_id' => $whId,
                'is_active' => true,
                'password' => $password,
            ]);
        }
    }
}
