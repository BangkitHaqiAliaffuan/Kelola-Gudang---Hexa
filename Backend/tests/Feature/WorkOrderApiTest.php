<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Project;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkOrderApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_index_returns_paginated_work_orders(): void
    {
        WorkOrder::factory()->count(5)->create();

        $this->getJson('/api/master/work-orders')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_resolves_relation_names(): void
    {
        $project = Project::factory()->create(['name' => 'Proyek Tol Cisumdawu']);
        $item = Item::factory()->create(['name' => 'Rakitan Panel Listrik']);
        $unit = Unit::factory()->create(['name' => 'PCS']);
        $pic = User::factory()->create(['name' => 'Siti Aminah']);

        WorkOrder::factory()->create([
            'project_id' => $project->id,
            'item_id' => $item->id,
            'unit_id' => $unit->id,
            'pic_user_id' => $pic->id,
        ]);

        $this->getJson('/api/master/work-orders')
            ->assertOk()
            ->assertJsonPath('data.0.project', 'Proyek Tol Cisumdawu')
            ->assertJsonPath('data.0.item', 'Rakitan Panel Listrik')
            ->assertJsonPath('data.0.unit', 'PCS')
            ->assertJsonPath('data.0.pic', 'Siti Aminah');
    }

    public function test_index_can_search(): void
    {
        WorkOrder::factory()->create(['no' => 'WO/2026/0001']);
        WorkOrder::factory()->count(3)->create();

        $this->getJson('/api/master/work-orders?search=WO/2026/0001')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.no', 'WO/2026/0001');
    }

    public function test_index_filters_by_status_and_project(): void
    {
        $project = Project::factory()->create();
        WorkOrder::factory()->count(2)->create(['project_id' => $project->id, 'status' => 'Berjalan']);
        WorkOrder::factory()->count(1)->create(['status' => 'Selesai']);

        $this->getJson("/api/master/work-orders?status=Berjalan&project_id={$project->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_can_store_work_order(): void
    {
        $project = Project::factory()->create();
        $item = Item::factory()->create();
        $unit = Unit::factory()->create();

        $this->postJson('/api/master/work-orders', [
            'no' => 'WO/2026/0999',
            'project_id' => $project->id,
            'item_id' => $item->id,
            'unit_id' => $unit->id,
            'target_qty' => 50,
            'status' => 'Perencanaan',
        ])->assertCreated()
            ->assertJsonPath('data.no', 'WO/2026/0999')
            ->assertJsonPath('data.target_qty', 50);

        $this->assertDatabaseHas('work_orders', ['no' => 'WO/2026/0999']);
    }

    public function test_store_auto_generates_no(): void
    {
        $project = Project::factory()->create();
        $item = Item::factory()->create();

        $this->postJson('/api/master/work-orders', [
            'project_id' => $project->id,
            'item_id' => $item->id,
            'target_qty' => 25,
        ])->assertCreated()
            ->assertJsonPath('data.no', 'WO/'.date('Y').'/0001');

        $this->assertDatabaseHas('work_orders', ['no' => 'WO/'.date('Y').'/0001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/work-orders', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['project_id', 'item_id', 'target_qty']);
    }

    public function test_store_rejects_invalid_foreign_keys(): void
    {
        $this->postJson('/api/master/work-orders', [
            'project_id' => 9999,
            'item_id' => 9999,
            'target_qty' => 25,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['project_id', 'item_id']);
    }

    public function test_store_rejects_invalid_status(): void
    {
        $project = Project::factory()->create();
        $item = Item::factory()->create();

        $this->postJson('/api/master/work-orders', [
            'project_id' => $project->id,
            'item_id' => $item->id,
            'target_qty' => 25,
            'status' => 'Salah',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);
    }

    public function test_can_show_work_order(): void
    {
        $workOrder = WorkOrder::factory()->create(['no' => 'WO/2026/0007']);

        $this->getJson("/api/master/work-orders/{$workOrder->id}")
            ->assertOk()
            ->assertJsonPath('data.no', 'WO/2026/0007');
    }

    public function test_can_update_work_order(): void
    {
        $workOrder = WorkOrder::factory()->create();

        $this->putJson("/api/master/work-orders/{$workOrder->id}", [
            'project_id' => $workOrder->project_id,
            'item_id' => $workOrder->item_id,
            'target_qty' => 99,
            'status' => 'Selesai',
        ])->assertOk()
            ->assertJsonPath('data.target_qty', 99)
            ->assertJsonPath('data.status', 'Selesai');

        $this->assertDatabaseHas('work_orders', ['id' => $workOrder->id, 'status' => 'Selesai']);
    }

    public function test_can_delete_work_order(): void
    {
        $workOrder = WorkOrder::factory()->create();

        $this->deleteJson("/api/master/work-orders/{$workOrder->id}")
            ->assertOk();

        $this->assertDatabaseMissing('work_orders', ['id' => $workOrder->id]);
    }
}
