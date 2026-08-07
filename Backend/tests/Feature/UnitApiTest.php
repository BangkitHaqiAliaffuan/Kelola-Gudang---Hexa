<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Unit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UnitApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_units(): void
    {
        Unit::factory()->count(5)->create();

        $this->getJson('/api/master/units')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_items(): void
    {
        $unit = Unit::factory()->create();
        Item::factory()->count(3)->create(['unit_id' => $unit->id]);

        $this->getJson('/api/master/units')
            ->assertOk()
            ->assertJsonPath('data.0.item_count', 3);
    }

    public function test_index_can_search(): void
    {
        Unit::factory()->create(['name' => 'PCS']);
        Unit::factory()->count(3)->create();

        $this->getJson('/api/master/units?search=pcs')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'PCS');
    }

    public function test_can_store_unit(): void
    {
        $payload = [
            'code' => 'UNT-999',
            'name' => 'KARTON',
        ];

        $this->postJson('/api/master/units', $payload)
            ->assertCreated()
            ->assertJsonPath('data.code', 'UNT-999')
            ->assertJsonPath('data.name', 'KARTON');

        $this->assertDatabaseHas('units', ['code' => 'UNT-999']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/units', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_can_update_unit(): void
    {
        $unit = Unit::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/units/{$unit->id}", [
            'code' => $unit->code,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('units', ['id' => $unit->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_unit_that_has_items(): void
    {
        $unit = Unit::factory()->create();
        Item::factory()->create(['unit_id' => $unit->id]);

        $this->deleteJson("/api/master/units/{$unit->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('units', ['id' => $unit->id]);
    }

    public function test_can_delete_empty_unit(): void
    {
        $unit = Unit::factory()->create();

        $this->deleteJson("/api/master/units/{$unit->id}")
            ->assertOk();

        $this->assertDatabaseMissing('units', ['id' => $unit->id]);
    }
}
