<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_customers(): void
    {
        Customer::factory()->count(5)->create();

        $this->getJson('/api/master/customers')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_can_search(): void
    {
        Customer::factory()->create(['name' => 'Toko Sinar Terang']);
        Customer::factory()->count(3)->create();

        $this->getJson('/api/master/customers?search=sinar')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Toko Sinar Terang');
    }

    public function test_can_store_customer(): void
    {
        $this->postJson('/api/master/customers', [
            'code' => 'CUS-999',
            'name' => 'Toko Maju Jaya',
            'city' => 'Bandung',
            'segment' => 'Retail',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'CUS-999')
            ->assertJsonPath('data.name', 'Toko Maju Jaya')
            ->assertJsonPath('data.segment', 'Retail');

        $this->assertDatabaseHas('customers', ['code' => 'CUS-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/customers', [
            'name' => 'Toko Otomatis Kode',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'CUS-001');

        $this->assertDatabaseHas('customers', ['code' => 'CUS-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/customers', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_invalid_segment(): void
    {
        $this->postJson('/api/master/customers', [
            'name' => 'Toko Segmen Salah',
            'segment' => 'Premium',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['segment']);
    }

    public function test_store_accepts_valid_npwp(): void
    {
        $this->postJson('/api/master/customers', [
            'name' => 'Toko NPWP Valid',
            'npwp' => '016090524017000',
        ])->assertCreated()
            ->assertJsonPath('data.npwp', '016090524017000');
    }

    public function test_store_rejects_invalid_npwp(): void
    {
        $this->postJson('/api/master/customers', [
            'name' => 'Toko NPWP Invalid',
            'npwp' => '999999999999999',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['npwp']);
    }

    public function test_store_rejects_invalid_nib(): void
    {
        $this->postJson('/api/master/customers', [
            'name' => 'Toko NIB Invalid',
            'nib' => 'abc',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['nib']);
    }

    public function test_can_show_customer(): void
    {
        $customer = Customer::factory()->create(['name' => 'Toko Tampil']);

        $this->getJson("/api/master/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $customer->id)
            ->assertJsonPath('data.name', 'Toko Tampil');
    }

    public function test_can_update_customer(): void
    {
        $customer = Customer::factory()->create(['name' => 'Toko Lama']);

        $this->putJson("/api/master/customers/{$customer->id}", [
            'name' => 'Toko Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Toko Baru');

        $this->assertDatabaseHas('customers', ['id' => $customer->id, 'name' => 'Toko Baru']);
    }

    public function test_can_delete_customer(): void
    {
        $customer = Customer::factory()->create();

        $this->deleteJson("/api/master/customers/{$customer->id}")
            ->assertOk();

        $this->assertDatabaseMissing('customers', ['id' => $customer->id]);
    }
}
