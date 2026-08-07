<?php

namespace Database\Factories;

use App\Models\Merk;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Merk>
 */
class MerkFactory extends Factory
{
    protected $model = Merk::class;

    public function definition(): array
    {
        return [
            'code' => 'MRK-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'country' => $this->faker->randomElement(['Indonesia', 'Jepang', 'Jerman', 'Tiongkok']),
            'is_active' => true,
        ];
    }
}
