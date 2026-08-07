<?php

namespace Database\Factories;

use App\Models\Item;
use App\Models\Project;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkOrder>
 */
class WorkOrderFactory extends Factory
{
    protected $model = WorkOrder::class;

    public function definition(): array
    {
        return [
            'no' => 'WO-'.$this->faker->unique()->numberBetween(1000, 9999),
            'project_id' => Project::factory(),
            'item_id' => Item::factory(),
            'unit_id' => Unit::factory(),
            'target_qty' => $this->faker->numberBetween(1, 500),
            'start_date' => $this->faker->date(),
            'finish_date' => $this->faker->date(),
            'pic_user_id' => User::factory(),
            'status' => $this->faker->randomElement(['Perencanaan', 'Berjalan', 'Selesai', 'Ditunda']),
        ];
    }
}
