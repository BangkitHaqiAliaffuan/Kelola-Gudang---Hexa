<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Department>
 */
class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    public function definition(): array
    {
        return [
            'code' => 'DEP-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'head_user_id' => User::factory()->state(fn () => ['role' => fake()->randomElement(['Supervisor', 'Operator Gudang', 'Auditor'])]),
            'is_active' => true,
        ];
    }
}
