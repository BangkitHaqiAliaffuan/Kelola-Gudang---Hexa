<?php

namespace Database\Seeders;

use App\Models\Supplier;
use App\Support\Npwp;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            ['name' => 'PT Sumber Makmur Sentosa', 'city' => 'Jakarta Timur', 'payment_terms' => 'NET 30', 'verified' => true],
            ['name' => 'CV Elektronik Nusantara', 'city' => 'Surabaya', 'payment_terms' => 'NET 14'],
            ['name' => 'PT Indochem Distributor', 'city' => 'Bekasi', 'payment_terms' => 'NET 30'],
            ['name' => 'PT Teknik Prima Perkasa', 'city' => 'Bandung', 'payment_terms' => 'NET 45', 'verified' => true],
            ['name' => 'CV Sinar Logistik', 'city' => 'Semarang', 'payment_terms' => 'COD'],
            ['name' => 'PT Anugerah Karya Abadi', 'city' => 'Medan', 'payment_terms' => 'NET 30'],
            ['name' => 'PT Citra Bangun Mandiri', 'city' => 'Makassar', 'payment_terms' => 'NET 14', 'verified' => true],
            ['name' => 'CV Alat Ukur Jaya', 'city' => 'Jakarta Pusat', 'payment_terms' => 'COD'],
            ['name' => 'PT Fajar Sentosa Jaya', 'city' => 'Jakarta Barat', 'payment_terms' => 'NET 30'],
            ['name' => 'CV Mitra Bahari', 'city' => 'Tangerang', 'payment_terms' => 'NET 45'],
            ['name' => 'PT Raja Material Indonesia', 'city' => 'Jakarta Selatan', 'payment_terms' => 'NET 30', 'verified' => true],
            ['name' => 'CV Putra Mandiri Sejahtera', 'city' => 'Bogor', 'payment_terms' => 'NET 14'],
            ['name' => 'PT Graha Suplai Nusantara', 'city' => 'Yogyakarta', 'payment_terms' => 'NET 30'],
            ['name' => 'CV Karya Logam Utama', 'city' => 'Surakarta', 'payment_terms' => 'COD'],
            ['name' => 'PT Delta Teknindo', 'city' => 'Balikpapan', 'payment_terms' => 'NET 45'],
            ['name' => 'CV Sumber Rejeki', 'city' => 'Palembang', 'payment_terms' => 'NET 30'],
            ['name' => 'PT Berkah Distribusi', 'city' => 'Batam', 'payment_terms' => 'NET 14'],
            ['name' => 'CV Global Sarana', 'city' => 'Depok', 'payment_terms' => 'COD'],
            ['name' => 'PT Nusantara Sakti', 'city' => 'Denpasar', 'payment_terms' => 'NET 30'],
            ['name' => 'CV Aman Sentosa', 'city' => 'Banjarmasin', 'payment_terms' => 'NET 45'],
        ];

        $i = 1;
        foreach ($suppliers as $supplier) {
            Supplier::create([
                'code' => 'SUP-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT),
                'name' => $supplier['name'],
                'legal_name' => $supplier['name'],
                'nib' => '9120'.str_pad((string) $i, 9, '0', STR_PAD_LEFT),
                'phone' => '021-'.(string) (5500000 + $i * 137),
                'email' => 'kontak@supplier'.$i.'.co.id',
                'pic_name' => ['Agus Salim', 'Bayu Pratama', 'Dewi Lestari'][($i - 1) % 3],
                'website' => 'https://supplier'.$i.'.co.id',
                'address' => 'Jl. Raya Industri No. '.$i,
                'city' => $supplier['city'],
                'npwp' => Npwp::generate(),
                'payment_terms' => $supplier['payment_terms'],
                'bank_name' => ['BCA', 'Mandiri', 'BNI', 'BRI'][($i - 1) % 4],
                'bank_account_no' => (string) (1000000000 + $i * 13717),
                'bank_account_name' => $supplier['name'],
                'verification_status' => ($supplier['verified'] ?? false) ? 'verified' : 'unverified',
                'verification_note' => ($supplier['verified'] ?? false) ? 'Dokumen lengkap sesuai hasil cek' : null,
                'verified_at' => ($supplier['verified'] ?? false) ? now() : null,
                'is_active' => true,
            ]);
            $i++;
        }
    }
}
