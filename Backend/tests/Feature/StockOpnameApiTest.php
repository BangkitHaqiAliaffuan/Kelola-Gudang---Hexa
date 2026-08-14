<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\RolePermission;
use App\Models\StockDocument;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\Fluent\AssertableJson;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockOpnameApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    private function seedInbound(Item $item, Warehouse $wh, Bin $bin, int $qty, float $cost = 1000.0): void
    {
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-10',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Sumber Jaya',
            'lines' => [
                ['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);
    }

    public function test_store_opname_draft_snapshots_system_qty_from_item_stock(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'pic' => 'Rudi Hartono',
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.type', 'Stock Opname')
                ->where('data.status', 'Draft')
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^SO\/\d{4}\/\d{5}$/', (string) $v))
                ->where('data.lines.0.qty', null)
                ->where('data.lines.0.system_qty', 10)
                ->where('data.lines.0.actual_qty', null)
                ->where('data.lines.0.variance', null)
                ->where('data.lines.0.unit_cost', fn ($v) => (float) $v === 1000.0));

        $doc = StockDocument::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertNull($doc->posted_at);
        $this->assertSame(0, $doc->movements()->count());
    }

    public function test_store_opname_draft_without_from_bin_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.from_bin_id');
    }

    public function test_store_opname_rejects_qty_on_lines(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'qty' => 5],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.qty');
    }

    public function test_store_opname_rejects_to_bin_on_lines(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.to_bin_id');
    }

    public function test_store_opname_finish_requires_all_lines_counted(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 8],
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines');
    }

    public function test_store_opname_posted_applies_negative_variance(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 7, 'reason_code' => 'picking_error'],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.lines.0.variance', -3);

        $row = ItemStock::where('item_id', $item->id)
            ->where('warehouse_id', $wh->id)
            ->where('bin_id', $bin->id)
            ->first();

        $this->assertSame(7, (int) $row->stock);

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $res->json('data.id'),
            'direction' => 'OUT',
            'qty' => 3,
            'bin_id' => $bin->id,
        ]);
    }

    public function test_store_opname_posted_applies_positive_variance(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 12, 'reason_code' => 'receiving_error'],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.lines.0.variance', 2);

        $row = ItemStock::where('item_id', $item->id)
            ->where('warehouse_id', $wh->id)
            ->where('bin_id', $bin->id)
            ->first();

        $this->assertSame(12, (int) $row->stock);

        $this->assertDatabaseHas('stock_movements', [
            'stock_document_id' => $res->json('data.id'),
            'direction' => 'IN',
            'qty' => 2,
            'bin_id' => $bin->id,
        ]);
    }

    public function test_store_opname_posted_zero_variance_creates_no_movement(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 10],
            ],
        ]);

        $res->assertStatus(201)->assertJsonPath('data.status', 'Selesai');

        $this->assertDatabaseMissing('stock_movements', ['stock_document_id' => $res->json('data.id')]);
    }

    public function test_store_opname_posted_zero_system_bin_counts_physical(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 5, 'reason_code' => 'other'],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.lines.0.system_qty', 0)
            ->assertJsonPath('data.lines.0.variance', 5);

        $row = ItemStock::where('item_id', $item->id)
            ->where('warehouse_id', $wh->id)
            ->where('bin_id', $bin->id)
            ->first();

        $this->assertSame(5, (int) $row->stock);
    }

    public function test_update_opname_draft_replaces_lines_keeping_system_snapshot(): void
    {
        $itemA = $this->makeItem();
        $itemB = $this->makeItem();
        [$wh, $rack, $binA] = $this->makeLocation();
        $binB = Bin::factory()->create(['rack_id' => $rack->id]);
        $this->seedInbound($itemA, $wh, $binA, 10);
        $this->seedInbound($itemB, $wh, $binB, 5);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $itemA->id, 'from_bin_id' => $binA->id],
                ['item_id' => $itemB->id, 'from_bin_id' => $binB->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $res = $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'document_date' => '2026-08-13',
            'pic' => 'Dewi Lestari',
            'lines' => [
                ['item_id' => $itemA->id, 'from_bin_id' => $binA->id, 'actual_qty' => 8],
                ['item_id' => $itemB->id, 'from_bin_id' => $binB->id, 'actual_qty' => 6],
            ],
        ]);

        $res->assertOk()
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.pic', 'Dewi Lestari')
            ->assertJsonPath('data.line_count', 2)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.lines.0.system_qty', 10)
                ->where('data.lines.0.actual_qty', 8)
                ->where('data.lines.1.system_qty', 5)
                ->where('data.lines.1.actual_qty', 6));
    }

    public function test_post_opname_after_update_applies_variance(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 6, 'reason_code' => 'theft_shrinkage'],
            ],
        ])->assertOk();

        $res = $this->postJson("/api/persediaan/stock-documents/{$docId}/post")
            ->assertOk()
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.lines.0.variance', -4);

        $row = ItemStock::where('item_id', $item->id)
            ->where('warehouse_id', $wh->id)
            ->where('bin_id', $bin->id)
            ->first();

        $this->assertSame(6, (int) $row->stock);
    }

    public function test_post_opname_with_uncounted_lines_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 6],
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertOk();

        $this->postJson("/api/persediaan/stock-documents/{$docId}/post")
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($v) => str_contains((string) $v, '1 belum dicek'));
    }

    public function test_update_opname_posted_document_rejected(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 10],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 9],
            ],
        ])->assertStatus(422);
    }

    public function test_update_other_document_type_rejected(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 1],
            ],
        ])->assertStatus(422);
    }

    public function test_update_opname_bin_not_in_warehouse_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        [, , $otherBin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $otherBin->id],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('lines.0.from_bin_id');
    }

    public function test_store_opname_requires_persediaan_tulis(): void
    {
        Sanctum::actingAs($this->makeUser('Stranger'), ['*'], 'sanctum');

        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(403);
    }

    public function test_store_opname_defaults_blind_count_and_sets_frozen_at(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);

        $res->assertJsonPath('data.blind_count', true)
            ->assertJsonPath('data.frozen_at', fn ($v) => $v !== null);

        $this->assertDatabaseHas('stock_documents', [
            'id' => $res->json('data.id'),
            'blind_count' => true,
        ]);
        $this->assertNotNull(StockDocument::find($res->json('data.id'))->frozen_at);
    }

    public function test_store_opname_accepts_blind_count_false(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'blind_count' => false,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.blind_count', false);
    }

    public function test_post_opname_without_reason_code_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 7],
            ],
        ])->assertOk();

        $this->postJson("/api/persediaan/stock-documents/{$docId}/post")
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($v) => str_contains((string) $v, 'Alasan selisih wajib'));
    }

    public function test_post_opname_with_moved_item_after_freeze_returns_422(): void
    {
        $item = $this->makeItem();
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 10);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id],
            ],
        ])->assertStatus(201)->json('data.id');

        // Movement terjadi SETELAH freeze (occurred_at di masa depan) — variance
        // snapshot menjadi tidak valid.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2099-01-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Pasca Freeze',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'unit_cost' => 1000, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);

        $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 10],
            ],
        ])->assertOk();

        $this->postJson("/api/persediaan/stock-documents/{$docId}/post")
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($v) => str_contains((string) $v, 'wajib dihitung ulang'));
    }

    public function test_update_preserves_line_audit_and_saves_reason_code(): void
    {
        // Audit trail butuh user ter-persist (id real) agar counted_by terisi.
        $admin = $this->makeUser('Auditor');
        RolePermission::firstOrCreate(
            ['role' => 'Auditor', 'module' => 'Persediaan'],
            ['level' => 'Kelola'],
        );
        Sanctum::actingAs($admin, ['*'], 'sanctum');

        $itemA = $this->makeItem();
        $itemB = $this->makeItem();
        [$wh, $rack, $binA] = $this->makeLocation();
        $binB = Bin::factory()->create(['rack_id' => $rack->id]);
        $this->seedInbound($itemA, $wh, $binA, 10);
        $this->seedInbound($itemB, $wh, $binB, 5);

        $docId = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $itemA->id, 'from_bin_id' => $binA->id],
                ['item_id' => $itemB->id, 'from_bin_id' => $binB->id],
            ],
        ])->assertStatus(201)->json('data.id');

        $detail = $this->getJson("/api/persediaan/stock-documents/{$docId}")->assertOk()->json('data');
        $lineAId = $detail['lines'][0]['id'];

        $res = $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $itemA->id, 'from_bin_id' => $binA->id, 'actual_qty' => 8, 'reason_code' => 'picking_error'],
                ['item_id' => $itemB->id, 'from_bin_id' => $binB->id, 'actual_qty' => 5],
            ],
        ])->assertOk();

        $res = $this->putJson("/api/persediaan/stock-documents/{$docId}", [
            'lines' => [
                ['item_id' => $itemA->id, 'from_bin_id' => $binA->id, 'actual_qty' => 8, 'reason_code' => 'picking_error'],
                ['item_id' => $itemB->id, 'from_bin_id' => $binB->id, 'actual_qty' => 5],
            ],
        ])->assertOk();

        // Id baris dipertahankan (update in-place, bukan delete+reinsert).
        $this->assertSame($lineAId, (int) $res->json('data.lines.0.id'));
        $res->assertJsonPath('data.lines.0.reason_code', 'picking_error')
            ->assertJsonPath('data.lines.0.counted_by', fn ($v) => is_string($v) && $v !== '')
            ->assertJsonPath('data.lines.0.counted_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.lines.1.counted_at', fn ($v) => $v !== null);
    }

    private function makeUser(string $role): User
    {
        $unique = random_int(10000, 99999);

        return User::factory()->create([
            'name' => 'Opname Stranger',
            'email' => 'opname.stranger.'.$unique.'@test.local',
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function makeItem(): Item
    {
        $unique = random_int(10000, 99999);

        return Item::factory()->create([
            'sku' => "SKU-OPNAME-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-OPNAME-{$unique}",
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
