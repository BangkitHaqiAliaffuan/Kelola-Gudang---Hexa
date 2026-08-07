<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_departments(): void
    {
        Department::factory()->count(5)->create();

        $this->getJson('/api/master/departments')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_resolves_head_name(): void
    {
        $head = User::factory()->create(['name' => 'Bayu Pratama']);
        Department::factory()->create(['head_user_id' => $head->id]);

        $this->getJson('/api/master/departments')
            ->assertOk()
            ->assertJsonPath('data.0.head', 'Bayu Pratama')
            ->assertJsonPath('data.0.head_user_id', $head->id);
    }

    public function test_index_can_search(): void
    {
        Department::factory()->create(['name' => 'Produksi']);
        Department::factory()->count(3)->create();

        $this->getJson('/api/master/departments?search=produksi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Produksi');
    }

    public function test_can_store_department(): void
    {
        $this->postJson('/api/master/departments', [
            'code' => 'DEP-999',
            'name' => 'Quality Control',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'DEP-999')
            ->assertJsonPath('data.name', 'Quality Control');

        $this->assertDatabaseHas('departments', ['code' => 'DEP-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/departments', [
            'name' => 'Otomatis Kode',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'DEP-001');

        $this->assertDatabaseHas('departments', ['code' => 'DEP-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/departments', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_duplicate_name(): void
    {
        Department::factory()->create(['name' => 'Produksi']);

        $this->postJson('/api/master/departments', ['name' => 'Produksi'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_invalid_head(): void
    {
        $this->postJson('/api/master/departments', [
            'name' => 'Tanpa Kepala Valid',
            'head_user_id' => 9999,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['head_user_id']);
    }

    public function test_can_show_department(): void
    {
        $department = Department::factory()->create(['name' => 'Logistik']);

        $this->getJson("/api/master/departments/{$department->id}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Logistik');
    }

    public function test_can_update_department(): void
    {
        $department = Department::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/departments/{$department->id}", [
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('departments', ['id' => $department->id, 'name' => 'Baru']);
    }

    public function test_can_delete_department(): void
    {
        $department = Department::factory()->create();

        $this->deleteJson("/api/master/departments/{$department->id}")
            ->assertOk();

        $this->assertDatabaseMissing('departments', ['id' => $department->id]);
    }
}
