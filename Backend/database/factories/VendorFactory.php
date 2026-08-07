<?php

namespace Database\Factories;

use App\Models\Vendor;
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
            'service_type' => $this->faker->randomElement(['Ekspedisi', 'Maintenance', 'Kalibrasi', 'Cleaning']),
            'contact_phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'is_active' => true,
        ];
    }
}
