<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => 'KAT-'.$this->faker->unique()->numberBetween(100, 999),
            'name' => ucwords($this->faker->unique()->words(2, true)),
            'description' => $this->faker->sentence(4),
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
