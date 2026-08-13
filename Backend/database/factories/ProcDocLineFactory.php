<?php

namespace Database\Factories;

use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\ProcDocLine;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProcDocLine>
 */
class ProcDocLineFactory extends Factory
{
    protected $model = ProcDocLine::class;

    public function definition(): array
    {
        return [
            'proc_doc_id' => ProcDoc::factory(),
            'line_no' => 1,
            'item_id' => Item::factory(),
            'qty' => $this->faker->numberBetween(5, 250),
            'unit_id' => null,
            'price' => $this->faker->randomFloat(2, 500, 500000),
        ];
    }
}
