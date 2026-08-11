<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_index_returns_complete_stock_rows(): void
    {
        $this->getJson('/api/persediaan/stock?per_page=500')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'item_id', 'sku', 'name', 'unit', 'min', 'max', 'cost',
                        'warehouse', 'rack', 'bin', 'stock', 'reserved', 'available',
                        'nilai', 'status',
                    ],
                ],
                'meta' => ['total'],
            ])
            ->assertJsonPath('meta.total', ItemStock::count());

        $row = ItemStock::query()->with(['item', 'warehouse', 'bin'])->first();
        $this->assertNotNull($row->item);
        $this->assertNotNull($row->warehouse);
        $this->assertNotNull($row->bin);
    }

    public function test_index_filters(): void
    {
        $row = ItemStock::query()->with('item')->first();

        $this->getJson('/api/persediaan/stock?search='.urlencode((string) $row->item->sku))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.item_id', $row->item_id);

        $this->getJson('/api/persediaan/stock?warehouse_id='.$row->warehouse_id)
            ->assertOk()
            ->assertJsonPath('meta.total', ItemStock::where('warehouse_id', $row->warehouse_id)->count());

        $this->getJson('/api/persediaan/stock?category_id='.$row->item->category_id)
            ->assertOk()
            ->assertJsonPath('meta.total', ItemStock::whereHas('item', fn ($q) => $q->where('category_id', $row->item->category_id))->count());

        $this->getJson('/api/persediaan/stock?status=Habis')
            ->assertOk()
            ->assertJsonPath('meta.total', ItemStock::where('stock', 0)->count());
    }

    public function test_stock_card_is_balanced(): void
    {
        $item = Item::query()->whereHas('itemStocks', fn ($q) => $q->where('stock', '>', 0))->firstOrFail();

        $response = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id);
        $response->assertOk();
        $data = $response->json('data');

        $this->assertSame($data['item']['current_stock'], $data['saldo_akhir']);

        $masuk = array_sum(array_column($data['rows'], 'masuk'));
        $keluar = array_sum(array_column($data['rows'], 'keluar'));
        $this->assertSame($data['saldo_awal'] + $masuk - $keluar, $data['saldo_akhir']);

        $prevDate = null;
        foreach ($data['rows'] as $row) {
            $this->assertGreaterThanOrEqual(0, $row['saldo']);
            $this->assertSame($row['masuk'] > 0 || $row['keluar'] > 0, true);
            if ($prevDate !== null) {
                $this->assertGreaterThanOrEqual($prevDate, $row['date']);
            }
            $prevDate = $row['date'];
        }
    }

    public function test_stock_card_respects_date_range(): void
    {
        $item = Item::query()->firstOrFail();
        $full = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id)->json('data');
        $this->assertGreaterThan(1, count($full['rows']));

        $index = min(5, count($full['rows']) - 1);
        $from = $full['rows'][$index]['date'];

        $range = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&from='.urlencode($from))->json('data');

        $expectedOpening = $index > 0 ? $full['rows'][$index - 1]['saldo'] : 0;
        $this->assertSame($expectedOpening, $range['saldo_awal']);
        $this->assertSame($full['saldo_akhir'], $range['saldo_akhir']);
        $this->assertSame(count($full['rows']) - $index, count($range['rows']));
    }

    public function test_stock_card_methods(): void
    {
        $item = Item::query()->whereHas('itemStocks', fn ($q) => $q->where('stock', '>', 0))->firstOrFail();

        foreach (['FIFO', 'Average', 'Maximum Cost'] as $method) {
            $data = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&method='.urlencode($method))
                ->assertOk()
                ->assertJsonPath('data.method', $method)
                ->json('data');

            foreach ($data['rows'] as $row) {
                $this->assertGreaterThanOrEqual(0, $row['nilai']);
                $this->assertGreaterThanOrEqual(0, $row['method_cost']);
            }
        }
    }

    public function test_stock_card_valuation_methods(): void
    {
        $item = Item::factory()->create([
            'sku' => 'SKU-TEST-001',
            'barcode' => '8990000000001',
            'internal_barcode' => 'IB-401',
            'cost' => 0,
        ]);
        $warehouse = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $warehouse->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $warehouse->id, 'bin_id' => $bin->id],
            ['stock' => 250, 'reserved' => 0, 'unit_cost_avg' => 2100, 'updated_at' => now()]
        );

        $base = CarbonImmutable::parse('2026-08-01 08:00:00');
        $movements = [
            ['IN', 100, 1000, 'Penerimaan', 'BM/2026/00001', $base],
            ['IN', 100, 2000, 'Penerimaan', 'BM/2026/00002', $base->addMinutes(10)],
            ['OUT', 50, 1500, 'Pengeluaran', 'BK/2026/00001', $base->addMinutes(20)],
            ['IN', 100, 3000, 'Penerimaan', 'BM/2026/00003', $base->addMinutes(30)],
        ];

        foreach ($movements as [$direction, $qty, $cost, $type, $no, $when]) {
            StockMovement::create([
                'item_id' => $item->id,
                'warehouse_id' => $warehouse->id,
                'rack_id' => $rack->id,
                'bin_id' => $bin->id,
                'direction' => $direction,
                'qty' => $qty,
                'movement_type' => $type,
                'reference_no' => $no,
                'partner' => 'Test',
                'unit_cost' => $cost,
                'pic' => 'Test',
                'note' => 'Test',
                'occurred_at' => $when,
            ]);
        }

        // FIFO — layers peeled oldest-first; ending value = remaining layers.
        $fifo = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&method=FIFO')
            ->assertOk()
            ->json('data');
        $this->assertSame(0, $fifo['saldo_awal']);
        $this->assertSame(250, $fifo['saldo_akhir']);
        $this->assertCount(4, $fifo['rows']);
        $this->assertEqualsWithDelta(100000.0, $fifo['rows'][0]['nilai'], 0.01); // 100 @ 1000
        $this->assertEqualsWithDelta(300000.0, $fifo['rows'][1]['nilai'], 0.01); // 200 @ 1500
        $this->assertEqualsWithDelta(250000.0, $fifo['rows'][2]['nilai'], 0.01); // 50@1000 + 100@2000
        $this->assertEqualsWithDelta(550000.0, $fifo['rows'][3]['nilai'], 0.01); // + 100@3000
        $this->assertEqualsWithDelta(1666.67, $fifo['rows'][2]['method_cost'], 0.01);
        $this->assertEqualsWithDelta(2200.0, $fifo['rows'][3]['method_cost'], 0.01);

        // Moving average (perpetual) — avg re-computed per purchase, unchanged on OUT.
        $avg = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&method='.urlencode('Average'))
            ->assertOk()
            ->json('data');
        $this->assertEqualsWithDelta(1000.0, $avg['rows'][0]['method_cost'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $avg['rows'][1]['method_cost'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $avg['rows'][2]['method_cost'], 0.01); // OUT doesn't change avg
        $this->assertEqualsWithDelta(2100.0, $avg['rows'][3]['method_cost'], 0.01); // (225000+300000)/250
        $this->assertEqualsWithDelta(525000.0, $avg['rows'][3]['nilai'], 0.01);

        // Maximum Cost — max purchase cost × saldo.
        $max = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&method='.urlencode('Maximum Cost'))
            ->assertOk()
            ->json('data');
        $this->assertEqualsWithDelta(3000.0, $max['rows'][3]['method_cost'], 0.01);
        $this->assertEqualsWithDelta(750000.0, $max['rows'][3]['nilai'], 0.01);
    }

    public function test_stock_card_valuation_carries_across_from_boundary(): void
    {
        $item = Item::factory()->create([
            'sku' => 'SKU-TEST-002',
            'barcode' => '8990000000002',
            'internal_barcode' => 'IB-402',
            'cost' => 0,
        ]);
        $warehouse = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $warehouse->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $base = CarbonImmutable::parse('2026-08-01 08:00:00');
        $movements = [
            ['IN', 100, 1000, 'Penerimaan', 'BM/2026/00001', $base],
            ['IN', 100, 2000, 'Penerimaan', 'BM/2026/00002', $base->addMinutes(10)],
            ['OUT', 50, 1500, 'Pengeluaran', 'BK/2026/00001', $base->addMinutes(20)],
            ['IN', 100, 3000, 'Penerimaan', 'BM/2026/00003', $base->addMinutes(30)],
        ];

        foreach ($movements as [$direction, $qty, $cost, $type, $no, $when]) {
            StockMovement::create([
                'item_id' => $item->id,
                'warehouse_id' => $warehouse->id,
                'rack_id' => $rack->id,
                'bin_id' => $bin->id,
                'direction' => $direction,
                'qty' => $qty,
                'movement_type' => $type,
                'reference_no' => $no,
                'partner' => 'Test',
                'unit_cost' => $cost,
                'pic' => 'Test',
                'note' => 'Test',
                'occurred_at' => $when,
            ]);
        }

        // `from` after the OUT — opening layers (50@1000, 100@2000) must carry in.
        $from = urlencode($movements[2][5]->addMinutes(1)->toIso8601String());

        $fifo = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&from='.$from.'&method=FIFO')
            ->assertOk()
            ->json('data');
        $this->assertSame(150, $fifo['saldo_awal']);
        $this->assertSame(250, $fifo['saldo_akhir']);
        $this->assertCount(1, $fifo['rows']);
        $this->assertEqualsWithDelta(550000.0, $fifo['rows'][0]['nilai'], 0.01);

        $avg = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id.'&from='.$from.'&method='.urlencode('Average'))
            ->assertOk()
            ->json('data');
        $this->assertSame(150, $avg['saldo_awal']);
        $this->assertEqualsWithDelta(2100.0, $avg['rows'][0]['method_cost'], 0.01);
        $this->assertEqualsWithDelta(525000.0, $avg['rows'][0]['nilai'], 0.01);
    }

    public function test_stock_card_requires_valid_item(): void
    {
        $this->getJson('/api/persediaan/stock-card')
            ->assertStatus(422)
            ->assertJsonValidationErrors('item_id');

        $this->getJson('/api/persediaan/stock-card?item_id=999999')
            ->assertStatus(422)
            ->assertJsonValidationErrors('item_id');
    }
}
