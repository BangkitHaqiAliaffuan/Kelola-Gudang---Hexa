<?php

namespace Database\Factories;

use App\Models\Supplier;
use App\Support\Npwp;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Supplier>
 */
class SupplierFactory extends Factory
{
    protected $model = Supplier::class;

    public function definition(): array
    {
        return [
            'code' => 'SUP-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'legal_name' => $this->faker->company(),
            'nib' => $this->faker->unique()->numerify('#############'),
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'pic_name' => $this->faker->name(),
            'website' => 'https://'.$this->faker->domainName(),
            'address' => $this->faker->streetAddress(),
            'city' => $this->faker->city(),
            'npwp' => Npwp::generate(),
            'payment_terms' => $this->faker->randomElement(['NET 30', 'NET 14', 'COD', 'NET 45']),
            'bank_name' => $this->faker->randomElement(['BCA', 'Mandiri', 'BNI', 'BRI']),
            'bank_account_no' => (string) $this->faker->unique()->numberBetween(1000000000, 9999999999),
            'bank_account_name' => $this->faker->company(),
            'is_active' => true,
        ];
    }
}
