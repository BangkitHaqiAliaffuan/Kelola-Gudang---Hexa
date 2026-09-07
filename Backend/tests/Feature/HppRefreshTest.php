<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Rack;
use App\Models\RolePermission;
use App\Models\StockDocumentLine;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HppRefreshTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_post_draft_lama_memakai_rata_rata_terbaru(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create();

        // Draft dibuat saat rata-rata masih 1000.
        $draft = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);
        $this->assertEquals(1000.0, (float) $draft->json('data.lines.0.unit_cost'));

        // Penerimaan baru menggeser rata-rata: (100*1000 + 100*3000)/200 = 2000.
        $this->seedInbound($item, $wh, $bin, 100, 3000, '2026-07-12');

        $posted = $this->postJson("/api/persediaan/stock-documents/{$draft->json('data.id')}/post")->assertOk();

        // Baris disegarkan ke rata-rata posting; movement dan value konsisten.
        $this->assertEquals(2000.0, (float) $posted->json('data.lines.0.unit_cost'));
        $this->assertEquals(-20000.0, (float) $posted->json('data.value_total'));
        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $draft->json('data.id'),
            'direction' => 'OUT',
            'unit_cost' => 2000.0,
        ]);
    }

    public function test_jalur_lantai_tanpa_bin_memakai_avg_lantai(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        // Lantai: avg 5000. Bin: avg 1000 (berbeda — bukti tidak tercampur).
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [['item_id' => $item->id, 'qty' => 50, 'unit_cost' => 5000]],
        ])->assertStatus(201);
        $this->seedInbound($item, $wh, $bin, 50, 1000);
        $cust = Customer::factory()->create();

        $bk = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            // Tanpa from_bin_id = ambil dari lantai.
            'lines' => [['item_id' => $item->id, 'qty' => 5]],
        ])->assertStatus(201);

        $this->assertEquals(5000.0, (float) $bk->json('data.lines.0.unit_cost'));
        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $bk->json('data.id'),
            'direction' => 'OUT',
            'bin_id' => null,
            'unit_cost' => 5000.0,
        ]);
        $line = StockDocumentLine::find($bk->json('data.lines.0.id'));
        $this->assertNull($line->from_bin_id);
    }

    public function test_retur_pembelian_terlink_tidak_disegarkan(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $bm = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [['item_id' => $item->id, 'qty' => 50, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201);

        // Harga beli naik sebelum retur dibuat — retur ter-link wajib kunci harga asal.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-05',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [['item_id' => $item->id, 'qty' => 50, 'unit_cost' => 3000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $rp = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Pembelian',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'source_document_id' => $bm->json('data.id'),
            'partner' => 'PT Seed',
            'note' => 'Alasan: Cacat',
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'from_bin_id' => $bin->id, 'source_line_id' => $bm->json('data.lines.0.id')]],
        ])->assertStatus(201);

        $this->assertEquals(1000.0, (float) $rp->json('data.lines.0.unit_cost'));
    }

    public function test_cost_drift_dan_sync_cost(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 2000);

        // Drift 100% → muncul dengan ambang default 10%.
        $drift = $this->getJson('/api/master/items/cost-drift')->assertOk();
        $row = collect($drift->json('data'))->firstWhere('item_id', $item->id);
        $this->assertNotNull($row);
        $this->assertEquals(100.0, (float) $row['drift_pct']);
        $this->assertEquals(2000.0, (float) $row['avg_cost']);

        // Ambang tinggi menyaringnya.
        $filtered = $this->getJson('/api/master/items/cost-drift?threshold_pct=150')->assertOk();
        $this->assertNull(collect($filtered->json('data'))->firstWhere('item_id', $item->id));

        // Sync menerapkan avg + mengembalikan jejak old/new.
        $sync = $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]])->assertOk();
        $this->assertCount(1, $sync->json('applied'));
        $this->assertEquals(1000.0, (float) $sync->json('applied.0.old_cost'));
        $this->assertEquals(2000.0, (float) $sync->json('applied.0.new_cost'));
        $this->assertEquals(2000.0, (float) $item->fresh()->cost);

        // Sync kedua tanpa perubahan → tidak ada yang diterapkan.
        $noop = $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]])->assertOk();
        $this->assertCount(0, $noop->json('applied'));

        // Tanpa hak Master Data Tulis → 403.
        $user = User::factory()->create(['role' => 'NoMaster', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'NoMaster', 'module' => 'Persediaan'], ['level' => 'Baca']);
        Sanctum::actingAs($user, ['*'], 'sanctum');
        $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]])->assertForbidden();
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

    private function seedInbound(Item $item, Warehouse $wh, Bin $bin, int $qty, float $cost = 1000.0, string $date = '2026-07-01'): void
    {
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => $date,
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [
                ['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);
    }
}
