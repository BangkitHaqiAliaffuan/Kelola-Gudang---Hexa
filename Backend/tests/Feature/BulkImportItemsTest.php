<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\SubCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BulkImportItemsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    private function row(array $overrides = []): array
    {
        return array_merge([
            'sku' => 'SKU-TEST-001',
            'name' => 'Teh Manis',
            'cost' => 50000,
            'price' => 75000,
            'min_stock' => 10,
            'status' => 'Aktif',
            'action' => 'create',
        ], $overrides);
    }

    public function test_bulk_import_creates_item_and_preserves_zero_values(): void
    {
        $response = $this->postJson('/api/master/items/bulk-import', [
            'items' => [$this->row(['category_name' => 'Minuman', 'min_stock' => 0, 'lead_time' => 0])],
        ]);

        $response->assertOk()->assertJsonPath('created', 1)->assertJsonPath('errors', []);

        $item = Item::where('sku', 'SKU-TEST-001')->firstOrFail();
        $this->assertSame(0, $item->min_stock);
        $this->assertSame(0, $item->lead_time);
        $this->assertSame('Minuman', $item->category->name);
    }

    public function test_bulk_import_rejects_sub_category_of_other_category(): void
    {
        $catA = Category::factory()->create(['name' => 'Minuman']);
        $catB = Category::factory()->create(['name' => 'Makanan']);
        $subB = SubCategory::factory()->create(['category_id' => $catB->id, 'name' => 'Snack']);

        $response = $this->postJson('/api/master/items/bulk-import', [
            'items' => [$this->row(['category_id' => $catA->id, 'sub_category_id' => $subB->id])],
        ]);

        $response->assertOk()->assertJsonPath('created', 0);
        $errors = $response->json('errors');
        $this->assertCount(1, $errors);
        $this->assertStringContainsString('bukan bagian dari Kategori', (string) reset($errors));
        $this->assertStringContainsString('Snack', (string) reset($errors));
        $this->assertDatabaseMissing('items', ['sku' => 'SKU-TEST-001']);
    }

    public function test_bulk_import_reports_duplicate_sku_against_database(): void
    {
        $cat = Category::factory()->create();
        Item::factory()->create(['sku' => 'SKU-TEST-001', 'category_id' => $cat->id]);

        $response = $this->postJson('/api/master/items/bulk-import', [
            'items' => [$this->row(['category_id' => $cat->id])],
        ]);

        // Duplikat-vs-database ditolak whole-request 422 dengan pesan spesifik.
        $response->assertStatus(422)->assertJsonPath('message', 'Validasi gagal.');
        $body = $response->json('errors');
        $flat = is_array($body) ? implode(' ', array_map('strval', $body)) : (string) $body;
        $this->assertStringContainsString('SKU-TEST-001', $flat);
        $this->assertStringContainsString('database', $flat);
    }
}
