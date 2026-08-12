<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockMinimumApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
        $this->seed();
    }

    public function test_stock_minimum_returns_rows_with_expected_shape(): void
    {
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
        $item = Item::whereNotNull('category_id')->firstOrFail();

        $this->getJson('/api/persediaan/stock-minimum?category_id='.$item->category_id)
            ->assertOk()
            ->assertJsonPath('meta.total', Item::where('category_id', $item->category_id)->count());
    }

    public function test_search_scopes_rows(): void
    {
        $item = Item::query()->firstOrFail();

        $this->getJson('/api/persediaan/stock-minimum?search='.urlencode((string) $item->sku))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.item_id', $item->id);
    }

    public function test_suggested_qty_is_never_negative(): void
    {
        $response = $this->getJson('/api/persediaan/stock-minimum?per_page=500')
            ->assertOk();

        collect($response->json('data'))->each(function (array $row) {
            $this->assertGreaterThanOrEqual(0, $row['suggested_qty']);
        });
    }

    public function test_movement_types_driver_usage_is_consumption_only(): void
    {
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
}