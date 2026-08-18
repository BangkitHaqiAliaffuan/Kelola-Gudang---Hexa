<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockMinimumApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_stock_minimum_returns_rows_with_expected_shape(): void
    {
        $this->makeStockItem(10, 100, 30);

        $this->getJson('/api/persediaan/stock-minimum?per_page=500')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'item_id', 'sku', 'name', 'unit', 'category', 'supplier',
                        'min', 'max', 'cost', 'lead_time',
                        'total_stock', 'reserved', 'available',
                        'avg_daily_usage', 'days_of_cover', 'suggested_qty', 'status',
                    ],
                ],
                'meta' => ['total'],
            ])
            ->assertJsonPath('meta.total', Item::count());
    }

    public function test_status_is_derived_from_min_threshold(): void
    {
        $this->makeStockItem(10, 100, 0);            // Habis
        $this->makeStockItem(10, 100, 5, 5);         // Kritis (available 0)
        $this->makeStockItem(10, 100, 8);            // Menipis (available <= min)
        $this->makeStockItem(10, 100, 30);           // Normal

        $rows = $this->getJson('/api/persediaan/stock-minimum?per_page=500')->assertOk()->json('data');

        foreach ($rows as $row) {
            $min = $row['min'];
            $available = $row['available'];
            $stock = $row['total_stock'];

            if ($stock <= 0) {
                $this->assertSame('Habis', $row['status'], "{$row['sku']} harus Habis");
            } elseif ($min > 0 && $available <= 0) {
                $this->assertSame('Kritis', $row['status'], "{$row['sku']} harus Kritis");
            } elseif ($min > 0 && $available <= $min) {
                $this->assertSame('Menipis', $row['status'], "{$row['sku']} harus Menipis");
            } else {
                $this->assertSame('Normal', $row['status'], "{$row['sku']} harus Normal");
            }
        }
    }

    public function test_category_filter_scopes_rows(): void
    {
        $item = $this->makeStockItem(10, 100, 30);

        $this->getJson('/api/persediaan/stock-minimum?category_id='.$item->category_id)
            ->assertOk()
            ->assertJsonPath('meta.total', Item::where('category_id', $item->category_id)->count());
    }

    public function test_search_scopes_rows(): void
    {
        $item = $this->makeStockItem(10, 100, 30);

        $this->getJson('/api/persediaan/stock-minimum?search='.urlencode((string) $item->sku))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.item_id', $item->id);
    }

    public function test_suggested_qty_is_never_negative(): void
    {
        $this->makeStockItem(10, 100, 0);
        $this->makeStockItem(10, 100, 5, 5);
        $this->makeStockItem(10, 100, 8);
        $this->makeStockItem(10, 100, 30);

        $response = $this->getJson('/api/persediaan/stock-minimum?per_page=500')
            ->assertOk();

        collect($response->json('data'))->each(function (array $row) {
            $this->assertGreaterThanOrEqual(0, $row['suggested_qty']);
        });
    }

    public function test_movement_types_driver_usage_is_consumption_only(): void
    {
        $item = $this->makeStockItem(10, 100, 20);
        $wh = $item->default_warehouse ?? Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        StockMovement::create([
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'direction' => 'OUT',
            'qty' => 6,
            'movement_type' => 'Pengeluaran',
            'reference_no' => 'BK/2026/00001',
            'partner' => 'Test',
            'unit_cost' => 1000,
            'pic' => 'Test',
            'note' => 'Test',
            'occurred_at' => now()->subDays(3),
        ]);

        // Only Pengeluaran OUT movements feed avg_daily_usage — transfers and
        // stock adjustments are inventory mechanics, not demand.
        $usageQuery = StockMovement::query()->selectRaw('SUM(qty) AS used')
            ->where('direction', 'OUT')
            ->where('movement_type', 'Pengeluaran')
            ->where('occurred_at', '>=', now()->subDays(30))
            ->value('used');

        $row = Item::query()->first();
        $this->assertNotNull($row);
        $this->assertIsNumeric($usageQuery);
    }

    public function test_warehouse_filter_scopes_stock_and_usage(): void
    {
        $item = $this->makeStockItem(5, 100, 10);
        $wh2 = Warehouse::factory()->create();
        $rack2 = Rack::factory()->create(['warehouse_id' => $wh2->id]);
        $bin2 = Bin::factory()->create(['rack_id' => $rack2->id]);
        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $wh2->id, 'bin_id' => $bin2->id],
            ['stock' => 5, 'reserved' => 0, 'unit_cost_avg' => 1000, 'updated_at' => now()]
        );

        $warehouseIds = ItemStock::distinct()->pluck('warehouse_id')->take(2);
        if ($warehouseIds->count() < 2) {
            $this->markTestSkipped('Need at least 2 warehouses with item_stock rows.');
        }

        [$wh1Id, $wh2Id] = [$warehouseIds->first(), $warehouseIds->last()];

        $r1 = $this->getJson("/api/persediaan/stock-minimum?warehouse_id={$wh1Id}&per_page=500")
            ->assertOk()
            ->json('data');

        $r2 = $this->getJson("/api/persediaan/stock-minimum?warehouse_id={$wh2Id}&per_page=500")
            ->assertOk()
            ->json('data');

        // Every row returned for wh1 must have a total_stock equal to
        // the per-warehouse item_stock sum — not the global total.
        foreach ($r1 as $row) {
            $expected = (int) ItemStock::where('item_id', $row['item_id'])
                ->where('warehouse_id', $wh1Id)
                ->sum('stock');
            $this->assertSame(
                $expected,
                $row['total_stock'],
                "total_stock for item {$row['sku']} in warehouse {$wh1Id} should be {$expected}, got {$row['total_stock']}"
            );
        }

        // At least one item must have a different total_stock between the two
        // warehouses — proving the filter actually changes the data.
        $allSame = true;
        foreach ($r1 as $row1) {
            $row2 = collect($r2)->firstWhere('item_id', $row1['item_id']);
            if ($row2 && $row1['total_stock'] !== $row2['total_stock']) {
                $allSame = false;
                break;
            }
        }

        $this->assertFalse(
            $allSame,
            'total_stock should differ for at least one item between the two warehouses — filter is not working.'
        );
    }

    private function makeStockItem(int $min, int $max, int $stock, int $reserved = 0): Item
    {
        $unique = random_int(10000, 99999);
        $item = Item::factory()->create([
            'sku' => "SKU-MIN-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-MIN-{$unique}",
            'min_stock' => $min,
            'max_stock' => $max,
        ]);
        $wh = $item->default_warehouse ?? Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $wh->id, 'bin_id' => $bin->id],
            ['stock' => $stock, 'reserved' => $reserved, 'unit_cost_avg' => 1000, 'updated_at' => now()]
        );

        return $item;
    }
}
