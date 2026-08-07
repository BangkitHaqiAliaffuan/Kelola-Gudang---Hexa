<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\SubCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubCategoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_sub_categories_with_category_name(): void
    {
        $category = Category::factory()->create(['name' => 'Material Logam']);
        SubCategory::factory()->count(3)->create(['category_id' => $category->id]);

        $this->getJson('/api/master/sub-categories')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.category_name', 'Material Logam');
    }

    public function test_index_filters_by_category(): void
    {
        $a = Category::factory()->create();
        $b = Category::factory()->create();
        SubCategory::factory()->count(2)->create(['category_id' => $a->id]);
        SubCategory::factory()->count(1)->create(['category_id' => $b->id]);

        $this->getJson("/api/master/sub-categories?category_id={$a->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_can_store_sub_category(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/sub-categories', [
            'category_id' => $category->id,
            'code' => 'SUB-100',
            'name' => 'Bantalan',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Bantalan')
            ->assertJsonPath('data.category_id', $category->id);

        $this->assertDatabaseHas('sub_categories', ['code' => 'SUB-100']);
    }

    public function test_store_requires_valid_category(): void
    {
        $this->postJson('/api/master/sub-categories', [
            'category_id' => 9999,
            'code' => 'SUB-101',
            'name' => 'X',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['category_id']);
    }

    public function test_can_update_sub_category(): void
    {
        $sub = SubCategory::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/sub-categories/{$sub->id}", [
            'category_id' => $sub->category_id,
            'code' => $sub->code,
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');
    }

    public function test_cannot_delete_sub_category_that_has_items(): void
    {
        $sub = SubCategory::factory()->create();
        Item::factory()->create(['category_id' => $sub->category_id, 'sub_category_id' => $sub->id]);

        $this->deleteJson("/api/master/sub-categories/{$sub->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('sub_categories', ['id' => $sub->id]);
    }

    public function test_can_delete_empty_sub_category(): void
    {
        $sub = SubCategory::factory()->create();

        $this->deleteJson("/api/master/sub-categories/{$sub->id}")
            ->assertOk();

        $this->assertDatabaseMissing('sub_categories', ['id' => $sub->id]);
    }
}
