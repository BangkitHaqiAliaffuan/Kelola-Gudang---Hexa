<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\SubCategory;
use Illuminate\Database\Seeder;

class SubCategorySeeder extends Seeder
{
    public function run(): void
    {
        $subCategories = [
            'Komponen Elektronik' => ['Sirkuit', 'Sensor', 'Catu Daya', 'Modul Kontrol'],
            'Perkakas Mesin' => ['Mata Bor', 'Gerinda', 'Perkakas Tangan'],
            'Bahan Kimia' => ['Pelarut', 'Aditif', 'Lem & Perekat'],
            'Perlengkapan Kebersihan' => ['Kain Lap', 'Alat Pel', 'Cairan Pembersih'],
            'Furnitur & Interior' => ['Meja Kerja', 'Rak Penyimpanan', 'Kursi'],
            'Tekstil & Kain' => ['Kanvas', 'Serat', 'Geotextile'],
            'Perlengkapan Kantor' => ['Alat Tulis', 'Dokumen', 'Percetakan'],
            'Genset & Daya' => ['Baterai', 'Kabel Listrik', 'Stop Kontak'],
            'Material Kayu' => ['Papan', 'Triplek', 'Balok'],
            'Aksesoris Kendaraan' => ['Filter', 'Ban Dalam', 'Aki'],
            'Alat Ukur' => ['Multimeter', 'Jangka Sorong', 'Meteran'],
            'Lubrikan & Pelumas' => ['Oli', 'Grease', 'Aditif Mesin'],
            'Pipa & Fitting' => ['Katup', 'Flange', 'Konektor'],
            'Produk Higienis' => ['Sarung Tangan', 'Masker', 'Pembersih Tangan'],
            'Material Logam' => ['Pelat', 'Batang', 'Profil'],
        ];

        $index = 1;
        foreach ($subCategories as $categoryName => $names) {
            $category = Category::where('name', $categoryName)->firstOrFail();

            foreach ($names as $name) {
                SubCategory::create([
                    'category_id' => $category->id,
                    'code' => 'SUB-'.str_pad((string) $index++, 3, '0', STR_PAD_LEFT),
                    'name' => $name,
                ]);
            }
        }
    }
}
