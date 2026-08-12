<?php

namespace Database\Seeders;

use App\Models\User;
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

        $users = [
            ['name' => 'Rudi Hartono', 'role' => 'Administrator'],
            ['name' => 'Siti Aminah', 'role' => 'Supervisor'],
            ['name' => 'Bayu Pratama', 'role' => 'Operator Gudang'],
            ['name' => 'Dewi Lestari', 'role' => 'Auditor'],
            ['name' => 'Agus Salim', 'role' => 'Operator Gudang'],
            ['name' => 'Nur Hidayat', 'role' => 'Supervisor'],
        ];

        foreach ($users as $user) {
            User::create([
                'code' => CodeGenerator::next(User::class, 'USR'),
                'name' => $user['name'],
                'email' => strtolower(str_replace(' ', '.', $user['name'])).'@kelolagudang.id',
                'role' => $user['role'],
                'is_active' => true,
                'password' => $password,
            ]);
        }
    }
}
