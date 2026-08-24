<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LaporanMutasiApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_requires_laporan_baca(): void
    {
        // No auth -> 401, but with auth but without Laporan -> 403
        // Use a user with only Persediaan to verify Laporan gate
        $user = \App\Models\User::factory()->create(['role' => 'NoLaporan', 'is_active' => true]);
        \App\Models\RolePermission::firstOrCreate(['role' => 'NoLaporan', 'module' => 'Persediaan'], ['level' => 'Baca']);
        \Laravel\Sanctum\Sanctum::actingAs($user, ['*'], 'sanctum');

        $this->getJson('/api/laporan/mutasi?from=2026-07-01&to=2026-07-31')->assertForbidden();
    }

    public function test_mutasi_returns_opening_closing(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10, 1000);

        // Opening 10, then masuk 5 within period
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-15',
            'warehouse_id' => $wh->id,
            'partner' => 'PT A',
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/mutasi?from=2026-07-10&to=2026-07-20&per_page=500')->assertOk();

        $row = collect($res->json('data'))->firstWhere('item_id', $item->id);
        $this->assertNotNull($row);
        $this->assertEquals(10, $row['saldo_awal']);
        $this->assertEquals(5, $row['masuk']);
        $this->assertEquals(0, $row['keluar']);
        $this->assertEquals(15, $row['saldo_akhir']);
    }

    public function test_mutasi_filters_by_warehouse(): void
    {
        $item = $this->makeItem();
        [$wh1, , $bin1] = $this->makeLocation();
        [$wh2, , $bin2] = $this->makeLocation();
        $this->seedInbound($item, $wh1, $bin1, 10);
        $this->seedInbound($item, $wh2, $bin2, 20);

        $resAll = $this->getJson('/api/laporan/mutasi?from=2026-01-01&to=2026-12-31&per_page=500')->assertOk();
        $rowAll = collect($resAll->json('data'))->firstWhere('item_id', $item->id);
        $this->assertEquals(30, $rowAll['saldo_akhir']);

        $resWh1 = $this->getJson("/api/laporan/mutasi?from=2026-01-01&to=2026-12-31&warehouse_id={$wh1->id}&per_page=500")->assertOk();
        $rowWh1 = collect($resWh1->json('data'))->firstWhere('item_id', $item->id);
        $this->assertEquals(10, $rowWh1['saldo_akhir']);
    }

    public function test_mutasi_search(): void
    {
        $itemA = $this->makeItem(['name' => 'Kabel Unik A', 'sku' => 'SKU-UNIK-A']);
        $itemB = $this->makeItem(['name' => 'Kabel Unik B', 'sku' => 'SKU-UNIK-B']);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($itemA, $wh, $bin, 5);
        $this->seedInbound($itemB, $wh, $bin, 5);

        $res = $this->getJson('/api/laporan/mutasi?from=2026-01-01&to=2026-12-31&search=UNIK-A&per_page=500')->assertOk();
        $this->assertEquals(1, count($res->json('data')));
        $this->assertEquals($itemA->id, $res->json('data.0.item_id'));
    }

    private function makeItem(array $overrides = []): Item
    {
        return Item::factory()->create(array_merge([
            'cost' => 1000,
            'price' => 1500,
        ], $overrides));
    }

    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);
        return [$wh, $rack, $bin];
    }

    private function seedInbound(Item $item, Warehouse $wh, Bin $bin, int $qty, float $cost = 1000.0): void
    {
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [
                ['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);
    }
}
