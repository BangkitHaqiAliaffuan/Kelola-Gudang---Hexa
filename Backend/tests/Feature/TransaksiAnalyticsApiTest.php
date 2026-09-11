<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Supplier;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransaksiAnalyticsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_penerimaan_varians_harga_dan_aktivitas(): void
    {
        // Mengunci output seksi yang direfactor Fase 2.3 (variansHarga agregat
        // SQL + aktivitas single-pass): avg, varians vs master cost, tanggal
        // terakhir, dan status aktivitas harus identik dengan implementasi lama.
        $unique = random_int(10000, 99999);
        $item = Item::factory()->create([
            'sku' => "SKU-VAR-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-VAR-{$unique}",
            'cost' => 1000,
        ]);
        [$wh, , $bin] = $this->makeLocation();
        $sup = Supplier::factory()->create(['name' => 'PT Varians Uji']);

        foreach ([['2026-07-10', 10, 1000.0], ['2026-07-20', 10, 1200.0]] as [$date, $qty, $cost]) {
            $this->postJson('/api/persediaan/stock-documents', [
                'type' => 'Penerimaan',
                'status' => 'Selesai',
                'document_date' => $date,
                'warehouse_id' => $wh->id,
                'partner' => $sup->name,
                'lines' => [['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id]],
            ])->assertStatus(201);
        }

        $data = $this->getJson('/api/laporan/transaksi-analytics?type=Penerimaan&from=2026-07-01&to=2026-07-31')
            ->assertOk()
            ->json('data');

        $row = collect($data['varians_harga'])
            ->firstWhere(fn ($r) => $r['supplier'] === $sup->name && $r['item_id'] === $item->id);
        $this->assertNotNull($row, 'Baris varians supplier+item tidak ditemukan.');
        $this->assertSame(20, $row['qty']);
        $this->assertEqualsWithDelta(1100.0, $row['avg_harga'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $row['master_cost'], 0.01);
        $this->assertEqualsWithDelta(10.0, $row['varians_pct'], 0.01);

        $aktivitas = collect($data['aktivitas'])->firstWhere('nama', $sup->name);
        $this->assertNotNull($aktivitas, 'Baris aktivitas supplier tidak ditemukan.');
        $this->assertSame(2, $aktivitas['dokumen']);
        $this->assertSame('2026-07-20', $aktivitas['terakhir']);
        $this->assertSame('aktif', $aktivitas['status']);
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
