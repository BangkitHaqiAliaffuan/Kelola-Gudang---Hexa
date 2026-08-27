<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$wh, $rack, $bin];
    }

    private function makeItem(): Item
    {
        return Item::factory()->create();
    }

    public function test_stock_card_transfer_global_emits_both_legs_and_maintains_net_zero(): void
    {
        $item = $this->makeItem();
        [$whA, , $binA] = $this->makeLocation();
        [$whB, , $binB] = $this->makeLocation();

        // b) Injeksi 10 qty via Penerimaan Selesai ke Gudang A (mewakili Opname/Adjustment IN)
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-10',
            'warehouse_id' => $whA->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $binA->id],
            ],
        ])->assertStatus(201);

        // c) Transfer 4 qty A -> B
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $whA->id,
            'destination_warehouse_id' => $whB->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $binA->id, 'to_bin_id' => $binB->id],
            ],
        ])->assertStatus(201);

        // d) GET stock-card global (tanpa warehouse_id)
        $response = $this->getJson('/api/persediaan/stock-card?item_id='.$item->id);
        $response->assertOk();
        $data = $response->json('data');

        // e) Assert
        $this->assertSame(10, $data['saldo_akhir'], 'saldo_akhir harus tetap 10 (net zero transfer)');
        $this->assertNotEmpty($data['rows'], 'rows tidak kosong');

        $hasOut = false;
        $hasIn = false;
        foreach ($data['rows'] as $row) {
            if ($row['type'] === 'Transfer Gudang' && $row['direction'] === 'OUT' && (int) $row['keluar'] === 4) {
                $hasOut = true;
            }
            if ($row['type'] === 'Transfer Gudang' && $row['direction'] === 'IN' && (int) $row['masuk'] === 4) {
                $hasIn = true;
            }
        }
        $this->assertTrue($hasOut, 'Harus ada row OUT transfer 4');
        $this->assertTrue($hasIn, 'Harus ada row IN transfer 4 (global 2 legs)');

        $lastRow = end($data['rows']);
        $this->assertNotFalse($lastRow, 'rows.last harus ada');
        $this->assertSame($data['saldo_akhir'], $lastRow['saldo'], 'rows.last.saldo harus === saldo_akhir');

        $sumStock = (int) ItemStock::where('item_id', $item->id)->sum('stock');
        $this->assertSame($data['saldo_akhir'], $sumStock, 'ItemStock sum stock harus === saldo_akhir');
    }
}
