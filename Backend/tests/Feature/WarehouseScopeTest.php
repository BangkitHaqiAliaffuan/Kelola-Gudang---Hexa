<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\ProcDoc;
use App\Models\Rack;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockDocument;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WarehouseScopeTest extends TestCase
{
    use RefreshDatabase;

    private function makeTerbatasRole(string $name, array $modules): void
    {
        Role::create([
            'name' => $name,
            'description' => null,
            'is_system' => false,
            'can_review' => false,
            'warehouse_scope_mode' => 'Terbatas',
        ]);
        foreach ($modules as $module) {
            RolePermission::create(['role' => $name, 'module' => $module, 'level' => 'Baca']);
        }
    }

    private function makeScopedUser(string $role, Warehouse $warehouse): User
    {
        $user = User::factory()->create(['role' => $role, 'default_warehouse_id' => null]);
        $user->warehouses()->sync([$warehouse->id]);

        return $user;
    }

    private function stockIn(Warehouse $wh, Item $item, int $stock, float $avg): void
    {
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);
        ItemStock::updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $wh->id, 'bin_id' => $bin->id],
            ['stock' => $stock, 'reserved' => 0, 'unit_cost_avg' => $avg, 'updated_at' => now()]
        );
    }

    public function test_stock_only_shows_allowed_warehouse(): void
    {
        $this->makeTerbatasRole('Op Scope', ['Persediaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create(['cost' => 1000]);
        $this->stockIn($a, $item, 10, 1000);
        $this->stockIn($b, $item, 20, 1000);
        Sanctum::actingAs($this->makeScopedUser('Op Scope', $a));

        $this->getJson('/api/persediaan/stock?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.warehouse_id', $a->id);

        // Filter klien ke gudang asing: hasil kosong, bukan 403 (baca diam).
        $this->getJson("/api/persediaan/stock?per_page=100&warehouse_id={$b->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_stock_documents_and_proc_docs_are_scoped(): void
    {
        $this->makeTerbatasRole('Op Scope 2', ['Persediaan', 'Pengadaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        StockDocument::create([
            'no' => 'BM/2026/00001', 'type' => 'Penerimaan', 'status' => 'Draft',
            'document_date' => '2026-01-01', 'warehouse_id' => $a->id,
        ]);
        StockDocument::create([
            'no' => 'BM/2026/00002', 'type' => 'Penerimaan', 'status' => 'Draft',
            'document_date' => '2026-01-01', 'warehouse_id' => $b->id,
        ]);
        // ProcDoc Draft hanya terlihat oleh pembuatnya (aturan index);
        // pakai status Menunggu Approval agar terlihat semua pembaca.
        ProcDoc::factory()->pendingApproval()->create(['warehouse_id' => $a->id]);
        ProcDoc::factory()->pendingApproval()->create(['warehouse_id' => $b->id]);
        Sanctum::actingAs($this->makeScopedUser('Op Scope 2', $a));

        $this->getJson('/api/persediaan/stock-documents?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.warehouse_id', $a->id);

        $this->getJson('/api/pengadaan/proc-docs?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_cost_drift_uses_only_allowed_warehouse(): void
    {
        $this->makeTerbatasRole('Op Scope 3', ['Persediaan']);
        $this->actingAsMasterAdmin();
        RolePermission::firstOrCreate(
            ['role' => 'Op Scope 3', 'module' => 'Master Data'],
            ['level' => 'Baca']
        );
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create(['cost' => 1000]);
        $this->stockIn($a, $item, 10, 1000);
        $this->stockIn($b, $item, 10, 2000);

        // Lintas-gudang: avg 1500 → drift 50% ≥ ambang.
        $this->getJson('/api/master/items/cost-drift?threshold_pct=10')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // Terbatas A: avg 1000 = master → drift 0 → tidak muncul.
        Sanctum::actingAs($this->makeScopedUser('Op Scope 3', $a));
        $this->getJson('/api/master/items/cost-drift?threshold_pct=10')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_summary_uses_only_allowed_warehouse(): void
    {
        $this->makeTerbatasRole('Op Scope 4', ['Persediaan']);
        $this->actingAsMasterAdmin();
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $b->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-02-01',
            'warehouse_id' => $b->id,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'to_bin_id' => $bin->id, 'unit_cost' => 1000]],
        ])->assertCreated();

        $this->getJson('/api/persediaan/stock-documents/summary')
            ->assertOk()
            ->assertJsonPath('data.masuk.qty', 5);

        Sanctum::actingAs($this->makeScopedUser('Op Scope 4', $a));
        $this->getJson('/api/persediaan/stock-documents/summary')
            ->assertOk()
            ->assertJsonPath('data.masuk.qty', 0);
    }

    public function test_mutasi_shows_zero_for_unrelated_items(): void
    {
        $this->makeTerbatasRole('Op Scope 5', ['Persediaan', 'Laporan']);
        $this->actingAsMasterAdmin();
        RolePermission::firstOrCreate(
            ['role' => 'Op Scope 5', 'module' => 'Master Data'],
            ['level' => 'Baca']
        );
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $b->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-02-01',
            'warehouse_id' => $b->id,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'to_bin_id' => $bin->id, 'unit_cost' => 1000]],
        ])->assertCreated();

        // Keputusan terkunci 7.3.1c(a): item tetap tampil dengan angka 0.
        Sanctum::actingAs($this->makeScopedUser('Op Scope 5', $a));
        $this->getJson('/api/laporan/mutasi?from=2000-01-01&to=2100-01-01&per_page=100')
            ->assertOk()
            ->assertJsonPath('data.0.masuk', 0)
            ->assertJsonPath('data.0.keluar', 0);
    }

    public function test_terbatas_without_any_warehouse_sees_nothing(): void
    {
        $this->makeTerbatasRole('Op Scope 6', ['Persediaan']);
        $wh = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $this->stockIn($wh, $item, 10, 1000);
        $user = User::factory()->create(['role' => 'Op Scope 6', 'default_warehouse_id' => null]);
        Sanctum::actingAs($user);

        $this->getJson('/api/persediaan/stock?per_page=100')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_items_master_is_not_scoped(): void
    {
        $this->makeTerbatasRole('Op Scope 7', ['Persediaan', 'Master Data']);
        $a = Warehouse::factory()->create();
        Item::factory()->create();
        Sanctum::actingAs($this->makeScopedUser('Op Scope 7', $a));

        $this->getJson('/api/master/items?per_page=100')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_semua_user_still_sees_everything(): void
    {
        $this->actingAsMasterAdmin();
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $this->stockIn($a, $item, 10, 1000);
        $this->stockIn($b, $item, 20, 1000);

        $this->getJson('/api/persediaan/stock?per_page=100')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_warehouses_index_is_scoped(): void
    {
        $this->makeTerbatasRole('Op Wh', ['Master Data']);
        $a = Warehouse::factory()->create();
        Warehouse::factory()->create();
        Sanctum::actingAs($this->makeScopedUser('Op Wh', $a));

        $this->getJson('/api/master/warehouses?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $a->id);
    }

    public function test_me_reports_warehouse_scope(): void
    {
        $this->makeTerbatasRole('Op Me', ['Master Data']);
        $a = Warehouse::factory()->create();
        Sanctum::actingAs($this->makeScopedUser('Op Me', $a));

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('warehouse_scope.mode', 'Terbatas')
            ->assertJsonPath('warehouse_scope.ids', [$a->id]);
    }

    public function test_audit_logs_limited_to_own_for_terbatas(): void
    {
        $this->makeTerbatasRole('Op Audit', ['Audit Trails']);
        $a = Warehouse::factory()->create();
        $me = $this->makeScopedUser('Op Audit', $a);
        $other = User::factory()->create(['role' => 'Op Audit']);
        AuditLog::create([
            'occurred_at' => now(), 'user_id' => $me->id, 'user_name' => $me->name,
            'role' => 'Op Audit', 'action' => 'Login', 'module' => 'System',
        ]);
        AuditLog::create([
            'occurred_at' => now(), 'user_id' => $other->id, 'user_name' => $other->name,
            'role' => 'Op Audit', 'action' => 'Login', 'module' => 'System',
        ]);
        Sanctum::actingAs($me);

        $this->getJson('/api/system/audit-logs?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $me->id);
    }
}
