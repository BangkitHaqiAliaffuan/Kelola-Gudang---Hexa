<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemBarcodeLookupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_store_allows_shared_product_barcode(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['category_id' => $category->id, 'barcode' => '8999990000011']);

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-93001-001',
            'name' => 'Barang SKU-93001-001',
            'category_id' => $category->id,
            'barcode' => '8999990000011',
            'cost' => 1000,
            'price' => 1500,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()->assertJsonPath('data.barcode', '8999990000011');

        $this->assertSame(2, Item::where('barcode', '8999990000011')->count());
    }

    public function test_update_allows_shared_product_barcode(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['category_id' => $category->id, 'barcode' => '8999990000022']);
        $item = Item::factory()->create(['category_id' => $category->id, 'barcode' => null]);

        $this->putJson('/api/master/items/'.$item->id, [
            'sku' => $item->sku,
            'name' => $item->name,
            'category_id' => $category->id,
            'barcode' => '8999990000022',
            'cost' => 1000,
            'price' => 1500,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertOk()->assertJsonPath('data.barcode', '8999990000022');
    }

    public function test_update_rejects_internal_barcode_change(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id, 'internal_barcode' => 'IB-93001']);

        $payload = [
            'sku' => $item->sku,
            'name' => $item->name,
            'category_id' => $category->id,
            'cost' => 1000,
            'price' => 1500,
            'min_stock' => 0,
            'status' => 'Aktif',
            'internal_barcode' => 'IB-UBAH',
        ];

        $this->putJson('/api/master/items/'.$item->id, $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['internal_barcode']);

        $payload['internal_barcode'] = 'IB-93001';
        $this->putJson('/api/master/items/'.$item->id, $payload)->assertOk();
    }

    public function test_lookup_returns_ranked_candidates_with_match_source(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create([
            'category_id' => $category->id,
            'name' => 'Barang Internal',
            'internal_barcode' => 'CAMPUR-1',
        ]);
        Item::factory()->create([
            'category_id' => $category->id,
            'name' => 'Barang Kemasan B',
            'barcode' => 'CAMPUR-1',
        ]);
        Item::factory()->create([
            'category_id' => $category->id,
            'name' => 'Barang Kemasan A',
            'barcode' => 'CAMPUR-1',
        ]);

        $this->getJson('/api/master/items/lookup?code=campur-1')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.match_source', 'internal')
            ->assertJsonPath('data.0.name', 'Barang Internal')
            ->assertJsonPath('data.1.match_source', 'produk')
            ->assertJsonPath('data.1.name', 'Barang Kemasan A')
            ->assertJsonPath('data.2.match_source', 'produk');
    }

    public function test_lookup_matches_sku_as_fallback(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['category_id' => $category->id, 'sku' => 'SKU-93001-007']);

        $this->getJson('/api/master/items/lookup?code=sku-93001-007')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.match_source', 'sku');
    }

    public function test_lookup_returns_empty_list_for_unknown_code(): void
    {
        Category::factory()->create();

        $this->getJson('/api/master/items/lookup?code=TIDAK-ADA-123')
            ->assertOk()
            ->assertJsonPath('data', []);
    }

    public function test_bulk_import_shared_barcode_returns_warnings_not_errors(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create([
            'category_id' => $category->id,
            'sku' => 'SKU-93001-010',
            'name' => 'Barang Lama',
            'barcode' => '8999990000033',
        ]);

        $items = [];
        foreach (['011' => 'Barang Baru A', '012' => 'Barang Baru B'] as $seq => $name) {
            $items[] = [
                'sku' => 'SKU-93001-'.$seq,
                'name' => $name,
                'barcode' => '8999990000033',
                'category_id' => $category->id,
                'cost' => 1000,
                'price' => 1500,
                'min_stock' => 0,
                'status' => 'Aktif',
                'action' => 'create',
            ];
        }

        $response = $this->postJson('/api/master/items/bulk-import', ['items' => $items]);

        $response->assertOk()
            ->assertJsonPath('created', 2)
            ->assertJsonPath('errors', []);

        $warnings = $response->json('warnings');
        $this->assertNotEmpty($warnings[0]);
        $this->assertNotEmpty($warnings[1]);
        $this->assertStringContainsString('Barang Lama', $warnings[0]);
    }
}
