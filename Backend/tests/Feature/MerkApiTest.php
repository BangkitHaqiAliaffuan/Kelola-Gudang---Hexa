<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Merk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MerkApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_index_returns_paginated_merks(): void
    {
        Merk::factory()->count(5)->create();

        $this->getJson('/api/master/merks')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_items(): void
    {
        $merk = Merk::factory()->create();
        Item::factory()->count(3)->create(['brand_id' => $merk->id]);

        $this->getJson('/api/master/merks')
            ->assertOk()
            ->assertJsonPath('data.0.item_count', 3);
    }

    public function test_index_can_search(): void
    {
        Merk::factory()->create(['name' => 'Nachi']);
        Merk::factory()->count(3)->create();

        $this->getJson('/api/master/merks?search=nachi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Nachi');
    }

    public function test_can_store_merk(): void
    {
        $payload = [
            'code' => 'MRK-999',
            'name' => 'Bosch',
            'country' => 'Jerman',
        ];

        $this->postJson('/api/master/merks', $payload)
            ->assertCreated()
            ->assertJsonPath('data.code', 'MRK-999')
            ->assertJsonPath('data.name', 'Bosch')
            ->assertJsonPath('data.country', 'Jerman');

        $this->assertDatabaseHas('merks', ['code' => 'MRK-999']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/merks', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/merks', ['name' => 'Nachi'])
            ->assertCreated()
            ->assertJsonPath('data.code', 'MRK-001');

        $this->postJson('/api/master/merks', ['name' => 'Bosch'])
            ->assertCreated()
            ->assertJsonPath('data.code', 'MRK-002');

        $this->assertDatabaseHas('merks', ['code' => 'MRK-001']);
        $this->assertDatabaseHas('merks', ['code' => 'MRK-002']);
    }

    public function test_can_update_merk(): void
    {
        $merk = Merk::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/merks/{$merk->id}", [
            'code' => $merk->code,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('merks', ['id' => $merk->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_merk_that_has_items(): void
    {
        $merk = Merk::factory()->create();
        Item::factory()->create(['brand_id' => $merk->id]);

        $this->deleteJson("/api/master/merks/{$merk->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('merks', ['id' => $merk->id]);
    }

    public function test_can_delete_empty_merk(): void
    {
        $merk = Merk::factory()->create();

        $this->deleteJson("/api/master/merks/{$merk->id}")
            ->assertOk();

        $this->assertDatabaseMissing('merks', ['id' => $merk->id]);
    }
}
