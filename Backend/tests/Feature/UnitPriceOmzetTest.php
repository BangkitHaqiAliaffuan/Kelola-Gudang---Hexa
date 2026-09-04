<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UnitPriceOmzetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_pengeluaran_defaults_unit_price_from_master(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 50, 1000);
        $cust = Customer::factory()->create();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $line = $res->json('data.lines.0');
        $this->assertEquals(1500.0, (float) $line['unit_price']);
        $this->assertFalse((bool) $line['unit_price_estimated']);
        // unit_cost tetap moving average, bukan harga jual.
        $this->assertEquals(1000.0, (float) $line['unit_cost']);
        $this->assertEquals(-15000.0, (float) $res->json('data.revenue_total'));
    }

    public function test_manual_unit_price_override_respected(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 50, 1000);
        $cust = Customer::factory()->create();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id, 'unit_price' => 1300]],
        ])->assertStatus(201);

        $this->assertEquals(1300.0, (float) $res->json('data.lines.0.unit_price'));
    }

    public function test_retur_penjualan_inherits_source_unit_price(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 50, 1000);
        $cust = Customer::factory()->create();

        $bk = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id, 'unit_price' => 1300]],
        ])->assertStatus(201);

        $rj = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Selesai',
            'document_date' => '2026-07-15',
            'warehouse_id' => $wh->id,
            'source_document_id' => $bk->json('data.id'),
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'note' => 'Alasan: Cacat',
            'lines' => [['item_id' => $item->id, 'qty' => 2, 'to_bin_id' => $bin->id, 'source_line_id' => $bk->json('data.lines.0.id')]],
        ])->assertStatus(201);

        $this->assertEquals(1300.0, (float) $rj->json('data.lines.0.unit_price'));
    }

    public function test_non_revenue_types_have_null_unit_price(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();

        $bm = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $bin->id, 'unit_price' => 1500]],
        ])->assertStatus(201);

        // Input unit_price untuk Penerimaan diabaikan → NULL.
        $this->assertNull($bm->json('data.lines.0.unit_price'));
        $this->assertNull($bm->json('data.revenue_total'));
    }

    public function test_master_price_change_does_not_rewrite_history(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 50, 1000);
        $cust = Customer::factory()->create();

        $bk = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);
        $this->assertEquals(1500.0, (float) $bk->json('data.lines.0.unit_price'));

        $item->update(['price' => 2000]);

        $show = $this->getJson('/api/persediaan/stock-documents/'.$bk->json('data.id'))->assertOk();
        $this->assertEquals(1500.0, (float) $show->json('data.lines.0.unit_price'));
    }

    public function test_unit_price_validation(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $cust = Customer::factory()->create();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $bin->id, 'unit_price' => -5]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.unit_price');
    }

    private function makeItem(array $overrides = []): Item
    {
        return Item::factory()->create(array_merge([
            'cost' => 1000,
            'price' => 1500,
        ], $overrides));
    }

    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$wh, $rack, $bin];
    }

    private function seedInbound(Item $item, Warehouse $wh, Bin $bin, int $qty, float $cost = 1000.0): void
    {
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [
                ['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);
    }
}
