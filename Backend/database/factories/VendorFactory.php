<?php

namespace Database\Factories;

use App\Models\Vendor;
use App\Support\Npwp;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Vendor>
 */
class VendorFactory extends Factory
{
    protected $model = Vendor::class;

    public function definition(): array
    {
        return [
            'code' => 'VDR-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'legal_name' => $this->faker->company(),
            'nib' => $this->faker->unique()->numerify('#############'),
            'npwp' => Npwp::generate(),
            'service_type' => $this->faker->randomElement(['Ekspedisi', 'Maintenance', 'Kalibrasi', 'Cleaning']),
            'contact_phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'pic_name' => $this->faker->name(),
            'website' => 'https://'.$this->faker->domainName(),
            'bank_name' => $this->faker->randomElement(['BCA', 'Mandiri', 'BNI', 'BRI']),
            'bank_account_no' => (string) $this->faker->unique()->numberBetween(1000000000, 9999999999),
            'bank_account_name' => $this->faker->company(),
            'verification_status' => 'unverified',
            'verification_note' => null,
            'is_active' => true,
        ];
    }
}
