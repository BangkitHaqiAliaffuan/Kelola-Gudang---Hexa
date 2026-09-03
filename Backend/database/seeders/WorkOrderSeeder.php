<?php

namespace Database\Seeders;

use App\Models\Item;
use App\Models\Project;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Database\Seeder;

class WorkOrderSeeder extends Seeder
{
    public function run(): void
    {
        if (WorkOrder::where('no', 'WO/2026/0001')->exists()) {
            return;
        }

        $projects = Project::orderBy('id')->get();
        $items = Item::orderBy('id')->get();
        $units = Unit::orderBy('id')->get();
        $users = User::orderBy('id')->get();

        $statuses = ['Berjalan', 'Perencanaan', 'Selesai', 'Ditunda'];

        foreach (range(1, 24) as $i) {
            WorkOrder::create([
                'no' => 'WO/2026/'.str_pad((string) $i, 4, '0', STR_PAD_LEFT),
                'project_id' => $projects[($i - 1) % $projects->count()]->id,
                'item_id' => $items[($i - 1) % $items->count()]->id,
                'unit_id' => $units[($i - 1) % $units->count()]->id,
                'target_qty' => ($i + 1) * 25,
                'start_date' => sprintf('2026-%02d-%02d', (($i - 1) % 6) + 1, (($i - 1) % 27) + 1),
                'finish_date' => sprintf('2026-%02d-%02d', (($i - 1) % 6) + 2, (($i - 1) % 25) + 3),
                'pic_user_id' => $users[($i - 1) % $users->count()]->id,
                'status' => $statuses[($i - 1) % 4],
            ]);
        }
    }
}
