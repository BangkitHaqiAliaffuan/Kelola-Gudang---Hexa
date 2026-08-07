<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Category;
use App\Models\Item;
use App\Models\Merk;
use App\Models\Rack;
use App\Models\SubCategory;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_items(): void
    {
        Category::factory()->count(3)->create();
        Item::factory()->count(6)->create();

        $this->getJson('/api/master/items')
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_index_resolves_category_and_sub_category_names(): void
    {
        $category = Category::factory()->create(['name' => 'Komponen Elektronik']);
        $sub = SubCategory::factory()->create(['category_id' => $category->id, 'name' => 'Sirkuit']);
        Item::factory()->create(['category_id' => $category->id, 'sub_category_id' => $sub->id]);

        $this->getJson('/api/master/items')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'Komponen Elektronik')
            ->assertJsonPath('data.0.subCategory', 'Sirkuit');
    }

    public function test_index_resolves_brand_name(): void
    {
        $merk = Merk::factory()->create(['name' => 'Bosch']);
        Item::factory()->create(['brand_id' => $merk->id]);

        $this->getJson('/api/master/items')
            ->assertOk()
            ->assertJsonPath('data.0.brand', 'Bosch')
            ->assertJsonPath('data.0.brand_id', $merk->id);
    }

    public function test_index_filters_by_search(): void
    {
        Category::factory()->create();
        Item::factory()->create(['name' => 'Resistor 10K']);
        Item::factory()->count(3)->create(['name' => 'Aksesoris Aneka']);

        $this->getJson('/api/master/items?search=resistor')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_index_filters_by_category_and_status(): void
    {
        $a = Category::factory()->create();
        $b = Category::factory()->create();
        Item::factory()->count(2)->create(['category_id' => $a->id, 'status' => 'Aktif']);
        Item::factory()->count(1)->create(['category_id' => $b->id, 'status' => 'Aktif']);
        Item::factory()->count(1)->create(['category_id' => $a->id, 'status' => 'Nonaktif']);

        $this->getJson("/api/master/items?category_id={$a->id}&status=Aktif")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_can_store_item(): void
    {
        $category = Category::factory()->create();
        $sub = SubCategory::factory()->create(['category_id' => $category->id]);

        $payload = [
            'sku' => 'SKU-90001-001',
            'name' => 'Resistor 10K',
            'category_id' => $category->id,
            'sub_category_id' => $sub->id,
            'cost' => 2500,
            'price' => 4000,
            'min_stock' => 10,
            'status' => 'Aktif',
        ];

        $this->postJson('/api/master/items', $payload)
            ->assertCreated()
            ->assertJsonPath('data.sku', 'SKU-90001-001')
            ->assertJsonPath('data.category', $category->name);

        $this->assertDatabaseHas('items', ['sku' => 'SKU-90001-001']);
    }

    public function test_store_rejects_duplicate_sku(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['sku' => 'SKU-90001-001', 'category_id' => $category->id]);

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-90001-001',
            'name' => 'Duplikat',
            'category_id' => $category->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['sku']);
    }

    public function test_store_auto_generates_internal_barcode(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-91001-001',
            'name' => 'Auto Barcode',
            'category_id' => $category->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()
            ->assertJsonPath('data.internal_barcode', 'IB-001');

        $this->assertDatabaseHas('items', ['sku' => 'SKU-91001-001', 'internal_barcode' => 'IB-001']);
    }

    public function test_store_auto_generates_incremental_internal_barcode(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create(['internal_barcode' => 'IB-007', 'category_id' => $category->id]);

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-91002-001',
            'name' => 'Auto Barcode Lanjutan',
            'category_id' => $category->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()
            ->assertJsonPath('data.internal_barcode', 'IB-008');
    }

    public function test_store_respects_explicit_internal_barcode(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-91003-001',
            'name' => 'Barcode Manual',
            'category_id' => $category->id,
            'internal_barcode' => 'IB-999',
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()
            ->assertJsonPath('data.internal_barcode', 'IB-999');
    }

    public function test_index_search_matches_internal_barcode(): void
    {
        $category = Category::factory()->create();
        Item::factory()->create([
            'category_id' => $category->id,
            'name' => 'Kabel Khusus',
            'internal_barcode' => 'IB-123',
        ]);

        $this->getJson('/api/master/items?search=IB-123')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.internal_barcode', 'IB-123');
    }

    public function test_store_requires_category_and_status(): void
    {
        $this->postJson('/api/master/items', [
            'sku' => 'SKU-90002-001',
            'name' => 'Tanpa Kategori',
            'cost' => 1,
            'price' => 2,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['category_id', 'status']);
    }

    public function test_store_rejects_sub_category_from_other_category(): void
    {
        $catA = Category::factory()->create();
        $catB = Category::factory()->create();
        $subA = SubCategory::factory()->create(['category_id' => $catA->id]);

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-90003-001',
            'name' => 'Salah Sub Kategori',
            'category_id' => $catB->id,
            'sub_category_id' => $subA->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['sub_category_id']);
    }

    public function test_store_rejects_max_stock_below_min_stock(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-90004-001',
            'name' => 'Max di Bawah Min',
            'category_id' => $category->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 100,
            'max_stock' => 50,
            'status' => 'Aktif',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['max_stock']);
    }

    public function test_can_show_item(): void
    {
        $category = Category::factory()->create(['name' => 'Alat Ukur']);
        $item = Item::factory()->create(['category_id' => $category->id]);

        $this->getJson("/api/master/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $item->id)
            ->assertJsonPath('data.category', 'Alat Ukur');
    }

    public function test_can_update_item(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id, 'name' => 'Lama']);

        $this->putJson("/api/master/items/{$item->id}", [
            'sku' => $item->sku,
            'name' => 'Baru',
            'category_id' => $category->id,
            'cost' => $item->cost,
            'price' => $item->price,
            'min_stock' => $item->min_stock,
            'status' => $item->status,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');
    }

    public function test_can_delete_item(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id]);

        $this->deleteJson("/api/master/items/{$item->id}")
            ->assertOk();

        $this->assertDatabaseMissing('items', ['id' => $item->id]);
    }

    public function test_can_bulk_delete_items(): void
    {
        $category = Category::factory()->create();
        $items = Item::factory()->count(3)->create(['category_id' => $category->id]);

        $this->postJson('/api/master/items/bulk-delete', [
            'ids' => $items->pluck('id')->all(),
        ])->assertOk()
            ->assertJsonPath('deleted', 3);

        foreach ($items as $item) {
            $this->assertDatabaseMissing('items', ['id' => $item->id]);
        }
    }

    public function test_can_bulk_update_item_status(): void
    {
        $category = Category::factory()->create();
        $items = Item::factory()->count(3)->create([
            'category_id' => $category->id,
            'status' => 'Aktif',
        ]);

        $this->postJson('/api/master/items/bulk-status', [
            'ids' => $items->pluck('id')->all(),
            'status' => 'Nonaktif',
        ])->assertOk()
            ->assertJsonPath('updated', 3);

        foreach ($items as $item) {
            $this->assertDatabaseHas('items', ['id' => $item->id, 'status' => 'Nonaktif']);
        }
    }

    public function test_bulk_action_rejects_empty_ids(): void
    {
        $this->postJson('/api/master/items/bulk-delete', ['ids' => []])
            ->assertStatus(422);

        $this->postJson('/api/master/items/bulk-status', ['ids' => [], 'status' => 'Aktif'])
            ->assertStatus(422);
    }

    public function test_can_store_item_with_default_rack_and_bin(): void
    {
        $category = Category::factory()->create();
        $warehouse = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $warehouse->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-92001-001',
            'name' => 'Barang Berlokasi',
            'category_id' => $category->id,
            'default_warehouse_id' => $warehouse->id,
            'default_rack_id' => $rack->id,
            'default_bin_id' => $bin->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()
            ->assertJsonPath('data.default_rack_id', $rack->id)
            ->assertJsonPath('data.default_bin_id', $bin->id)
            ->assertJsonPath('data.rack', $rack->code)
            ->assertJsonPath('data.bin', $bin->code);
    }

    public function test_store_rejects_invalid_rack_and_bin(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-92002-001',
            'name' => 'Rak Salah',
            'category_id' => $category->id,
            'default_rack_id' => 9999,
            'default_bin_id' => 9999,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['default_rack_id', 'default_bin_id']);
    }

    public function test_can_update_item_rack_and_bin(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id]);
        $warehouse = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $warehouse->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $this->putJson("/api/master/items/{$item->id}", [
            'sku' => $item->sku,
            'name' => $item->name,
            'category_id' => $category->id,
            'default_warehouse_id' => $warehouse->id,
            'default_rack_id' => $rack->id,
            'default_bin_id' => $bin->id,
            'cost' => $item->cost,
            'price' => $item->price,
            'min_stock' => $item->min_stock,
            'status' => $item->status,
        ])->assertOk()
            ->assertJsonPath('data.default_rack_id', $rack->id)
            ->assertJsonPath('data.default_bin_id', $bin->id)
            ->assertJsonPath('data.rack', $rack->code)
            ->assertJsonPath('data.bin', $bin->code);
    }

    public function test_index_resolves_supplier_name(): void
    {
        $category = Category::factory()->create();
        $supplier = Supplier::factory()->create(['name' => 'PT Sumber Barang']);
        Item::factory()->create([
            'category_id' => $category->id,
            'preferred_supplier_id' => $supplier->id,
        ]);

        $this->getJson('/api/master/items')
            ->assertOk()
            ->assertJsonPath('data.0.supplier', 'PT Sumber Barang')
            ->assertJsonPath('data.0.preferred_supplier_id', $supplier->id);
    }

    public function test_can_store_item_with_preferred_supplier(): void
    {
        $category = Category::factory()->create();
        $supplier = Supplier::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-93001-001',
            'name' => 'Barang Bersupplier',
            'category_id' => $category->id,
            'preferred_supplier_id' => $supplier->id,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertCreated()
            ->assertJsonPath('data.preferred_supplier_id', $supplier->id)
            ->assertJsonPath('data.supplier', $supplier->name);

        $this->assertDatabaseHas('items', ['sku' => 'SKU-93001-001', 'preferred_supplier_id' => $supplier->id]);
    }

    public function test_store_rejects_invalid_supplier(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/master/items', [
            'sku' => 'SKU-93002-001',
            'name' => 'Supplier Salah',
            'category_id' => $category->id,
            'preferred_supplier_id' => 9999,
            'cost' => 1,
            'price' => 2,
            'min_stock' => 0,
            'status' => 'Aktif',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['preferred_supplier_id']);
    }

    public function test_cannot_delete_item_used_by_work_order(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id]);
        WorkOrder::factory()->create(['item_id' => $item->id]);

        $this->deleteJson("/api/master/items/{$item->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('items', ['id' => $item->id]);
    }

    public function test_cannot_bulk_delete_item_used_by_work_order(): void
    {
        $category = Category::factory()->create();
        $item = Item::factory()->create(['category_id' => $category->id]);
        WorkOrder::factory()->create(['item_id' => $item->id]);

        $this->postJson('/api/master/items/bulk-delete', ['ids' => [$item->id]])
            ->assertUnprocessable();

        $this->assertDatabaseHas('items', ['id' => $item->id]);
    }
}
