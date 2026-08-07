<?php

namespace Database\Seeders;

use App\Models\User;
use App\Support\CodeGenerator;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
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
                'password' => 'password',
            ]);
        }
    }
}
