<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BinApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_bins(): void
    {
        Bin::factory()->count(5)->create();

        $this->getJson('/api/master/bins')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_items(): void
    {
        $bin = Bin::factory()->create();
        Item::factory()->count(3)->create(['default_bin_id' => $bin->id]);

        $this->getJson('/api/master/bins')
            ->assertOk()
            ->assertJsonPath('data.0.item_count', 3);
    }

    public function test_index_filters_by_rack(): void
    {
        $rack = Rack::factory()->create();
        Bin::factory()->count(2)->create(['rack_id' => $rack->id]);
        Bin::factory()->count(3)->create();

        $this->getJson("/api/master/bins?rack_id={$rack->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_index_can_search(): void
    {
        Bin::factory()->create(['name' => 'Bin Khusus']);
        Bin::factory()->count(3)->create();

        $this->getJson('/api/master/bins?search=khusus')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Bin Khusus');
    }

    public function test_can_store_bin(): void
    {
        $rack = Rack::factory()->create();

        $this->postJson('/api/master/bins', [
            'rack_id' => $rack->id,
            'code' => 'BIN-999',
            'name' => 'Bin Rak A',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'BIN-999')
            ->assertJsonPath('data.name', 'Bin Rak A')
            ->assertJsonPath('data.rack_name', $rack->name);

        $this->assertDatabaseHas('bins', ['code' => 'BIN-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $rack = Rack::factory()->create();

        $this->postJson('/api/master/bins', [
            'rack_id' => $rack->id,
            'name' => 'Bin Otomatis',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'BIN-001');

        $this->assertDatabaseHas('bins', ['code' => 'BIN-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/bins', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'rack_id']);
    }

    public function test_can_update_bin(): void
    {
        $bin = Bin::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/bins/{$bin->id}", [
            'rack_id' => $bin->rack_id,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('bins', ['id' => $bin->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_bin_that_has_items(): void
    {
        $bin = Bin::factory()->create();
        Item::factory()->create(['default_bin_id' => $bin->id]);

        $this->deleteJson("/api/master/bins/{$bin->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('bins', ['id' => $bin->id]);
    }

    public function test_can_delete_empty_bin(): void
    {
        $bin = Bin::factory()->create();

        $this->deleteJson("/api/master/bins/{$bin->id}")
            ->assertOk();

        $this->assertDatabaseMissing('bins', ['id' => $bin->id]);
    }
}
