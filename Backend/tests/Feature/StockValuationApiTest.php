<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockValuationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
        $this->seed();
    }

    public function test_valuation_returns_rows_with_expected_shape(): void
    {
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
        $rows = $this->getJson('/api/persediaan/valuation?per_page=500')->assertOk()->json('data');

        foreach ($rows as $row) {
            $this->assertContains($row['moving'], ['Fast', 'Medium', 'Slow', 'Dead'], "{$row['sku']} moving");
        }
    }

    public function test_available_never_negative(): void
    {
        $rows = $this->getJson('/api/persediaan/valuation?per_page=500')->assertOk()->json('data');

        collect($rows)->each(function (array $row) {
            $this->assertGreaterThanOrEqual(0, $row['available']);
        });
    }

    public function test_category_filter_scopes_rows(): void
    {
        $item = Item::whereNotNull('category_id')->firstOrFail();

        $this->getJson('/api/persediaan/valuation?category_id='.$item->category_id)
            ->assertOk()
            ->assertJsonPath('meta.total', Item::where('category_id', $item->category_id)->count());
    }

    public function test_search_scopes_rows(): void
    {
        $item = Item::query()->firstOrFail();

        $this->getJson('/api/persediaan/valuation?search='.urlencode((string) $item->sku))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.item_id', $item->id);
    }

    public function test_warehouse_filter_scopes_valuation(): void
    {
        // Pick two warehouses that each have stock movements.
        $warehouseIds = StockMovement::distinct()->pluck('warehouse_id')->take(2);
        if ($warehouseIds->count() < 2) {
            $this->markTestSkipped('Need at least 2 warehouses with movements.');
        }

        [$wh1Id, $wh2Id] = [$warehouseIds->first(), $warehouseIds->last()];

        $r1 = $this->getJson("/api/persediaan/valuation?warehouse_id={$wh1Id}&per_page=500")
            ->assertOk()
            ->json('data');

        $r2 = $this->getJson("/api/persediaan/valuation?warehouse_id={$wh2Id}&per_page=500")
            ->assertOk()
            ->json('data');

        // Both warehouses must return rows.
        $this->assertNotEmpty($r1, 'Warehouse 1 should have valuation rows.');
        $this->assertNotEmpty($r2, 'Warehouse 2 should have valuation rows.');

        // For each item in wh1, stock must equal item_stock.sum(stock) for that warehouse.
        foreach ($r1 as $row) {
            $expected = (int) ItemStock::where('item_id', $row['item_id'])
                ->where('warehouse_id', $wh1Id)
                ->sum('stock');
            $this->assertSame(
                $expected,
                $row['stock'],
                "stock for {$row['sku']} in warehouse {$wh1Id} should be {$expected}, got {$row['stock']}"
            );
        }

        // At least one item must have a different stock between the two warehouses.
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
}
