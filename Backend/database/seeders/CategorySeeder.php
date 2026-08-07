<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['code' => 'KAT-001', 'name' => 'Komponen Elektronik', 'description' => 'Resistor, kapasitor, sensor, dan modul elektronik.'],
            ['code' => 'KAT-002', 'name' => 'Perkakas Mesin', 'description' => 'Alat potong, bor, dan kelengkapan mesin.'],
            ['code' => 'KAT-003', 'name' => 'Bahan Kimia', 'description' => 'Pelarut, lem, dan bahan kimia industri.'],
            ['code' => 'KAT-004', 'name' => 'Perlengkapan Kebersihan', 'description' => 'Alat dan bahan pembersih area kerja.'],
            ['code' => 'KAT-005', 'name' => 'Furnitur & Interior', 'description' => 'Meja, rak, dan furnitur operasional.'],
            ['code' => 'KAT-006', 'name' => 'Tekstil & Kain', 'description' => 'Kain industri, kanvas, dan serat.'],
            ['code' => 'KAT-007', 'name' => 'Perlengkapan Kantor', 'description' => 'Alat tulis dan kebutuhan administrasi.'],
            ['code' => 'KAT-008', 'name' => 'Genset & Daya', 'description' => 'Baterai, kabel, dan perangkat kelistrikan.'],
            ['code' => 'KAT-009', 'name' => 'Material Kayu', 'description' => 'Kayu olahan untuk konstruksi dan kemasan.'],
            ['code' => 'KAT-010', 'name' => 'Aksesoris Kendaraan', 'description' => 'Suku cadang dan aksesoris kendaraan.'],
            ['code' => 'KAT-011', 'name' => 'Alat Ukur', 'description' => 'Instrumen pengukuran presisi.'],
            ['code' => 'KAT-012', 'name' => 'Lubrikan & Pelumas', 'description' => 'Oli, grease, dan cairan pelumas.'],
            ['code' => 'KAT-013', 'name' => 'Pipa & Fitting', 'description' => 'Pipa, katup, dan konektor saluran.'],
            ['code' => 'KAT-014', 'name' => 'Produk Higienis', 'description' => 'APD dan perlengkapan kebersihan diri.'],
            ['code' => 'KAT-015', 'name' => 'Material Logam', 'description' => 'Pelat, batang, dan profil logam.'],
        ];

        foreach ($categories as $category) {
            Category::create($category);
        }
    }
}
