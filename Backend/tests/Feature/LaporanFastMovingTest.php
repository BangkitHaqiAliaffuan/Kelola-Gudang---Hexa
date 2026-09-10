<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class LaporanFastMovingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_returns_velocity_rows_with_expected_shape(): void
    {
        $item = $this->makeTrackedItem(stock: 50, min: 10, leadTime: 7);
        $this->addOut($item, qty: 30, daysAgo: 5);

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();
        $days = (int) (Carbon::parse($from)->startOfDay()
            ->diffInDays(Carbon::parse($to)->endOfDay()) + 1);
        $adu = round(30 / $days, 2);

        $res = $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'item_id', 'sku', 'name', 'unit', 'category',
                        'min', 'max', 'lead_time', 'cost',
                        'keluar_qty', 'frekuensi', 'nilai_keluar', 'unit_cost_avg_keluar',
                        'adu', 'days_of_cover', 'tersedia', 'reserved',
                        'prev_qty', 'trend_pct', 'butuh_reorder', 'risiko',
                    ],
                ],
                'meta' => ['total'],
            ])
            ->assertJsonPath('data.0.keluar_qty', 30)
            ->assertJsonPath('data.0.frekuensi', 1);

        // assertJsonPath strict terhadap int-vs-float JSON — bandingkan longgar.
        $row = $res->json('data.0');
        $this->assertEquals($adu, $row['adu']);
        $this->assertEquals(round(50 / $adu, 1), $row['days_of_cover']);
    }

    public function test_items_without_pengeluaran_in_period_are_excluded(): void
    {
        $mover = $this->makeTrackedItem(stock: 50, min: 10, leadTime: 7);
        $this->addOut($mover, qty: 10, daysAgo: 2);

        $idle = $this->makeTrackedItem(stock: 40, min: 5, leadTime: 7);
        // Movement jauh di luar periode — tidak boleh masuk laporan.
        $this->addOut($idle, qty: 99, daysAgo: 200);

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();

        $res = $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame($mover->id, $res->json('data.0.item_id'));
    }

    public function test_only_pengeluaran_out_feeds_velocity(): void
    {
        $item = $this->makeTrackedItem(stock: 50, min: 10, leadTime: 7);
        $this->addOut($item, qty: 40, daysAgo: 4, type: 'Transfer Gudang');
        $this->addOut($item, qty: 6, daysAgo: 3, type: 'Pengeluaran');

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();

        // Transfer adalah mekanik inventory, bukan demand — hanya 6 yang dihitung.
        $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk()
            ->assertJsonPath('data.0.keluar_qty', 6);
    }

    public function test_trend_compares_against_previous_period(): void
    {
        $item = $this->makeTrackedItem(stock: 100, min: 10, leadTime: 7);
        $this->addOut($item, qty: 20, daysAgo: 40); // periode lalu (30 hari sblm from)
        $this->addOut($item, qty: 30, daysAgo: 5);  // periode kini

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();

        $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk()
            ->assertJsonPath('data.0.keluar_qty', 30)
            ->assertJsonPath('data.0.prev_qty', 20)
            ->assertJsonPath('data.0.trend_pct', 50);
    }

    public function test_butuh_reorder_flags_cover_below_lead_time(): void
    {
        // ADU 10/hari, tersedia 20 → cover 2 hari < lead_time 7 → butuh reorder.
        $item = $this->makeTrackedItem(stock: 20, min: 5, leadTime: 7);
        $this->addOut($item, qty: 300, daysAgo: 5);

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();

        $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk()
            ->assertJsonPath('data.0.butuh_reorder', true);
    }

    public function test_warehouse_filter_scopes_velocity_and_stock(): void
    {
        $item = $this->makeTrackedItem(stock: 50, min: 10, leadTime: 7);
        $wh = $item->warehouse;
        $this->assertNotNull($wh);
        $other = Warehouse::factory()->create();
        $this->addOut($item, qty: 12, daysAgo: 2, warehouseId: $other->id);

        $from = now()->subDays(29)->toDateString();
        $to = now()->toDateString();

        // Tanpa filter: movement di gudang lain ikut terhitung.
        $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        // Filter ke gudang default item: tidak ada keluar di sana → 0 baris.
        $this->getJson("/api/laporan/fast-moving?from={$from}&to={$to}&per_page=100&warehouse_id={$wh->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    public function test_requires_valid_period(): void
    {
        $this->getJson('/api/laporan/fast-moving?per_page=10')->assertStatus(422);
        $this->getJson('/api/laporan/fast-moving?from=2026-09-10&to=2026-09-01')->assertStatus(422);
    }

    private function makeTrackedItem(int $stock, int $min, int $leadTime): Item
    {
        $unique = random_int(100000, 999999);
        $item = Item::factory()->create([
            'sku' => "SKU-FM-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-FM-{$unique}",
            'min_stock' => $min,
            'max_stock' => 1000,
            'lead_time' => $leadTime,
        ]);
        $wh = $item->warehouse ?? Warehouse::factory()->create();
        $item->update(['default_warehouse_id' => $wh->id]);
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $wh->id, 'bin_id' => $bin->id],
            ['stock' => $stock, 'reserved' => 0, 'unit_cost_avg' => 1000, 'updated_at' => now()]
        );

        return $item->refresh();
    }

    private function addOut(Item $item, int $qty, int $daysAgo, string $type = 'Pengeluaran', ?int $warehouseId = null): void
    {
        $wh = $warehouseId !== null
            ? Warehouse::find($warehouseId)
            : ($item->warehouse ?? Warehouse::factory()->create());
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        StockMovement::create([
            'item_id' => $item->id,
            'warehouse_id' => $wh->id,
            'rack_id' => $rack->id,
            'bin_id' => $bin->id,
            'direction' => 'OUT',
            'qty' => $qty,
            'movement_type' => $type,
            'reference_no' => 'BK/2026/00001',
            'partner' => 'Test',
            'unit_cost' => 1000,
            'pic' => 'Test',
            'note' => 'Test',
            'occurred_at' => now()->subDays($daysAgo),
        ]);
    }
}
