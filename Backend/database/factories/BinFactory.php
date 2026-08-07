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
        $level = str_pad((string) $this->faker->numberBetween(1, 3), 2, '0', STR_PAD_LEFT);
        $position = str_pad((string) $this->faker->unique()->numberBetween(1, 99), 2, '0', STR_PAD_LEFT);

        return [
            'rack_id' => Rack::factory(),
            'level' => $level,
            'position' => $position,
            'code' => "{$level}-{$position}",
            'name' => ucwords($this->faker->unique()->words(2, true)),
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
