<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bin;
use App\Models\Category;
use App\Models\Item;
use App\Models\Rack;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsPersistedAdmin(): User
    {
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Master Data'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Persediaan'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Audit Trails'],
            ['level' => 'Kelola'],
        );

        $user = User::factory()->create(['role' => 'Test Admin', 'is_active' => true]);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        return $user;
    }

    public function test_master_create_records_audit(): void
    {
        $user = $this->actingAsPersistedAdmin();

        $this->postJson('/api/master/categories', ['name' => 'Audit Kat'])
            ->assertCreated();

        $log = AuditLog::query()->where('action', 'Create')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertEquals($user->id, $log->user_id);
        $this->assertEquals('Master Data', $log->module);
        $this->assertEquals('Category', $log->auditable_type);
        $this->assertArrayHasKey('name', $log->new_values ?? []);
    }

    public function test_master_update_records_diff_without_password(): void
    {
        $this->actingAsPersistedAdmin();
        $category = Category::factory()->create(['name' => 'Lama']);
        AuditLog::query()->delete();

        $this->putJson("/api/master/categories/{$category->id}", [
            'code' => $category->code,
            'name' => 'Baru',
        ])->assertOk();

        $log = AuditLog::query()->where('action', 'Update')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertEquals('Lama', $log->old_values['name'] ?? null);
        $this->assertEquals('Baru', $log->new_values['name'] ?? null);
    }

    public function test_login_and_logout_record_audit(): void
    {
        $user = User::factory()->create([
            'role' => 'Operator Gudang',
            'is_active' => true,
            'password' => Hash::make('secret123'),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ])->assertOk();

        $token = $user->createToken('kg-test')->plainTextToken;

        $this->assertTrue(
            AuditLog::query()->where('action', 'Login')->where('user_id', $user->id)->exists()
        );

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertTrue(
            AuditLog::query()->where('action', 'Logout')->where('user_id', $user->id)->exists()
        );
    }

    public function test_stock_document_post_records_audit(): void
    {
        $this->actingAsPersistedAdmin();

        $item = Item::factory()->create(['cost' => 1000]);
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        $draft = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201)->json('data');

        $this->postJson("/api/persediaan/stock-documents/{$draft['id']}/post")->assertOk();

        $log = AuditLog::query()->where('action', 'Post')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertEquals('Transaksi', $log->module);
        $this->assertEquals('StockDocument', $log->auditable_type);
        $this->assertEquals($draft['no'], $log->record_no);
    }

    public function test_store_module_follows_source_and_type(): void
    {
        $this->actingAsPersistedAdmin();

        $item = Item::factory()->create(['cost' => 1000]);
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);
        $line = ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id];

        $base = [
            'status' => 'Draft',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [$line],
        ];

        // Eksplisit dari form transaksi.
        $this->postJson('/api/persediaan/stock-documents', $base + [
            'type' => 'Penerimaan', 'source_module' => 'Transaksi',
        ])->assertStatus(201);
        // Receive Goods: Penerimaan dari menu Pengadaan.
        $this->postJson('/api/persediaan/stock-documents', $base + [
            'type' => 'Penerimaan', 'source_module' => 'Pengadaan',
        ])->assertStatus(201);
        // Tanpa source_module: fallback peta tipe.
        $this->postJson('/api/persediaan/stock-documents', $base + ['type' => 'Penerimaan'])
            ->assertStatus(201);
        // Nilai tak dikenal: fallback, tidak 422.
        $this->postJson('/api/persediaan/stock-documents', $base + [
            'type' => 'Penerimaan', 'source_module' => 'Ngawur',
        ])->assertStatus(201);

        $modules = AuditLog::query()->where('action', 'Create')
            ->where('auditable_type', 'StockDocument')
            ->orderBy('id')->pluck('module')->all();

        $this->assertEquals(['Transaksi', 'Pengadaan', 'Transaksi', 'Transaksi'], $modules);
    }

    public function test_index_requires_audit_trails_access(): void
    {
        $user = User::factory()->create(['role' => 'NoAudit', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'NoAudit', 'module' => 'Persediaan'], ['level' => 'Baca']);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        $this->getJson('/api/system/audit-logs')->assertForbidden();
    }

    public function test_index_filters_and_reads_do_not_record(): void
    {
        $this->actingAsPersistedAdmin();

        $this->getJson('/api/system/audit-logs?action=Create&per_page=20')->assertOk()
            ->assertJsonStructure(['data', 'links', 'meta']);

        $this->assertEquals(0, AuditLog::query()->count());
    }

    public function test_prune_command_deletes_old_rows(): void
    {
        AuditLog::query()->create([
            'occurred_at' => now()->subDays(200),
            'action' => 'Login',
            'module' => 'System',
        ]);
        AuditLog::query()->create([
            'occurred_at' => now()->subDays(10),
            'action' => 'Login',
            'module' => 'System',
        ]);

        $this->artisan('audit:prune', ['--days' => 180])->assertSuccessful();

        $this->assertEquals(1, AuditLog::query()->count());
    }

    public function test_backfill_modules_dry_run_then_apply(): void
    {
        $this->actingAsPersistedAdmin();

        $item = Item::factory()->create(['cost' => 1000]);
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        // Dokumen baru otomatis Transaksi; paksa jadi Persediaan ala data lama.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201);

        AuditLog::query()->where('auditable_type', 'StockDocument')->update(['module' => 'Persediaan']);
        // Baris yatim (dokumen sudah dihapus) — harus dilewati.
        AuditLog::query()->create([
            'occurred_at' => now(),
            'action' => 'Create',
            'module' => 'Persediaan',
            'auditable_type' => 'StockDocument',
            'auditable_id' => 999999,
        ]);

        $this->artisan('audit:backfill-modules')->assertSuccessful();
        $this->assertEquals(0, AuditLog::query()->where('module', 'Transaksi')->count());

        $this->artisan('audit:backfill-modules', ['--apply' => true])->assertSuccessful();

        $this->assertEquals(1, AuditLog::query()->where('module', 'Transaksi')->count());
        $this->assertTrue(
            AuditLog::query()->where('auditable_id', 999999)->where('module', 'Persediaan')->exists()
        );
        $this->assertTrue(
            AuditLog::query()->where('record_no', 'Backfill modul audit')->exists()
        );
    }

    public function test_module_map_covers_all_types(): void
    {
        $this->assertEquals('Transaksi', AuditLogger::moduleForStockDocumentType('Penerimaan'));
        $this->assertEquals('Transaksi', AuditLogger::moduleForStockDocumentType('Pengeluaran'));
        $this->assertEquals('Transaksi', AuditLogger::moduleForStockDocumentType('Transfer Gudang'));
        $this->assertEquals('Transaksi', AuditLogger::moduleForStockDocumentType('Retur Pembelian'));
        $this->assertEquals('Transaksi', AuditLogger::moduleForStockDocumentType('Retur Penjualan'));
        $this->assertEquals('Persediaan', AuditLogger::moduleForStockDocumentType('Stock Adjustment'));
        $this->assertEquals('Stock Opname', AuditLogger::moduleForStockDocumentType('Stock Opname'));
        $this->assertEquals('Persediaan', AuditLogger::moduleForStockDocumentType('Tipe Aneh'));
        $this->assertEquals('Persediaan', AuditLogger::moduleForStockDocumentType(null));
    }
}
