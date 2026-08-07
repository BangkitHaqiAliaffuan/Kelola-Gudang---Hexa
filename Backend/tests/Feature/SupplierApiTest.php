<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_suppliers(): void
    {
        Supplier::factory()->count(5)->create();

        $this->getJson('/api/master/suppliers')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_items(): void
    {
        $supplier = Supplier::factory()->create();
        Item::factory()->count(3)->create(['preferred_supplier_id' => $supplier->id]);

        $this->getJson('/api/master/suppliers')
            ->assertOk()
            ->assertJsonPath('data.0.items_count', 3);
    }

    public function test_index_can_search(): void
    {
        Supplier::factory()->create(['name' => 'PT Sumber Makmur']);
        Supplier::factory()->count(3)->create();

        $this->getJson('/api/master/suppliers?search=makmur')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'PT Sumber Makmur');
    }

    public function test_can_store_supplier(): void
    {
        $this->postJson('/api/master/suppliers', [
            'code' => 'SUP-999',
            'name' => 'PT Sejahtera Abadi',
            'city' => 'Jakarta',
            'payment_terms' => 'NET 30',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'SUP-999')
            ->assertJsonPath('data.name', 'PT Sejahtera Abadi')
            ->assertJsonPath('data.payment_terms', 'NET 30');

        $this->assertDatabaseHas('suppliers', ['code' => 'SUP-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT Otomatis Kode',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'SUP-001');

        $this->assertDatabaseHas('suppliers', ['code' => 'SUP-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/suppliers', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_duplicate_name(): void
    {
        Supplier::factory()->create(['name' => 'PT Sama']);

        $this->postJson('/api/master/suppliers', ['name' => 'PT Sama'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_invalid_payment_terms(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT Term Salah',
            'payment_terms' => 'NANTI',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['payment_terms']);
    }

    public function test_can_show_supplier(): void
    {
        $supplier = Supplier::factory()->create(['name' => 'PT Tampil']);

        $this->getJson("/api/master/suppliers/{$supplier->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $supplier->id)
            ->assertJsonPath('data.name', 'PT Tampil');
    }

    public function test_can_update_supplier(): void
    {
        $supplier = Supplier::factory()->create(['name' => 'PT Lama']);

        $this->putJson("/api/master/suppliers/{$supplier->id}", [
            'name' => 'PT Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'PT Baru');

        $this->assertDatabaseHas('suppliers', ['id' => $supplier->id, 'name' => 'PT Baru']);
    }

    public function test_cannot_delete_supplier_that_has_items(): void
    {
        $supplier = Supplier::factory()->create();
        Item::factory()->create(['preferred_supplier_id' => $supplier->id]);

        $this->deleteJson("/api/master/suppliers/{$supplier->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('suppliers', ['id' => $supplier->id]);
    }

    public function test_can_delete_empty_supplier(): void
    {
        $supplier = Supplier::factory()->create();

        $this->deleteJson("/api/master/suppliers/{$supplier->id}")
            ->assertOk();

        $this->assertDatabaseMissing('suppliers', ['id' => $supplier->id]);
    }
}
