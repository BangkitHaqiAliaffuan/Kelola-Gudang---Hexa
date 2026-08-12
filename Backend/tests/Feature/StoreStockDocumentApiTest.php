<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockDocument;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\Fluent\AssertableJson;
use Tests\TestCase;

class StoreStockDocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
        $this->seed();
    }

    public function test_store_penerimaan_draft_creates_document_without_movements(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'reference_no' => 'PO-00123',
            'note' => 'Barang datang via kurir',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.status', 'Draft')
                ->where('data.type', 'Penerimaan')
                ->where('data.partner', 'PT Sumber Jaya')
                ->where('data.reference_no', 'PO-00123')
                ->where('data.warehouse_id', $wh->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^BM\/\d{4}\/\d{5}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.to_bin_id', $bin->id)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', 10));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_penerimaan_posted_moves_stock_to_destination_bin(): void
    {
        $item = $this->makeItem();
        [$wh, $rack, $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($v) => $v !== null);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'IN',
            'qty' => 10,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'unit_cost' => 1500.0,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $bin->id,
            'stock' => 10,
        ]);
    }

    public function test_store_bin_not_in_warehouse_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();
        [, , $otherBin] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $otherBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.to_bin_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_validation_rules(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $base = [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id],
            ],
        ];

        $cases = [
            'missing lines' => ['lines' => []],
            'type invalid' => ['type' => 'Pengeluaran'],
            'status invalid' => ['status' => 'Terhapus'],
            'warehouse required' => ['warehouse_id' => null],
            'qty zero' => ['lines' => [['item_id' => $item->id, 'qty' => 0, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]]],
            'item missing' => ['lines' => [['item_id' => 99999999, 'qty' => 1, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]]],
            'bin missing' => ['lines' => [['item_id' => $item->id, 'qty' => 1, 'unit_cost' => 1000]]],
        ];

        $before = StockDocument::count();

        foreach ($cases as $name => $mutations) {
            $payload = array_merge($base, $mutations);
            $this->postJson('/api/persediaan/stock-documents', $payload)
                ->assertStatus(422, "kasus validasi gagal: {$name}");
        }

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_generates_sequential_no(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $payload = [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'unit_cost' => 1000, 'to_bin_id' => $bin->id],
            ],
        ];

        $first = $this->postJson('/api/persediaan/stock-documents', $payload)->assertStatus(201)->json('data.no');
        $second = $this->postJson('/api/persediaan/stock-documents', $payload)->assertStatus(201)->json('data.no');

        $num = fn (string $no) => (int) substr($no, -5);

        $this->assertSame($num($first) + 1, $num($second));
        $this->assertNotSame($first, $second);
    }

    public function test_index_returns_qty_and_value_aggregates(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $no = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
                ['item_id' => $item->id, 'qty' => 3, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.no');

        $row = collect($this->getJson('/api/persediaan/stock-documents?per_page=10000')->assertOk()->json('data'))
            ->firstWhere('no', $no);

        $this->assertNotNull($row, 'dokumen tidak muncul di index');
        $this->assertArrayHasKey('qty_total', $row);
        $this->assertArrayHasKey('value_total', $row);
        $this->assertSame(13, $row['qty_total']);
        $this->assertSame(19500, (int) $row['value_total']);
    }

    private function makeItem(): Item
    {
        $unique = random_int(10000, 99999);

        return Item::factory()->create([
            'sku' => "SKU-STORE-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-STORE-{$unique}",
        ]);
    }

    /** @return array{0: Warehouse, 1: Rack, 2: Bin} */
    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$wh, $rack, $bin];
    }
}