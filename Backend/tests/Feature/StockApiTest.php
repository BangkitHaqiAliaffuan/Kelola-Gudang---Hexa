<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemStock;
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
            }
        }
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
