<?php

namespace Database\Factories;

use App\Models\Supplier;
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
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'address' => $this->faker->streetAddress(),
            'city' => $this->faker->city(),
            'tax_id' => (string) $this->faker->unique()->numberBetween(1000000000000, 9999999999999),
            'payment_terms' => $this->faker->randomElement(['NET 30', 'NET 14', 'COD', 'NET 45']),
            'is_active' => true,
        ];
    }
}
