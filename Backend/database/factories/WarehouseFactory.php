<?php

namespace Database\Factories;

use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Warehouse>
 */
class WarehouseFactory extends Factory
{
    protected $model = Warehouse::class;

    public function definition(): array
    {
        return [
            'code' => 'GDG-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->city().' Warehouse',
            'city' => $this->faker->city(),
            'address' => $this->faker->streetAddress(),
            'is_active' => true,
        ];
    }
}
