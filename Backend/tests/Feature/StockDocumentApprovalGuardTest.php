<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockDocumentApprovalGuardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_store_transfer_with_pending_approval_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [, , $toBin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Menunggu Approval',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $toBin->rack->warehouse_id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 2, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_store_pengeluaran_with_pending_approval_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Menunggu Approval',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'partner' => 'Departemen Produksi',
            'lines' => [
                ['item_id' => $item->id, 'qty' => -2, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_store_penerimaan_with_pending_approval_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Menunggu Approval',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_store_adjustment_with_pending_approval_still_allowed(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Menunggu Approval',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'to_bin_id' => $bin->id, 'reason_code' => 'location_error'],
            ],
        ])->assertStatus(201)->assertJsonPath('data.status', 'Menunggu Approval');
    }

    public function test_store_transfer_draft_still_allowed(): void
    {
        $item = $this->makeItem();
        [$wh, , $fromBin] = $this->makeLocation();
        [, , $toBin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'destination_warehouse_id' => $toBin->rack->warehouse_id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 2, 'from_bin_id' => $fromBin->id, 'to_bin_id' => $toBin->id],
            ],
        ])->assertStatus(201)->assertJsonPath('data.status', 'Draft');
    }

    private function makeItem(): Item
    {
        $unique = random_int(10000, 99999);

        return Item::factory()->create([
            'sku' => "SKU-GUARD-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-GUARD-{$unique}",
        ]);
    }

    /** @return array{0: Warehouse, 1: Rack, 2: Bin} */
    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$wh, $rack, $bin];
    }
}
