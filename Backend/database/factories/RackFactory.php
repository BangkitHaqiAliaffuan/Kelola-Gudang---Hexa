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
        $aisle = strtoupper($this->faker->randomElement(['A', 'B', 'C', 'D']));
        $bay = str_pad((string) $this->faker->unique()->numberBetween(1, 99), 2, '0', STR_PAD_LEFT);
        $code = "{$aisle}-{$bay}";

        return [
            'warehouse_id' => Warehouse::factory(),
            'aisle' => $aisle,
            'bay' => $bay,
            'code' => $code,
            'name' => "Rak {$code}",
            'is_active' => $this->faker->boolean(90),
        ];
    }
}
