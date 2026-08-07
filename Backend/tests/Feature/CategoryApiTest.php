<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\SubCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_categories(): void
    {
        Category::factory()->count(5)->create();

        $this->getJson('/api/master/categories')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_can_search(): void
    {
        Category::factory()->create(['name' => 'Komponen Elektronik']);
        Category::factory()->count(3)->create();

        $this->getJson('/api/master/categories?search=elektronik')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Komponen Elektronik');
    }

    public function test_can_store_category(): void
    {
        $payload = [
            'code' => 'KAT-999',
            'name' => 'Alat Laboratorium',
            'description' => 'Perlengkapan laboratorium dan riset.',
        ];

        $this->postJson('/api/master/categories', $payload)
            ->assertCreated()
            ->assertJsonPath('data.code', 'KAT-999')
            ->assertJsonPath('data.name', 'Alat Laboratorium');

        $this->assertDatabaseHas('categories', ['code' => 'KAT-999']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/categories', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/categories', ['name' => 'Alat Laboratorium'])
            ->assertCreated()
            ->assertJsonPath('data.code', 'KAT-001');

        $this->postJson('/api/master/categories', ['name' => 'Alat Berat'])
            ->assertCreated()
            ->assertJsonPath('data.code', 'KAT-002');

        $this->assertDatabaseHas('categories', ['code' => 'KAT-001']);
        $this->assertDatabaseHas('categories', ['code' => 'KAT-002']);
    }

    public function test_store_rejects_duplicate_code(): void
    {
        Category::factory()->create(['code' => 'KAT-001']);

        $this->postJson('/api/master/categories', ['code' => 'KAT-001', 'name' => 'Duplikat'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['code']);
    }

    public function test_can_show_category(): void
    {
        $category = Category::factory()->create(['name' => 'Komponen Elektronik']);

        $this->getJson("/api/master/categories/{$category->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $category->id)
            ->assertJsonPath('data.name', 'Komponen Elektronik');
    }

    public function test_can_update_category(): void
    {
        $category = Category::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/categories/{$category->id}", [
            'code' => 'KAT-001',
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('categories', ['id' => $category->id, 'name' => 'Baru']);
    }

    public function test_update_allows_keeping_own_code(): void
    {
        $category = Category::factory()->create(['code' => 'KAT-001', 'name' => 'Awal']);

        $this->putJson("/api/master/categories/{$category->id}", [
            'code' => 'KAT-001',
            'name' => 'Ubah Nama Saja',
        ])->assertOk();
    }

    public function test_cannot_delete_category_that_has_items(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['category_id' => $category->id]);

        $this->deleteJson("/api/master/categories/{$category->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }

    public function test_cannot_delete_category_that_has_sub_categories(): void
    {
        $category = Category::factory()->create();
        SubCategory::factory()->create(['category_id' => $category->id]);

        $this->deleteJson("/api/master/categories/{$category->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }

    public function test_can_delete_empty_category(): void
    {
        $category = Category::factory()->create();

        $this->deleteJson("/api/master/categories/{$category->id}")
            ->assertOk();

        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }
}
