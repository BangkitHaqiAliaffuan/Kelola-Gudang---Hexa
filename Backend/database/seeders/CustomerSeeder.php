<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Support\Npwp;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['name' => 'Toko Sinar Terang', 'city' => 'Jakarta Barat', 'segment' => 'Retail'],
            ['name' => 'CV Maju Bersama', 'city' => 'Surabaya', 'segment' => 'Distributor'],
            ['name' => 'PT Bangun Karya Utama', 'city' => 'Bandung', 'segment' => 'Proyek'],
            ['name' => 'PT Indogrosir Sentosa', 'city' => 'Bekasi', 'segment' => 'Korporat'],
            ['name' => 'Toko Kembar Jaya', 'city' => 'Semarang', 'segment' => 'Retail'],
            ['name' => 'PT Sinar Perkasa Group', 'city' => 'Jakarta Timur', 'segment' => 'Korporat'],
            ['name' => 'CV Niaga Berkah', 'city' => 'Medan', 'segment' => 'Distributor'],
            ['name' => 'Toko Baru Elektronik', 'city' => 'Makassar', 'segment' => 'Retail'],
            ['name' => 'PT Multi Konstruksi', 'city' => 'Jakarta Selatan', 'segment' => 'Proyek'],
            ['name' => 'CV Andalan Jaya', 'city' => 'Tangerang', 'segment' => 'Distributor'],
            ['name' => 'Toko Murni Sejahtera', 'city' => 'Yogyakarta', 'segment' => 'Retail'],
            ['name' => 'PT Cipta Sarana Bangun', 'city' => 'Bogor', 'segment' => 'Proyek'],
            ['name' => 'CV Trans Retail Abadi', 'city' => 'Depok', 'segment' => 'Distributor'],
            ['name' => 'Toko Asia Motor', 'city' => 'Palembang', 'segment' => 'Retail'],
            ['name' => 'PT Graha Primatama', 'city' => 'Batam', 'segment' => 'Korporat'],
            ['name' => 'Toko Santosa', 'city' => 'Denpasar', 'segment' => 'Retail'],
        ];

        $i = 1;
        foreach ($customers as $customer) {
            Customer::create([
                'code' => 'CUS-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT),
                'name' => $customer['name'],
                'legal_name' => $customer['name'],
                'nib' => '9121'.str_pad((string) $i, 9, '0', STR_PAD_LEFT),
                'npwp' => Npwp::generate(),
                'phone' => '021-'.(string) (7700000 + $i * 119),
                'email' => 'sales@customer'.$i.'.co.id',
                'pic_name' => ['Agus Salim', 'Bayu Pratama', 'Dewi Lestari'][($i - 1) % 3],
                'website' => 'https://customer'.$i.'.co.id',
                'address' => 'Jl. Pasar Raya No. '.$i,
                'city' => $customer['city'],
                'segment' => $customer['segment'],
                'bank_name' => ['BCA', 'Mandiri', 'BNI', 'BRI'][($i - 1) % 4],
                'bank_account_no' => (string) (2000000000 + $i * 17231),
                'bank_account_name' => $customer['name'],
                'is_active' => true,
            ]);
            $i++;
        }
    }
}
