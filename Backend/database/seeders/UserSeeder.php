<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $names = [
            'Rudi Hartono',
            'Siti Aminah',
            'Bayu Pratama',
            'Dewi Lestari',
            'Agus Salim',
            'Nur Hidayat',
        ];

        foreach ($names as $name) {
            User::create([
                'name' => $name,
                'email' => strtolower(str_replace(' ', '.', $name)).'@kelolagudang.id',
                'password' => 'password',
            ]);
        }
    }
}
