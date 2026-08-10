<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WarehouseApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_index_returns_paginated_warehouses(): void
    {
        Warehouse::factory()->count(5)->create();

        $this->getJson('/api/master/warehouses')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_items(): void
    {
        $warehouse = Warehouse::factory()->create();
        Item::factory()->count(3)->create(['default_warehouse_id' => $warehouse->id]);

        $this->getJson('/api/master/warehouses')
            ->assertOk()
            ->assertJsonPath('data.0.item_count', 3);
    }

    public function test_index_can_search(): void
    {
        Warehouse::factory()->create(['name' => 'Gudang Bekasi']);
        Warehouse::factory()->count(3)->create();

        $this->getJson('/api/master/warehouses?search=bekasi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Gudang Bekasi');
    }

    public function test_can_store_warehouse(): void
    {
        $payload = [
            'code' => 'GDG-999',
            'name' => 'Gudang Tangerang',
            'city' => 'Tangerang',
        ];

        $this->postJson('/api/master/warehouses', $payload)
            ->assertCreated()
            ->assertJsonPath('data.code', 'GDG-999')
            ->assertJsonPath('data.name', 'Gudang Tangerang')
            ->assertJsonPath('data.city', 'Tangerang');

        $this->assertDatabaseHas('warehouses', ['code' => 'GDG-999']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/warehouses', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_can_update_warehouse(): void
    {
        $warehouse = Warehouse::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/warehouses/{$warehouse->id}", [
            'code' => $warehouse->code,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('warehouses', ['id' => $warehouse->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_warehouse_that_has_items(): void
    {
        $warehouse = Warehouse::factory()->create();
        Item::factory()->create(['default_warehouse_id' => $warehouse->id]);

        $this->deleteJson("/api/master/warehouses/{$warehouse->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('warehouses', ['id' => $warehouse->id]);
    }

    public function test_can_delete_empty_warehouse(): void
    {
        $warehouse = Warehouse::factory()->create();

        $this->deleteJson("/api/master/warehouses/{$warehouse->id}")
            ->assertOk();

        $this->assertDatabaseMissing('warehouses', ['id' => $warehouse->id]);
    }
}
