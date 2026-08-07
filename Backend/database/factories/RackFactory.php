<?php

namespace Database\Factories;

use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Rack>
 */
class RackFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'warehouse_id' => Warehouse::factory(),
            'code' => 'RAK-'.$this->faker->unique()->numberBetween(100, 999),
            'name' => ucwords($this->faker->unique()->words(2, true)),
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
