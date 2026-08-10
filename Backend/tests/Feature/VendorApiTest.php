<?php

namespace Tests\Feature;

use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VendorApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_index_returns_paginated_vendors(): void
    {
        Vendor::factory()->count(5)->create();

        $this->getJson('/api/master/vendors')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_can_search(): void
    {
        Vendor::factory()->create(['name' => 'JNE Cabang Pusat']);
        Vendor::factory()->count(3)->create();

        $this->getJson('/api/master/vendors?search=jne')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'JNE Cabang Pusat');
    }

    public function test_can_store_vendor(): void
    {
        $this->postJson('/api/master/vendors', [
            'code' => 'VDR-999',
            'name' => 'PT Kirim Cepat',
            'service_type' => 'Ekspedisi',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'VDR-999')
            ->assertJsonPath('data.name', 'PT Kirim Cepat')
            ->assertJsonPath('data.service_type', 'Ekspedisi');

        $this->assertDatabaseHas('vendors', ['code' => 'VDR-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/vendors', [
            'name' => 'Vendor Otomatis Kode',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'VDR-001');

        $this->assertDatabaseHas('vendors', ['code' => 'VDR-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/vendors', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_invalid_service_type(): void
    {
        $this->postJson('/api/master/vendors', [
            'name' => 'Vendor Layanan Salah',
            'service_type' => 'Hacker',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['service_type']);
    }

    public function test_store_accepts_valid_npwp(): void
    {
        $this->postJson('/api/master/vendors', [
            'name' => 'Vendor NPWP Valid',
            'npwp' => '016090524017000',
        ])->assertCreated()
            ->assertJsonPath('data.npwp', '016090524017000');
    }

    public function test_store_rejects_invalid_npwp(): void
    {
        $this->postJson('/api/master/vendors', [
            'name' => 'Vendor NPWP Invalid',
            'npwp' => '999999999999999',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['npwp']);
    }

    public function test_store_rejects_invalid_nib(): void
    {
        $this->postJson('/api/master/vendors', [
            'name' => 'Vendor NIB Invalid',
            'nib' => 'abc',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['nib']);
    }

    public function test_can_show_vendor(): void
    {
        $vendor = Vendor::factory()->create(['name' => 'Vendor Tampil']);

        $this->getJson("/api/master/vendors/{$vendor->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $vendor->id)
            ->assertJsonPath('data.name', 'Vendor Tampil');
    }

    public function test_can_update_vendor(): void
    {
        $vendor = Vendor::factory()->create(['name' => 'Vendor Lama']);

        $this->putJson("/api/master/vendors/{$vendor->id}", [
            'name' => 'Vendor Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Vendor Baru');

        $this->assertDatabaseHas('vendors', ['id' => $vendor->id, 'name' => 'Vendor Baru']);
    }

    public function test_can_delete_vendor(): void
    {
        $vendor = Vendor::factory()->create();

        $this->deleteJson("/api/master/vendors/{$vendor->id}")
            ->assertOk();

        $this->assertDatabaseMissing('vendors', ['id' => $vendor->id]);
    }
}
