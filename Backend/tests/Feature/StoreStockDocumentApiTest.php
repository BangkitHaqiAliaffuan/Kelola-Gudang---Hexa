<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\StockDocument;
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
            'type invalid' => ['type' => 'Mutasi'],
            'status invalid' => ['status' => 'Terhapus'],
            'warehouse required' => ['warehouse_id' => null],
            'qty zero' => ['lines' => [['item_id' => $item->id, 'qty' => 0, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]]],
            'qty negative' => ['lines' => [['item_id' => $item->id, 'qty' => -5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]]],
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

    public function test_store_pengeluaran_draft_creates_document_without_movements(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'Departemen Produksi',
            'reference_no' => 'SPK-8899',
            'pic' => 'Agus Salim',
            'note' => 'Permintaan produksi mingguan',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.status', 'Draft')
                ->where('data.type', 'Pengeluaran')
                ->where('data.partner', 'Departemen Produksi')
                ->where('data.reference_no', 'SPK-8899')
                ->where('data.warehouse_id', $wh->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^BK\/\d{4}\/\d{5}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.from_bin_id', $bin->id)
                ->where('data.lines.0.to_bin_id', null)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', -5));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_pengeluaran_posted_moves_stock_out(): void
    {
        $item = $this->makeItem();
        [$wh, $rack, $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Aneka Mandiri',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.lines.0.qty', -4)
            ->assertJsonPath('data.lines.0.from_bin_id', $bin->id)
            ->assertJsonPath('data.lines.0.to_bin_id', null)
            ->assertJsonPath('data.lines.0.unit_cost', 1500);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'OUT',
            'qty' => 4,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'unit_cost' => 1500.0,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $bin->id,
            'stock' => 6,
        ]);
    }

    public function test_store_pengeluaran_insufficient_stock_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $before = StockDocument::count();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 100, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Stok tidak mencukupi', (string) $res->json('message'));
        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_pengeluaran_requires_from_bin(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.from_bin_id');
    }

    public function test_store_transfer_draft_creates_document_without_movements(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [$destWh, , $toBin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $destWh->id,
            'partner' => 'Pindah cabang',
            'note' => 'Persiapan stok gudang baru',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 6, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.status', 'Draft')
                ->where('data.type', 'Transfer Gudang')
                ->where('data.partner', 'Pindah cabang')
                ->where('data.warehouse_id', $wh->id)
                ->where('data.destination_warehouse_id', $destWh->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^TF\/\d{4}\/\d{5}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.from_bin_id', $fromBin->id)
                ->where('data.lines.0.to_bin_id', $toBin->id)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', 6));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_transfer_posted_links_out_and_in_pair(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [$destWh, , $toBin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 2500, 'to_bin_id' => $fromBin->id],
            ],
        ])->assertStatus(201);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $destWh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.destination_warehouse_id', $destWh->id)
            ->assertJsonPath('data.lines.0.qty', 4)
            ->assertJsonPath('data.lines.0.unit_cost', 2500);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'line_no' => 1,
            'direction' => 'OUT',
            'qty' => 4,
            'warehouse_id' => $wh->id,
            'bin_id' => $fromBin->id,
            'unit_cost' => 2500.0,
        ]);

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'line_no' => 1,
            'direction' => 'IN',
            'qty' => 4,
            'warehouse_id' => $destWh->id,
            'bin_id' => $toBin->id,
            'unit_cost' => 2500.0,
        ]);

        $out = $doc->movements()->where('direction', 'OUT')->firstOrFail();
        $in = $doc->movements()->where('direction', 'IN')->firstOrFail();
        $this->assertSame($in->id, $out->pair_id);
        $this->assertSame($out->id, $in->pair_id);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $fromBin->id,
            'stock' => 6,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $destWh->id,
            'bin_id' => $toBin->id,
            'stock' => 4,
        ]);
    }

    public function test_store_transfer_insufficient_stock_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [$destWh, , $toBin] = $this->makeLocation();
        $before = StockDocument::count();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $destWh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 100, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Stok tidak mencukupi', (string) $res->json('message'));
        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_transfer_requires_destination_warehouse(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [, , $toBin] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('destination_warehouse_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_transfer_same_warehouse_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [, , $toBin] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('destination_warehouse_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_transfer_bin_not_in_destination_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [$destWh] = $this->makeLocation();
        [, , $toBin] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $destWh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.to_bin_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_retur_pembelian_draft_creates_document_without_movements(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'reference_no' => 'PO-00123',
            'note' => 'Alasan: Cacat',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.status', 'Draft')
                ->where('data.type', 'Retur Pembelian')
                ->where('data.partner', 'PT Sumber Jaya')
                ->where('data.reference_no', 'PO-00123')
                ->where('data.warehouse_id', $wh->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^RP\/\d{4}\/\d{5}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.from_bin_id', $bin->id)
                ->where('data.lines.0.to_bin_id', null)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', -5));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_retur_pembelian_posted_moves_stock_out(): void
    {
        $item = $this->makeItem();
        [$wh, $rack, $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.lines.0.qty', -4)
            ->assertJsonPath('data.lines.0.from_bin_id', $bin->id)
            ->assertJsonPath('data.lines.0.to_bin_id', null)
            ->assertJsonPath('data.lines.0.unit_cost', 1500);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'OUT',
            'qty' => 4,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'unit_cost' => 1500.0,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $bin->id,
            'stock' => 6,
        ]);
    }

    public function test_store_retur_pembelian_insufficient_stock_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $before = StockDocument::count();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 100, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Stok tidak mencukupi', (string) $res->json('message'));
        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_retur_pembelian_requires_from_bin(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.from_bin_id');

        $this->assertSame($before, StockDocument::count());
    }

    /** Buat dokumen Penerimaan Selesai dan kembalikan (doc, line pertama). */
    private function makePostedPenerimaan(int $itemId, int $binId, int $qty, float $cost, string $date = '2026-08-11'): array
    {
        $no = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => $date,
            'warehouse_id' => $this->warehouseIdOf($binId),
            'lines' => [
                ['item_id' => $itemId, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $binId],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = StockDocument::where('no', $no)->firstOrFail();

        return [$doc, $doc->lines()->firstOrFail()];
    }

    private function warehouseIdOf(int $binId): int
    {
        return Bin::with('rack')->findOrFail($binId)->rack->warehouse_id;
    }

    public function test_store_retur_pembelian_linked_uses_purchase_cost(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        // Dua Penerimaan dengan harga berbeda → moving average di bin berubah,
        // tapi retur ter-link harus memakai harga beli asal baris sumber (1500).
        [$source, $sourceLine] = $this->makePostedPenerimaan($item->id, $bin->id, 10, 1500);
        $this->makePostedPenerimaan($item->id, $bin->id, 5, 2000);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $bin->id, 'source_line_id' => $sourceLine->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.source_document_id', $source->id)
            ->assertJsonPath('data.source_document', $source->no)
            ->assertJsonPath('data.lines.0.source_line_id', $sourceLine->id)
            ->assertJsonPath('data.lines.0.unit_cost', 1500)
            ->assertJsonPath('data.lines.0.qty', -4);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'OUT',
            'unit_cost' => 1500.0,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $bin->id,
            'stock' => 11,
        ]);
    }

    public function test_store_retur_pembelian_qty_exceeds_source_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        [$source, $sourceLine] = $this->makePostedPenerimaan($item->id, $bin->id, 5, 1500);
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 6, 'from_bin_id' => $bin->id, 'source_line_id' => $sourceLine->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.qty');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_retur_pembelian_qty_accumulated_across_documents_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        [$source, $sourceLine] = $this->makePostedPenerimaan($item->id, $bin->id, 5, 1500);

        // Retur pertama memakai 3 dari 5; draft tetap terhitung sebagai pemakaian.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'from_bin_id' => $bin->id, 'source_line_id' => $sourceLine->id],
            ],
        ])->assertStatus(201);

        $before = StockDocument::count();

        // Retur kedua ingin memakai 3 lagi → hanya sisa 2 yang tersedia.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-13',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'from_bin_id' => $bin->id, 'source_line_id' => $sourceLine->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.qty');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_retur_pembelian_source_must_be_posted_penerimaan(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        // Draft Penerimaan belum diposting → tak boleh jadi sumber.
        $draftNo = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.no');
        $draft = StockDocument::where('no', $draftNo)->firstOrFail();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $draft->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $bin->id, 'source_line_id' => $draft->lines()->firstOrFail()->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('source_document_id');

        // Dokumen Pengeluaran bukan Penerimaan → tak boleh jadi sumber.
        $bkNo = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.no');
        $bk = StockDocument::where('no', $bkNo)->firstOrFail();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $bk->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $bin->id, 'source_line_id' => $bk->lines()->firstOrFail()->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('source_document_id');
    }

    public function test_store_retur_pembelian_source_line_mismatch_returns_422(): void
    {
        $itemA = $this->makeItem();
        $itemB = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        [$source, $sourceLine] = $this->makePostedPenerimaan($itemA->id, $bin->id, 5, 1500);

        // Baris sumber milik dokumen lain.
        [$other, $otherLine] = $this->makePostedPenerimaan($itemB->id, $bin->id, 5, 2000);
        $this->assertNotSame($source->id, $other->id);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $itemB->id, 'qty' => 1, 'from_bin_id' => $bin->id, 'source_line_id' => $otherLine->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.source_line_id');

        // Barang baris retur berbeda dari barang baris sumber.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $itemB->id, 'qty' => 1, 'from_bin_id' => $bin->id, 'source_line_id' => $sourceLine->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.source_line_id');
    }

    public function test_store_retur_pembelian_source_line_bin_mismatch_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $binA] = $this->makeLocation();
        [, , $binB] = $this->makeLocation();
        [$source, $sourceLine] = $this->makePostedPenerimaan($item->id, $binA->id, 5, 1500);
        $before = StockDocument::count();

        // Barang diterima di bin A, tapi retur memakai bin B → tolak.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $binB->id, 'source_line_id' => $sourceLine->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.from_bin_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_source_document_prohibited_for_non_retur_types(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        [$source] = $this->makePostedPenerimaan($item->id, $bin->id, 5, 1500);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'source_document_id' => $source->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('source_document_id');
    }

    public function test_store_retur_penjualan_draft_creates_document_without_movements(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Aneka Mandiri',
            'reference_no' => 'SJ-00456',
            'note' => 'Alasan: Salah Barang',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 7, 'unit_cost' => 1800, 'to_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.status', 'Draft')
                ->where('data.type', 'Retur Penjualan')
                ->where('data.partner', 'PT Aneka Mandiri')
                ->where('data.reference_no', 'SJ-00456')
                ->where('data.warehouse_id', $wh->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^RJ\/\d{4}\/\d{5}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.to_bin_id', $bin->id)
                ->where('data.lines.0.from_bin_id', null)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', 7));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_retur_penjualan_posted_moves_stock_in(): void
    {
        $item = $this->makeItem();
        [$wh, $rack, $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Aneka Mandiri',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'unit_cost' => 1800, 'to_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.posted_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.lines.0.qty', 3)
            ->assertJsonPath('data.lines.0.to_bin_id', $bin->id)
            ->assertJsonPath('data.lines.0.from_bin_id', null)
            ->assertJsonPath('data.lines.0.unit_cost', 1800);

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $doc->id,
            'direction' => 'IN',
            'qty' => 3,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'unit_cost' => 1800.0,
        ]);

        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'bin_id' => $bin->id,
            'stock' => 3,
        ]);
    }

    public function test_store_retur_penjualan_requires_to_bin(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.to_bin_id');

        $this->assertSame($before, StockDocument::count());
    }

    public function test_store_retur_penjualan_bin_not_in_warehouse_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();
        [, , $otherBin] = $this->makeLocation();
        $before = StockDocument::count();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 1, 'unit_cost' => 1000, 'to_bin_id' => $otherBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.to_bin_id');

        $this->assertSame($before, StockDocument::count());
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
