<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockDocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
        $this->seed();
    }

    public function test_index_returns_documents(): void
    {
        $this->getJson('/api/persediaan/stock-documents?per_page=500')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'no', 'type', 'status', 'document_date', 'warehouse_id',
                        'warehouse', 'destination_warehouse_id', 'destination', 'partner',
                        'reference_no', 'pic', 'note', 'posted_at', 'line_count',
                    ],
                ],
                'meta' => ['total'],
            ])
            ->assertJsonPath('meta.total', StockDocument::count());
    }

    public function test_index_filters(): void
    {
        $doc = StockDocument::query()->firstOrFail();

        $this->getJson('/api/persediaan/stock-documents?type='.urlencode($doc->type))
            ->assertOk()
            ->assertJsonPath('meta.total', StockDocument::where('type', $doc->type)->count());

        $this->getJson('/api/persediaan/stock-documents?status='.urlencode($doc->status))
            ->assertOk()
            ->assertJsonPath('meta.total', StockDocument::where('status', $doc->status)->count());

        $this->getJson('/api/persediaan/stock-documents?search='.urlencode($doc->no))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.no', $doc->no);
    }

    public function test_show_includes_lines(): void
    {
        $doc = StockDocument::query()->firstOrFail();

        $this->getJson("/api/persediaan/stock-documents/{$doc->id}")
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'no', 'type', 'status',
                    'lines' => [
                        '*' => ['id', 'line_no', 'item_id', 'sku', 'name', 'unit', 'qty', 'from_bin', 'to_bin'],
                    ],
                ],
            ])
            ->assertJsonCount(StockDocumentLine::where('document_id', $doc->id)->count(), 'data.lines');
    }

    public function test_post_penerimaan_creates_movement(): void
    {
        $doc = $this->makeDocument('Penerimaan', 'Draft', [['qty' => 10, 'cost' => 1500]]);
        $item = $doc->lines->first()->item;
        $bin = $doc->lines->first()->fromBin;

        $before = (int) ItemStock::where('item_id', $item->id)
            ->where('bin_id', $bin->id)->value('stock');

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")
            ->assertOk()
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($value) => $value !== null);

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'IN',
            'qty' => 10,
        ]);

        $after = (int) ItemStock::where('item_id', $item->id)
            ->where('bin_id', $bin->id)->value('stock');
        $this->assertSame($before + 10, $after);
    }

    public function test_post_is_idempotent(): void
    {
        $doc = $this->makeDocument('Penerimaan', 'Draft', [['qty' => 5, 'cost' => 900]]);

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")->assertOk();
        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")->assertOk();

        $this->assertSame(
            1,
            StockMovement::where('stock_document_id', $doc->id)->count()
        );
    }

    public function test_post_transfer_links_pair(): void
    {
        $whA = Warehouse::factory()->create();
        $whB = Warehouse::factory()->create();
        $rackA = Rack::factory()->create(['warehouse_id' => $whA->id]);
        $rackB = Rack::factory()->create(['warehouse_id' => $whB->id]);
        $binA = Bin::factory()->create(['rack_id' => $rackA->id]);
        $binB = Bin::factory()->create(['rack_id' => $rackB->id]);

        $item = Item::factory()->create([
            'sku' => 'SKU-TRN-001', 'barcode' => '8990000000003', 'internal_barcode' => 'IB-TRN-001',
        ]);
        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $whA->id, 'bin_id' => $binA->id],
            ['stock' => 100, 'reserved' => 0, 'unit_cost_avg' => 2000, 'updated_at' => now()]
        );

        $doc = StockDocument::create([
            'no' => 'TF/2026/90001',
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => now(),
            'warehouse_id' => $whA->id,
            'destination_warehouse_id' => $whB->id,
            'pic' => 'Test',
        ]);
        StockDocumentLine::create([
            'document_id' => $doc->id,
            'line_no' => 1,
            'item_id' => $item->id,
            'qty' => -30,
            'from_bin_id' => $binA->id,
            'to_bin_id' => $binB->id,
            'unit_cost' => 2000,
        ]);

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")
            ->assertOk()
            ->assertJsonPath('data.status', 'Selesai');

        $out = StockMovement::where('stock_document_id', $doc->id)->where('direction', 'OUT')->firstOrFail();
        $in = StockMovement::where('stock_document_id', $doc->id)->where('direction', 'IN')->firstOrFail();

        $this->assertSame($out->id, $in->pair_id);
        $this->assertSame($in->id, $out->pair_id);
        $this->assertSame(30, $in->qty);
    }

    public function test_post_insufficient_stock_returns_422(): void
    {
        $doc = $this->makeDocument('Pengeluaran', 'Draft', [['qty' => -999, 'cost' => 1000]]);

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains((string) $m, 'tidak mencukupi'));

        $this->assertSame('Draft', $doc->fresh()->status);
    }

    public function test_post_cancelled_document_returns_422(): void
    {
        $doc = $this->makeDocument('Penerimaan', 'Dibatalkan', [['qty' => 5, 'cost' => 900]]);

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")
            ->assertStatus(422);
    }

    public function test_cancel_draft(): void
    {
        $doc = $this->makeDocument('Penerimaan', 'Draft', [['qty' => 5, 'cost' => 900]]);

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'Dibatalkan');
    }

    public function test_cancel_posted_document_returns_422(): void
    {
        $doc = StockDocument::query()->where('status', 'Selesai')->firstOrFail();

        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/cancel")
            ->assertStatus(422);
    }

    private function makeDocument(string $type, string $status, array $lines): StockDocument
    {
        $unique = random_int(10000, 99999);
        $item = Item::factory()->create([
            'sku' => "SKU-TEST-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-TEST-{$unique}",
        ]);
        $wh = $item->default_warehouse ?? Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        // Opening balance comes from the ledger (ItemStock is a derived projection).
        StockMovement::create([
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'direction' => 'IN',
            'qty' => 500,
            'movement_type' => 'Penerimaan',
            'reference_no' => 'OPEN/2026/00001',
            'partner' => 'Test',
            'unit_cost' => 1000,
            'pic' => 'Test',
            'note' => 'Stok awal',
            'occurred_at' => now()->subDay(),
        ]);

        (new StockLedger)->rebuildForItem($item->id);

        $doc = StockDocument::create([
            'no' => "TEST/{$type}/".str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'type' => $type,
            'status' => $status,
            'document_date' => now(),
            'warehouse_id' => $wh->id,
            'pic' => 'Test',
        ]);

        foreach ($lines as $index => $line) {
            StockDocumentLine::create([
                'document_id' => $doc->id,
                'line_no' => $index + 1,
                'item_id' => $item->id,
                'qty' => $line['qty'],
                'from_bin_id' => $bin->id,
                'unit_cost' => $line['cost'],
            ]);
        }

        return $doc->load('lines');
    }
}
