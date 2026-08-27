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

    public function test_penerimaan_without_bin_uses_document_warehouse_not_item_default(): void
    {
        // Item default di Gudang Medan, dokumen Penerimaan ke Sidoarjo tanpa to_bin
        [$whMedan, , $binMedan] = $this->makeLocation();
        [$whSidoarjo, , ] = $this->makeLocation();
        // Pastikan whSidoarjo berbeda dari Medan
        $item = Item::factory()->create([
            'default_warehouse_id' => $whMedan->id,
            'default_bin_id' => $binMedan->id,
        ]);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $whSidoarjo->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000],
            ],
        ])->assertStatus(201);

        $doc = \App\Models\StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $mov = \App\Models\StockMovement::where('stock_document_id', $doc->id)->firstOrFail();
        $this->assertSame($whSidoarjo->id, $mov->warehouse_id, 'warehouse_id harus ikut dokumen Sidoarjo, bukan default Medan');
        // bin_id tetap dari item default (atau null) - tidak diubah
        $this->assertSame($binMedan->id, $mov->bin_id);
    }

    public function test_penerimaan_with_matching_bin_still_correct(): void
    {
        [$wh, $rack, $bin] = $this->makeLocation();
        $item = Item::factory()->create([
            'default_warehouse_id' => $wh->id,
            'default_bin_id' => $bin->id,
        ]);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 7, 'unit_cost' => 1500, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);

        $doc = \App\Models\StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $mov = \App\Models\StockMovement::where('stock_document_id', $doc->id)->firstOrFail();
        $this->assertSame($wh->id, $mov->warehouse_id);
        $this->assertSame($bin->id, $mov->bin_id);
    }

    public function test_transfer_uses_document_warehouses_not_bin_warehouses(): void
    {
        [$whA, , $binA] = $this->makeLocation();
        [$whB, , $binB] = $this->makeLocation();
        // Item default di whA agar fallback bin tidak mengacaukan
        $item = \App\Models\Item::factory()->create([
            'default_warehouse_id' => $whA->id,
            'default_bin_id' => $binA->id,
        ]);

        // Inject stock dulu ke whA
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $whA->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 2000, 'to_bin_id' => $binA->id],
            ],
        ])->assertStatus(201);

        // Transfer whA -> whB dengan bin yang benar (binA di whA, binB di whB)
        // Sebelum fix, warehouse_id diambil dari bin->rack->warehouse_id (kebetulan sama dengan dokumen karena bin benar),
        // tapi test ini memastikan setelah fix tetap benar dan tidak regresi.
        // Untuk simulasi fallback, buat transfer tanpa to_bin (null) -> bin fallback ke item default (whA) tapi warehouse harus tetap whB
        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $whA->id,
            'destination_warehouse_id' => $whB->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'from_bin_id' => $binA->id, 'to_bin_id' => $binB->id],
            ],
        ])->assertStatus(201);

        $doc = \App\Models\StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $out = \App\Models\StockMovement::where('stock_document_id', $doc->id)->where('direction', 'OUT')->firstOrFail();
        $in = \App\Models\StockMovement::where('stock_document_id', $doc->id)->where('direction', 'IN')->firstOrFail();
        $this->assertSame($whA->id, $out->warehouse_id, 'OUT warehouse_id harus document.warehouse_id');
        $this->assertSame($whB->id, $in->warehouse_id, 'IN warehouse_id harus document.destination_warehouse_id');
        $this->assertSame($binA->id, $out->bin_id);
        $this->assertSame($binB->id, $in->bin_id);

        // Transfer tanpa to_bin (null) -> fallback bin = item default (whA) tapi warehouse harus tetap whB (destination)
        $res2 = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $whA->id,
            'destination_warehouse_id' => $whB->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 2, 'from_bin_id' => $binA->id],
            ],
        ])->assertStatus(201);
        $doc2 = \App\Models\StockDocument::where('no', $res2->json('data.no'))->firstOrFail();
        $in2 = \App\Models\StockMovement::where('stock_document_id', $doc2->id)->where('direction', 'IN')->firstOrFail();
        $this->assertSame($whB->id, $in2->warehouse_id, 'IN tanpa to_bin: warehouse harus tetap destination, bukan fallback bin warehouse');
    }
}
