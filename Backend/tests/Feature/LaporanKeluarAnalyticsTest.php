<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Item;
use App\Models\Project;
use App\Models\Rack;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LaporanKeluarAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_requires_laporan_baca(): void
    {
        $user = User::factory()->create(['role' => 'NoLaporan', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'NoLaporan', 'module' => 'Persediaan'], ['level' => 'Baca']);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertForbidden();
    }

    public function test_agregat_per_tujuan_per_bulan(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create(['name' => 'PT Maju Jaya']);

        // Juli: 10 unit ke customer; Agustus: 20 unit ke customer yang sama.
        foreach ([['2026-07-10', 10], ['2026-08-10', 20]] as [$date, $qty]) {
            $this->postJson('/api/persediaan/stock-documents', [
                'type' => 'Pengeluaran',
                'status' => 'Selesai',
                'document_date' => $date,
                'warehouse_id' => $wh->id,
                'customer_id' => $cust->id,
                'partner' => $cust->name,
                'lines' => [['item_id' => $item->id, 'qty' => $qty, 'from_bin_id' => $bin->id]],
            ])->assertStatus(201);
        }

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-08-31')->assertOk();
        $data = $res->json('data');

        $this->assertEquals(30000.0, (float) $data['ringkasan']['nilai']);
        $this->assertEquals(30, $data['ringkasan']['qty']);
        $this->assertEquals(2, $data['ringkasan']['dokumen']);

        $rows = collect($data['per_tujuan_per_bulan'])->where('nama', 'PT Maju Jaya')->sortBy('bulan')->values();
        $this->assertCount(2, $rows);
        $this->assertEquals('2026-07', $rows[0]['bulan']);
        $this->assertEquals(10000.0, (float) $rows[0]['nilai']);
        $this->assertEquals('2026-08', $rows[1]['bulan']);
        $this->assertEquals(20000.0, (float) $rows[1]['nilai']);

        $this->assertEquals(100.0, (float) $data['ringkasan']['mom']['pct']);
        $this->assertEquals('customer', $data['top_tujuan'][0]['jenis']);
        $this->assertEquals(100.0, (float) $data['top_tujuan'][0]['share']);
    }

    public function test_draft_excluded_dan_masuk_proses(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Draft',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertOk();
        $data = $res->json('data');

        $this->assertEquals(0, $data['ringkasan']['dokumen']);
        $this->assertEquals(0.0, (float) $data['ringkasan']['nilai']);
        $this->assertEquals(1, $data['proses']['tertahan_dokumen']);
        $this->assertEquals(5000.0, (float) $data['proses']['tertahan_nilai']);
    }

    public function test_klasifikasi_departemen_dan_proyek(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $dept = Department::factory()->create(['name' => 'Produksi']);
        $proj = Project::factory()->create(['name' => 'Proyek Tol X']);

        // Via FK baru department_id / project_id.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'department_id' => $dept->id,
            'partner' => $dept->name,
            'lines' => [['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-11',
            'warehouse_id' => $wh->id,
            'project_id' => $proj->id,
            'partner' => $proj->name,
            'lines' => [['item_id' => $item->id, 'qty' => 6, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);
        // Legacy: partner string tanpa FK tetap terklasifikasi via name-match.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-12',
            'warehouse_id' => $wh->id,
            'partner' => $dept->name,
            'lines' => [['item_id' => $item->id, 'qty' => 2, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertOk();
        $perJenis = collect($res->json('data.per_jenis'))->keyBy('jenis');

        $this->assertEquals(6000.0, (float) $perJenis['departemen']['nilai']);
        $this->assertEquals(6000.0, (float) $perJenis['proyek']['nilai']);

        $filter = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31&jenis_tujuan=proyek')->assertOk();
        $this->assertEquals(6000.0, (float) $filter->json('data.ringkasan.nilai'));
    }

    public function test_retur_tertaut_dan_alasan(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create();

        $bk = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);
        $bkId = $bk->json('data.id');
        $bkLineId = $bk->json('data.lines.0.id');

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Retur Penjualan',
            'status' => 'Selesai',
            'document_date' => '2026-07-15',
            'warehouse_id' => $wh->id,
            'source_document_id' => $bkId,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'note' => "Alasan: Cacat\nBarang pecah",
            'lines' => [['item_id' => $item->id, 'qty' => 2, 'to_bin_id' => $bin->id, 'source_line_id' => $bkLineId]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertOk();
        $retur = $res->json('data.retur');

        $this->assertEquals(2, $retur['qty']);
        $this->assertEquals(2000.0, (float) $retur['nilai']);
        $this->assertEquals(20.0, (float) $retur['rate_qty']);
        $this->assertEquals('Cacat', $retur['per_alasan'][0]['alasan']);
        $this->assertEquals($cust->name, $retur['per_tujuan'][0]['nama']);
    }

    public function test_serapan_proyek_vs_target_wo(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $proj = Project::factory()->create(['name' => 'Proyek A', 'budget' => 1000000]);
        WorkOrder::factory()->create(['project_id' => $proj->id, 'item_id' => $item->id, 'target_qty' => 10]);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'project_id' => $proj->id,
            'partner' => $proj->name,
            'lines' => [['item_id' => $item->id, 'qty' => 12, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertOk();
        $proyek = $res->json('data.proyek');

        $this->assertCount(1, $proyek);
        $this->assertEquals(1.2, (float) $proyek[0]['serapan_budget_pct']);
        $this->assertEquals(20.0, (float) $proyek[0]['items'][0]['varians_pct']);
        $this->assertTrue((bool) $proyek[0]['items'][0]['flag']);
    }

    public function test_omzet_dan_margin_per_customer(): void
    {
        $item = $this->makeItem(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create(['name' => 'PT Omzet']);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Pengeluaran',
            'status' => 'Selesai',
            'document_date' => '2026-07-10',
            'warehouse_id' => $wh->id,
            'customer_id' => $cust->id,
            'partner' => $cust->name,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->getJson('/api/laporan/keluar-analytics?from=2026-07-01&to=2026-07-31')->assertOk();
        $omzet = $res->json('data.omzet');

        $this->assertEquals(15000.0, (float) $omzet['total']);
        $this->assertEquals(10000.0, (float) $omzet['hpp']);
        $this->assertEquals(5000.0, (float) $omzet['margin']);
        $this->assertEquals(33.3, (float) $omzet['margin_pct']);
        $this->assertEquals(15000.0, (float) $omzet['bersih']);
        $this->assertEquals('PT Omzet', $omzet['per_customer_per_bulan'][0]['nama']);
        $this->assertEquals('2026-07', $omzet['per_customer_per_bulan'][0]['bulan']);
        $this->assertEquals('PT Omzet', $omzet['top_margin'][0]['nama']);
        $this->assertGreaterThanOrEqual(1, $omzet['cakupan']['aktual'] + $omzet['cakupan']['estimasi']);
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
