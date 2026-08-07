<?php

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'code' => 'CUS-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'address' => $this->faker->streetAddress(),
            'city' => $this->faker->city(),
            'segment' => $this->faker->randomElement(['Retail', 'Distributor', 'Proyek', 'Korporat']),
            'is_active' => true,
        ];
    }
}
