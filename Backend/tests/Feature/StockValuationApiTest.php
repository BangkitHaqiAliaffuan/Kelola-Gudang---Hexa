<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockValuationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_valuation_returns_rows_with_expected_shape(): void
    {
        $this->makeValuationItem();

        $this->getJson('/api/persediaan/valuation?per_page=500')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'item_id', 'sku', 'name', 'unit', 'category',
                        'min', 'max', 'cost',
                        'stock', 'reserved', 'available',
                        'unit_cost_fifo', 'unit_cost_avg', 'unit_cost_max',
                        'nilai_fifo', 'nilai_avg', 'nilai_max',
                        'last_move_at', 'moving',
                    ],
                ],
                'meta' => ['total'],
            ])
            ->assertJsonPath('meta.total', Item::count());
    }

    public function test_values_are_consistent_with_quantity_times_unit_cost(): void
    {
        $this->makeValuationItem(200, 1000);

        $rows = $this->getJson('/api/persediaan/valuation?per_page=500')->assertOk()->json('data');

        foreach ($rows as $row) {
            $stock = $row['stock'];
            $this->assertEqualsWithDelta($stock * $row['unit_cost_fifo'], $row['nilai_fifo'], 0.01, "{$row['sku']} FIFO");
            $this->assertEqualsWithDelta($stock * $row['unit_cost_avg'], $row['nilai_avg'], 0.01, "{$row['sku']} Average");
            $this->assertEqualsWithDelta($stock * $row['unit_cost_max'], $row['nilai_max'], 0.01, "{$row['sku']} Max");
        }
    }

    public function test_moving_is_one_of_the_four_buckets(): void
    {
        $this->makeValuationItem();

        $rows = $this->getJson('/api/persediaan/valuation?per_page=500')->assertOk()->json('data');

        foreach ($rows as $row) {
            $this->assertContains($row['moving'], ['Fast', 'Medium', 'Slow', 'Dead'], "{$row['sku']} moving");
        }
    }

    public function test_available_never_negative(): void
    {
        $this->makeValuationItem();

        $rows = $this->getJson('/api/persediaan/valuation?per_page=500')->assertOk()->json('data');

        collect($rows)->each(function (array $row) {
            $this->assertGreaterThanOrEqual(0, $row['available']);
        });
    }

    public function test_category_filter_scopes_rows(): void
    {
        $item = $this->makeValuationItem();

        $this->getJson('/api/persediaan/valuation?category_id='.$item->category_id)
            ->assertOk()
            ->assertJsonPath('meta.total', Item::where('category_id', $item->category_id)->count());
    }

    public function test_search_scopes_rows(): void
    {
        $item = $this->makeValuationItem();

        $this->getJson('/api/persediaan/valuation?search='.urlencode((string) $item->sku))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.item_id', $item->id);
    }

    public function test_warehouse_filter_scopes_valuation(): void
    {
        $item = Item::factory()->create([
            'sku' => 'SKU-VAL-WH-001',
            'barcode' => '8990000000999',
            'internal_barcode' => 'IB-VAL-WH-001',
            'cost' => 0,
        ]);
        $wh1 = Warehouse::factory()->create();
        $rack1 = Rack::factory()->create(['warehouse_id' => $wh1->id]);
        $bin1 = Bin::factory()->create(['rack_id' => $rack1->id]);
        $wh2 = Warehouse::factory()->create();
        $rack2 = Rack::factory()->create(['warehouse_id' => $wh2->id]);
        $bin2 = Bin::factory()->create(['rack_id' => $rack2->id]);

        $base = CarbonImmutable::parse('2026-08-01 08:00:00');
        $movements = [
            [$wh1, $rack1, $bin1, 10, $base],
            [$wh2, $rack2, $bin2, 5, $base->addMinutes(10)],
        ];

        foreach ($movements as [$wh, $rack, $bin, $qty, $when]) {
            StockMovement::create([
                'item_id' => $item->id,
                'warehouse_id' => $wh->id,
                'rack_id' => $rack->id,
                'bin_id' => $bin->id,
                'direction' => 'IN',
                'qty' => $qty,
                'movement_type' => 'Penerimaan',
                'reference_no' => 'BM/2026/'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
                'partner' => 'Test',
                'unit_cost' => 1000,
                'pic' => 'Test',
                'note' => 'Test',
                'occurred_at' => $when,
            ]);
        }

        (new StockLedger)->rebuildForItem($item->id);

        $r1 = $this->getJson("/api/persediaan/valuation?warehouse_id={$wh1->id}&per_page=500")
            ->assertOk()
            ->json('data');

        $r2 = $this->getJson("/api/persediaan/valuation?warehouse_id={$wh2->id}&per_page=500")
            ->assertOk()
            ->json('data');

        $this->assertNotEmpty($r1, 'Warehouse 1 should have valuation rows.');
        $this->assertNotEmpty($r2, 'Warehouse 2 should have valuation rows.');

        foreach ($r1 as $row) {
            $expected = (int) ItemStock::where('item_id', $row['item_id'])
                ->where('warehouse_id', $wh1->id)
                ->sum('stock');
            $this->assertSame(
                $expected,
                $row['stock'],
                "stock for {$row['sku']} in warehouse {$wh1->id} should be {$expected}, got {$row['stock']}"
            );
        }

        $allSame = true;
        foreach ($r1 as $row1) {
            $row2 = collect($r2)->firstWhere('item_id', $row1['item_id']);
            if ($row2 && $row1['stock'] !== $row2['stock']) {
                $allSame = false;
                break;
            }
        }
        $this->assertFalse(
            $allSame,
            'stock should differ for at least one item between warehouses — warehouse filter is broken.'
        );
    }

    private function makeValuationItem(int $qty = 200, float $cost = 1000): Item
    {
        $unique = random_int(10000, 99999);
        $item = Item::factory()->create([
            'sku' => "SKU-VAL-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-VAL-{$unique}",
            'cost' => $cost,
        ]);
        $wh = $item->default_warehouse ?? Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        StockMovement::create([
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'direction' => 'IN',
            'qty' => $qty,
            'movement_type' => 'Penerimaan',
            'reference_no' => 'BM/2026/'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'partner' => 'Test',
            'unit_cost' => $cost,
            'pic' => 'Test',
            'note' => 'Test',
            'occurred_at' => now()->subDays(5),
        ]);

        (new StockLedger)->rebuildForItem($item->id);

        return $item;
    }
}
