<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\SubCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SubCategory>
 */
class SubCategoryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'category_id' => Category::factory(),
            'code' => 'SUB-'.$this->faker->unique()->numberBetween(100, 999),
            'name' => ucwords($this->faker->unique()->words(2, true)),
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
