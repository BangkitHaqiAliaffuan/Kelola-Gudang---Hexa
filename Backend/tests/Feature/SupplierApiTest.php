<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

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

    public function test_store_accepts_valid_npwp(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT NPWP Valid',
            'npwp' => '016090524017000',
        ])->assertCreated()
            ->assertJsonPath('data.npwp', '016090524017000');
    }

    public function test_store_rejects_invalid_npwp(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT NPWP Invalid',
            'npwp' => '999999999999999',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['npwp']);
    }

    public function test_store_rejects_invalid_nib(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT NIB Invalid',
            'nib' => '1234',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['nib']);
    }

    public function test_store_persists_detail_pt_fields(): void
    {
        $this->postJson('/api/master/suppliers', [
            'name' => 'PT Detail Sempurna',
            'legal_name' => 'PT Detail Sempurna Legal',
            'nib' => '9120000000001',
            'npwp' => '016090524017000',
            'pic_name' => 'Dewi Lestari',
            'website' => 'https://sempurna.co.id',
            'bank_name' => 'BCA',
            'bank_account_no' => '1234567890',
            'bank_account_name' => 'PT Detail Sempurna Legal',
        ])->assertCreated()
            ->assertJsonPath('data.legal_name', 'PT Detail Sempurna Legal')
            ->assertJsonPath('data.nib', '9120000000001')
            ->assertJsonPath('data.npwp', '016090524017000')
            ->assertJsonPath('data.pic_name', 'Dewi Lestari')
            ->assertJsonPath('data.website', 'https://sempurna.co.id')
            ->assertJsonPath('data.bank_name', 'BCA')
            ->assertJsonPath('data.bank_account_no', '1234567890')
            ->assertJsonPath('data.bank_account_name', 'PT Detail Sempurna Legal');
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
