<?php

namespace Database\Factories;

use App\Models\Bin;
use App\Models\Rack;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Bin>
 */
class BinFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'rack_id' => Rack::factory(),
            'code' => 'BIN-'.$this->faker->unique()->numberBetween(100, 999),
            'name' => ucwords($this->faker->unique()->words(2, true)),
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
