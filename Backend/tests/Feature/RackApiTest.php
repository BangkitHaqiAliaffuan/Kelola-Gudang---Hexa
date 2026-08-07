<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RackApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_racks(): void
    {
        Rack::factory()->count(5)->create();

        $this->getJson('/api/master/racks')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_bins(): void
    {
        $rack = Rack::factory()->create();
        Bin::factory()->count(3)->create(['rack_id' => $rack->id]);

        $this->getJson('/api/master/racks')
            ->assertOk()
            ->assertJsonPath('data.0.bin_count', 3);
    }

    public function test_index_filters_by_warehouse(): void
    {
        $warehouse = Warehouse::factory()->create();
        Rack::factory()->count(2)->create(['warehouse_id' => $warehouse->id]);
        Rack::factory()->count(3)->create();

        $this->getJson("/api/master/racks?warehouse_id={$warehouse->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_index_can_search(): void
    {
        Rack::factory()->create(['name' => 'Rak Elektronik']);
        Rack::factory()->count(3)->create();

        $this->getJson('/api/master/racks?search=elektronik')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Rak Elektronik');
    }

    public function test_can_store_rack(): void
    {
        $warehouse = Warehouse::factory()->create();

        $this->postJson('/api/master/racks', [
            'warehouse_id' => $warehouse->id,
            'code' => 'RAK-999',
            'name' => 'Rak Gudang A',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'RAK-999')
            ->assertJsonPath('data.name', 'Rak Gudang A')
            ->assertJsonPath('data.warehouse_name', $warehouse->name);

        $this->assertDatabaseHas('racks', ['code' => 'RAK-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $warehouse = Warehouse::factory()->create();

        $this->postJson('/api/master/racks', [
            'warehouse_id' => $warehouse->id,
            'name' => 'Rak Otomatis',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'RAK-001');

        $this->assertDatabaseHas('racks', ['code' => 'RAK-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/racks', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'warehouse_id']);
    }

    public function test_can_update_rack(): void
    {
        $rack = Rack::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/racks/{$rack->id}", [
            'warehouse_id' => $rack->warehouse_id,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('racks', ['id' => $rack->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_rack_that_has_bins(): void
    {
        $rack = Rack::factory()->create();
        Bin::factory()->create(['rack_id' => $rack->id]);

        $this->deleteJson("/api/master/racks/{$rack->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('racks', ['id' => $rack->id]);
    }

    public function test_cannot_delete_rack_that_has_items(): void
    {
        $warehouse = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $warehouse->id]);
        Item::factory()->create([
            'default_warehouse_id' => $warehouse->id,
            'default_rack_id' => $rack->id,
        ]);

        $this->deleteJson("/api/master/racks/{$rack->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('racks', ['id' => $rack->id]);
    }

    public function test_can_delete_empty_rack(): void
    {
        $rack = Rack::factory()->create();

        $this->deleteJson("/api/master/racks/{$rack->id}")
            ->assertOk();

        $this->assertDatabaseMissing('racks', ['id' => $rack->id]);
    }
}
