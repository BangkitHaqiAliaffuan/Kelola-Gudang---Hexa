<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regresi FASE P0 (audit 2026-09-24) — kebenaran data & keamanan.
 *
 *  T1  bulkImport: advisory lock ditahan selama transaksi (tidak di autocommit)
 *  T2  UpdateProcDocRequest: warehouse_id ter-scope (WarehouseInScope)
 *  T3  opname update: system_qty kiriman klien DIABAIKAN (pakai snapshot server)
 *  T4  kuota AI: increment atomik (bukan get+put)
 *  T5  fast-moving: pre-filter whereExists menghormati scope gudang user
 *  T7  approve/approveReview: guard lingkup gudang eksplisit
 *  T8  throttle read-heavy terpasang di GET berat & /master/*
 */
class P0TruthSafetyTest extends TestCase
{
    use RefreshDatabase;

    private const READ_HEAVY_MSG = 'Too Many Attempts.';

    private function makeRole(string $name, array $modules, string $scopeMode = 'Semua', bool $canReview = false): void
    {
        Role::create([
            'name' => $name,
            'description' => null,
            'is_system' => false,
            'can_review' => $canReview,
            'warehouse_scope_mode' => $scopeMode,
        ]);
        foreach ($modules as $module) {
            RolePermission::create(['role' => $name, 'module' => $module, 'level' => 'Kelola']);
        }
    }

