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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockAdjustmentApprovalTest extends TestCase
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

    private function makeAuditor(): User
    {
        $user = User::factory()->create(['role' => 'Auditor', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'Auditor', 'module' => 'Persediaan'], ['level' => 'Kelola']);
        return $user;
    }

    private function makeOperator(): User
    {
        return User::factory()->create(['role' => 'Operator Gudang', 'is_active' => true]);
    }

    public function test_adj_store_forces_draft_even_if_selesai_sent(): void
    {
        [$wh, , $bin] = $this->makeLocation();
        $item = $this->makeItem();

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Selesai',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'to_bin_id' => $bin->id, 'reason_code' => 'location_error'],
            ],
        ])->assertStatus(201)->assertJsonPath('data.status', 'Draft');

        $this->assertNull($res->json('data.posted_at'));
        $this->assertSame(0, StockDocument::find($res->json('data.id'))->movements()->count());
    }

    public function test_submit_approval_draft_to_menunggu(): void
    {
        [$wh, , $bin] = $this->makeLocation();
        $item = $this->makeItem();
        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 3, 'to_bin_id' => $bin->id, 'reason_code' => 'other'],
            ],
        ])->assertStatus(201);
        $id = $res->json('data.id');

        $this->postJson("/api/persediaan/stock-documents/{$id}/submit-approval")
            ->assertOk()->assertJsonPath('data.status', 'Menunggu Approval')
            ->assertJsonPath('data.submitted_at', fn($v) => $v !== null);
    }

    public function test_approve_with_auditor_succeeds_and_posts_ledger(): void
    {
        [$wh, $rack, $bin] = $this->makeLocation();
        $item = $this->makeItem();
        // seed stock
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-11',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201);

        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 2, 'to_bin_id' => $bin->id, 'reason_code' => 'other']],
        ])->assertStatus(201);
        $id = $res->json('data.id');
        $this->postJson("/api/persediaan/stock-documents/{$id}/submit-approval")->assertOk();

        $auditor = $this->makeAuditor();
        Sanctum::actingAs($auditor, ['*'], 'sanctum');
        $this->postJson("/api/persediaan/stock-documents/{$id}/approve")->assertOk()
            ->assertJsonPath('data.status', 'Selesai')
            ->assertJsonPath('data.approver_user_id', $auditor->id);

        $this->assertDatabaseHas('stock_movements', ['stock_document_id' => $id, 'direction' => 'IN', 'qty' => 2]);
        $this->assertDatabaseHas('item_stock', ['item_id' => $item->id, 'warehouse_id' => $wh->id, 'bin_id' => $bin->id, 'stock' => 12]);
    }

    public function test_approve_fails_if_requester_is_approver(): void
    {
        [$wh, , $bin] = $this->makeLocation();
        $item = $this->makeItem();
        $requester = User::factory()->create(['role' => 'Operator Gudang', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'Operator Gudang', 'module' => 'Persediaan'], ['level' => 'Tulis']);
        Sanctum::actingAs($requester, ['*'], 'sanctum');
        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 1, 'to_bin_id' => $bin->id, 'reason_code' => 'other']],
        ])->assertStatus(201);
        $id = $res->json('data.id');
        $this->postJson("/api/persediaan/stock-documents/{$id}/submit-approval")->assertOk();

        // Same requester tries to approve
        $this->postJson("/api/persediaan/stock-documents/{$id}/approve")->assertStatus(422)
            ->assertJsonPath('message', fn($v) => str_contains($v, 'tidak boleh menyetujui'));
    }

    public function test_approve_fails_if_not_auditor_or_kelola(): void
    {
        [$wh, , $bin] = $this->makeLocation();
        $item = $this->makeItem();
        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 1, 'to_bin_id' => $bin->id, 'reason_code' => 'other']],
        ])->assertStatus(201);
        $id = $res->json('data.id');
        $this->postJson("/api/persediaan/stock-documents/{$id}/submit-approval")->assertOk();

        $operator = $this->makeOperator(); // no Kelola, not Auditor
        Sanctum::actingAs($operator, ['*'], 'sanctum');
        $this->postJson("/api/persediaan/stock-documents/{$id}/approve")->assertStatus(403);
    }

    public function test_reject_moves_to_dibatalkan_without_ledger(): void
    {
        [$wh, , $bin] = $this->makeLocation();
        $item = $this->makeItem();
        $res = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Adjustment',
            'status' => 'Draft',
            'document_date' => '2026-08-12',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'to_bin_id' => $bin->id, 'reason_code' => 'other']],
        ])->assertStatus(201);
        $id = $res->json('data.id');
        $this->postJson("/api/persediaan/stock-documents/{$id}/submit-approval")->assertOk();

        $auditor = $this->makeAuditor();
        Sanctum::actingAs($auditor, ['*'], 'sanctum');
        $this->postJson("/api/persediaan/stock-documents/{$id}/reject", ['decision_note' => 'Tidak valid'])
            ->assertOk()->assertJsonPath('data.status', 'Dibatalkan')
            ->assertJsonPath('data.decision_note', 'Tidak valid');

        $this->assertDatabaseMissing('stock_movements', ['stock_document_id' => $id]);
    }
}
