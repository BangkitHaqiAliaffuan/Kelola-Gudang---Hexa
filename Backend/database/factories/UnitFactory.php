<?php

namespace Database\Factories;

use App\Models\Unit;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Unit>
 */
class UnitFactory extends Factory
{
    protected $model = Unit::class;

    public function definition(): array
    {
        return [
            'code' => 'UNT-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => strtoupper($this->faker->unique()->word()),
            'is_active' => true,
        ];
    }
}