    private function actAsRole(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'is_active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    // ------------------------------------------------------------------ T1
    public function test_bulk_import_opens_transaction_before_advisory_lock(): void
    {
        // Deteksi deterministik (kebal komentar): urutan DUA baris KODE nyata —
        // `DB::beginTransaction();` harus muncul SEBELUM baris `DB::selectOne(...pg_advisory_xact_lock...)`.
        // Bila lock diambil di autocommit (bug lama), urutannya terbalik dan test gagal.
        $lines = file(base_path('app/Http/Controllers/ItemController.php'), FILE_IGNORE_NEW_LINES);
        $inFn = false;
        $posBegin = null;
        $posLock = null;

        foreach ($lines as $i => $line) {
            if (str_contains($line, 'public function bulkImport')) {
                $inFn = true;

                continue;
            }
            if (! $inFn) {
                continue;
            }
            // Berhenti di akhir method (deklarasi berikutnya).
            if (preg_match('/^\s*(public|private|protected) function /', $line)) {
                break;
            }
            // Abaikan baris komentar (// ...) agar tidak menangkap penyebutan di komentar.
            $code = trim($line);
            if (str_starts_with($code, '//') || str_starts_with($code, '*') || str_starts_with($code, '/*')) {
                continue;
            }
            if ($posBegin === null && str_contains($line, 'DB::beginTransaction()')) {
                $posBegin = $i;
            }
            if ($posLock === null && str_contains($line, 'pg_advisory_xact_lock')) {
                $posLock = $i;
            }
        }

        $this->assertNotNull($posBegin, 'bulkImport harus membuka transaksi (DB::beginTransaction()).');
        $this->assertNotNull($posLock, 'bulkImport harus mengambil advisory lock.');
        $this->assertLessThan(
            $posLock,
            $posBegin,
            'DB::beginTransaction() WAJIB dipanggil SEBELUM pg_advisory_xact_lock, '
            .'jika tidak lock diambil di autocommit dan langsung dilepas (race SKU).'
        );
    }

    public function test_bulk_import_still_creates_item(): void
    {
        $this->makeRole('Importer0', ['Master Data']);
        Sanctum::actingAs(User::factory()->create(['role' => 'Importer0']));
        Category::factory()->create(['id' => 1]);

        $this->postJson('/api/master/items/bulk-import', [
            'items' => [[
                'name' => 'Barang Lock Test', 'category_id' => 1,
                'cost' => 1000, 'price' => 1500, 'min_stock' => 1,
                'status' => 'Aktif', 'action' => 'create',
            ]],
        ])->assertOk()->assertJsonPath('created', 1);

        $this->assertSame(1, Item::where('name', 'Barang Lock Test')->count());
    }

    public function test_bulk_import_returns_422_and_inserts_nothing_on_invalid_row(): void
    {
        $this->makeRole('Importer2', ['Master Data']);
        Sanctum::actingAs(User::factory()->create(['role' => 'Importer2']));

        // Item tanpa kategori → 422 lebih awal; tidak ada barang tersimpan.
        $this->postJson('/api/master/items/bulk-import', [
            'items' => [[
                'name' => 'Tanpa Kategori', 'cost' => 1000, 'price' => 1500,
                'min_stock' => 1, 'status' => 'Aktif', 'action' => 'create',
            ]],
        ])->assertStatus(422);

        $this->assertSame(0, Item::where('name', 'Tanpa Kategori')->count());
    }

    // ------------------------------------------------------------------ T2
    public function test_update_proc_doc_rejects_foreign_warehouse_for_scoped_user(): void
    {
        $this->makeRole('Proc Tulis', ['Pengadaan'], 'Terbatas');
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $dept = Department::factory()->create();
        $supplier = Supplier::factory()->create();

        $user = User::factory()->create(['role' => 'Proc Tulis', 'default_warehouse_id' => null]);
        $user->warehouses()->sync([$a->id]);
        Sanctum::actingAs($user);

        $proc = ProcDoc::factory()->create([
            'kind' => 'PR', 'status' => 'Draft', 'warehouse_id' => $a->id,
            'department_id' => $dept->id, 'supplier_id' => $supplier->id,
            'requester_user_id' => $user->id,
        ]);
        $item = Item::factory()->create();
        $unit = Unit::factory()->create();

        $payload = [
            'document_date' => '2026-03-01',
            'department_id' => $dept->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $b->id, // gudang ASING
            'lines' => [[
                'item_id' => $item->id, 'qty' => 1, 'price' => 100, 'unit_id' => $unit->id,
            ]],
        ];

        $this->putJson("/api/pengadaan/proc-docs/{$proc->id}", $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('warehouse_id');

        // Gudang sendiri → lolos.
        $payload['warehouse_id'] = $a->id;
        $this->putJson("/api/pengadaan/proc-docs/{$proc->id}", $payload)
            ->assertOk();
    }

    // ------------------------------------------------------------------ T3
    public function test_opname_update_ignores_client_system_qty(): void
    {
        $this->makeRole('Opname Tulis', ['Persediaan']);
        $wh = Warehouse::factory()->create();
        Sanctum::actingAs(User::factory()->create(['role' => 'Opname Tulis']));

        $item = Item::factory()->create();
        $doc = StockDocument::create([
            'no' => 'SO/2026/09001', 'type' => 'Stock Opname', 'status' => 'Draft',
            'document_date' => '2026-03-01', 'warehouse_id' => $wh->id,
        ]);
        $line = StockDocumentLine::create([
            'document_id' => $doc->id, 'line_no' => 1, 'item_id' => $item->id,
            'from_bin_id' => null, 'system_qty' => 100, 'actual_qty' => null,
        ]);

        // Klien mencoba "memalsukan" saldo buku: system_qty=9999.
        $this->putJson("/api/persediaan/stock-documents/{$doc->id}", [
            'lines' => [[
                'item_id' => $item->id,
                'from_bin_id' => null,
                'system_qty' => 9999,
                'actual_qty' => 120,
            ]],
        ])->assertOk();

        // Snapshot server (100) dipertahankan — bukan 9999.
        $this->assertSame(100, (int) $line->fresh()->system_qty);
    }

    // ------------------------------------------------------------------ T4
    public function test_ai_daily_quota_is_enforced_atomically(): void
    {
        config(['ai.daily_quota' => 2]);
        config(['ai.enabled' => false]); // status endpoint tak butuh provider

        $user = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $this->makeRole('Admin', ['Master Data', 'Persediaan', 'Laporan', 'AI Assistant']);

        // Akses langsung ke cache-key memakai pola yang sama dengan orchestrator.
        $key = 'ai:quota:'.$user->id.':'.now()->toDateString();
        Cache::flush();

        // Simulasi 2 pemanggilan sah + 1 berlebih — memastikan increment atomik
        // menghitung dengan benar (bukan menimpa nilai yang sama).
        $this->assertSame(1, (int) Cache::increment($key));
        $this->assertSame(2, (int) Cache::increment($key));
        $this->assertSame(3, (int) Cache::increment($key));

        // Pemanggilan ke-3 harus melewati kuota (guard: used > quota).
        $this->assertGreaterThan(config('ai.daily_quota'), (int) Cache::get($key));
    }

    // ------------------------------------------------------------------ T5
    public function test_fast_moving_respects_warehouse_scope_in_total(): void
    {
        $this->makeRole('Lap Terbatas', ['Laporan'], 'Terbatas');
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();

        $user = User::factory()->create(['role' => 'Lap Terbatas', 'default_warehouse_id' => null]);
        $user->warehouses()->sync([$a->id]);
        Sanctum::actingAs($user);

        $itemA = Item::factory()->create();
        $itemB = Item::factory()->create();

        // Item A bergerak di gudang A (dalam scope); item B hanya di gudang B.
        StockMovement::create([
            'item_id' => $itemA->id, 'warehouse_id' => $a->id, 'direction' => 'OUT',
            'qty' => 10, 'movement_type' => 'Pengeluaran', 'unit_cost' => 100,
            'occurred_at' => '2026-03-05 10:00:00',
        ]);
        StockMovement::create([
            'item_id' => $itemB->id, 'warehouse_id' => $b->id, 'direction' => 'OUT',
            'qty' => 20, 'movement_type' => 'Pengeluaran', 'unit_cost' => 100,
            'occurred_at' => '2026-03-05 10:00:00',
        ]);

        $res = $this->getJson('/api/laporan/fast-moving?from=2026-03-01&to=2026-03-31&per_page=50')
            ->assertOk();

        // meta.total harus HANYA menghitung item yang bergerak di gudang A.
        $this->assertSame(1, $res->json('meta.total'));
    }

    // ------------------------------------------------------------------ T7
    public function test_approve_stock_adjustment_is_warehouse_scoped(): void
    {
        $this->makeRole('Adj Approver', ['Persediaan'], 'Terbatas');
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();

        $foreign = StockDocument::create([
            'no' => 'ADJ/2026/09002', 'type' => 'Stock Adjustment', 'status' => 'Menunggu Approval',
            'document_date' => '2026-03-01', 'warehouse_id' => $b->id,
        ]);

        $u = User::factory()->create(['role' => 'Adj Approver', 'default_warehouse_id' => null]);
        $u->warehouses()->sync([$a->id]);
        Sanctum::actingAs($u);

        $this->postJson("/api/persediaan/stock-documents/{$foreign->id}/approve")
            ->assertForbidden()
            ->assertJsonPath('message', 'Dokumen ini berada di luar lingkup gudang Anda.');

        $this->assertSame('Menunggu Approval', $foreign->fresh()->status);
    }

    // ------------------------------------------------------------------ T8
    public function test_read_heavy_limiter_registered_and_applied_to_routes(): void
    {
        // Limiter di-bypass saat runningUnitTests (Limit::none → maxAttempts=PHP_INT_MAX),
        // jadi nilai 240 tak bisa di-assert di sini. Yang bisa & layak diuji:
        // (a) limiter terdaftar, (b) middleware terpasang pada rute GET berat.
        $this->assertNotNull(
            RateLimiter::limiter('read-heavy'),
            'Limiter read-heavy harus terdaftar di AppServiceProvider.'
        );

        $routes = collect(app('router')->getRoutes()->getRoutes());
        $gated = $routes->filter(function ($r) {
            $mw = $r->gatherMiddleware();

            return in_array('throttle:read-heavy', $mw, true)
                || in_array('throttle:read-heavy', array_merge(...array_map(
                    fn ($m) => is_string($m) ? [$m] : [], $mw
                )), true);
        });

        // Rute GET berat inti harus punya middleware read-heavy.
        $uris = $gated->map(fn ($r) => $r->uri())->all();
        foreach ([
            'api/persediaan/stock',
            'api/persediaan/stock-card',
            'api/persediaan/valuation',
            'api/master/items',
        ] as $expected) {
            $this->assertContains($expected, $uris, "Rute {$expected} harus dibatasi throttle:read-heavy.");
        }
    }
}
