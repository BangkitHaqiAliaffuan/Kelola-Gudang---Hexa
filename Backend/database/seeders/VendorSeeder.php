<?php

namespace Database\Seeders;

use App\Models\Vendor;
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
                'service_type' => $vendor['service_type'],
                'contact_phone' => '021-'.(string) (8800000 + $i * 211),
                'email' => 'cs@vendor'.$i.'.co.id',
                'is_active' => true,
            ]);
            $i++;
        }
    }
}
