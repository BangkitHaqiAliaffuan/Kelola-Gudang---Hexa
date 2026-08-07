<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Item;
use App\Models\Merk;
use App\Models\SubCategory;
use App\Models\Unit;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'sku' => 'SKU-'.$this->faker->unique()->numberBetween(10000, 99999).'-001',
            'barcode' => $this->faker->unique()->numerify('899##########'),
            'internal_barcode' => 'IB-'.$this->faker->unique()->numerify('####'),
            'name' => ucwords($this->faker->unique()->words(3, true)),
            'category_id' => Category::factory(),
            'sub_category_id' => SubCategory::factory(),
            'brand_id' => Merk::factory(),
            'unit_id' => Unit::factory(),
            'preferred_supplier_id' => null,
            'default_warehouse_id' => Warehouse::factory(),
            'default_rack_id' => null,
            'default_bin_id' => null,
            'weight' => $this->faker->randomFloat(2, 0.05, 50),
            'dimension' => $this->faker->optional()->numerify('##x##x## cm'),
            'cost' => $this->faker->randomFloat(2, 1000, 500000),
            'price' => fn (array $attrs) => round($attrs['cost'] * $this->faker->randomFloat(2, 1.1, 1.6), 2),
            'min_stock' => $this->faker->numberBetween(1, 50),
            'max_stock' => $this->faker->numberBetween(100, 5000),
            'lead_time' => $this->faker->numberBetween(1, 21),
            'stock' => $this->faker->numberBetween(0, 2000),
            'reserved' => fn (array $attrs) => $this->faker->numberBetween(0, (int) $attrs['stock']),
            'status' => $this->faker->randomElement(['Aktif', 'Nonaktif']),
            'image_url' => null,
        ];
    }
}
