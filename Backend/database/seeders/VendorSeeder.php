<?php

namespace Database\Seeders;

use App\Models\Vendor;
use App\Support\Npwp;
use Illuminate\Database\Seeder;

class VendorSeeder extends Seeder
{
    public function run(): void
    {
        $vendors = [
            ['name' => 'JNE Cabang Pusat', 'service_type' => 'Ekspedisi'],
            ['name' => 'PT SiCepat Express', 'service_type' => 'Ekspedisi'],
            ['name' => 'PT Anugrah Servis Teknik', 'service_type' => 'Maintenance'],
            ['name' => 'CV Presisi Kalibrasi', 'service_type' => 'Kalibrasi'],
            ['name' => 'PT Nusantara Cleaning Service', 'service_type' => 'Cleaning'],
            ['name' => 'TIKI Kargo Indonesia', 'service_type' => 'Ekspedisi'],
            ['name' => 'CV Sumber Teknik Maintenance', 'service_type' => 'Maintenance'],
            ['name' => 'PT Verifikasi Alat Ukur', 'service_type' => 'Kalibrasi'],
        ];

        $i = 1;
        foreach ($vendors as $vendor) {
            Vendor::create([
                'code' => 'VDR-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT),
                'name' => $vendor['name'],
                'legal_name' => $vendor['name'],
                'nib' => '9122'.str_pad((string) $i, 9, '0', STR_PAD_LEFT),
                'npwp' => Npwp::generate(),
                'service_type' => $vendor['service_type'],
                'contact_phone' => '021-'.(string) (8800000 + $i * 211),
                'email' => 'cs@vendor'.$i.'.co.id',
                'pic_name' => ['Agus Salim', 'Bayu Pratama', 'Dewi Lestari'][($i - 1) % 3],
                'website' => 'https://vendor'.$i.'.co.id',
                'bank_name' => ['BCA', 'Mandiri', 'BNI', 'BRI'][($i - 1) % 4],
                'bank_account_no' => (string) (3000000000 + $i * 19141),
                'bank_account_name' => $vendor['name'],
                'is_active' => true,
            ]);
            $i++;
        }
    }
}
