<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bin;
use App\Models\Item;
use App\Models\Rack;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockDocumentAuditTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsPersediaanAdmin(): User
    {
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Persediaan'],
            ['level' => 'Kelola'],
        );

        $user = User::factory()->create(['role' => 'Test Admin', 'is_active' => true]);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        return $user;
    }

    private function makeLocation(): array
    {
        $item = Item::factory()->create(['cost' => 1000]);
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$item, $wh, $bin];
    }

    public function test_store_with_selesai_records_create_and_post(): void
    {
        $this->actingAsPersediaanAdmin();
        [$item, $wh, $bin] = $this->makeLocation();

        // Alur satu-langkah form Transaksi: buat + posting dalam satu request.
        $doc = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201)->json('data');

        $this->assertTrue(
            AuditLog::query()->where('action', 'Create')->where('record_no', $doc['no'])->exists(),
            'pembuatan langsung-Selesai harus mencatat Create'
        );
        $post = AuditLog::query()->where('action', 'Post')->where('record_no', $doc['no'])->first();
        $this->assertNotNull($post, 'auto-post inline harus mencatat Post');
        $this->assertEquals('Persediaan', $post->module);
        $this->assertEquals('StockDocument', $post->auditable_type);
    }

    public function test_draft_then_post_records_create_then_post(): void
    {
        $this->actingAsPersediaanAdmin();
        [$item, $wh, $bin] = $this->makeLocation();

        $doc = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Draft',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'unit_cost' => 1000, 'to_bin_id' => $bin->id]],
        ])->assertStatus(201)->json('data');

        $this->assertTrue(AuditLog::query()->where('action', 'Create')->where('record_no', $doc['no'])->exists());
        $this->assertFalse(AuditLog::query()->where('action', 'Post')->where('record_no', $doc['no'])->exists());

        $this->postJson("/api/persediaan/stock-documents/{$doc['id']}/post")->assertOk();

        $this->assertTrue(AuditLog::query()->where('action', 'Post')->where('record_no', $doc['no'])->exists());
    }

    public function test_opname_update_records_update(): void
    {
        $this->actingAsPersediaanAdmin();
        [$item, $wh, $bin] = $this->makeLocation();

        $doc = $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Stock Opname',
            'status' => 'Draft',
            'document_date' => '2026-08-01',
            'warehouse_id' => $wh->id,
            'lines' => [['item_id' => $item->id, 'from_bin_id' => $bin->id]],
        ])->assertStatus(201)->json('data');

        AuditLog::query()->delete();

        $this->putJson("/api/persediaan/stock-documents/{$doc['id']}", [
            'note' => 'Catatan sesi opname',
            'lines' => [['item_id' => $item->id, 'from_bin_id' => $bin->id, 'actual_qty' => 5]],
        ])->assertOk();

        $log = AuditLog::query()->where('action', 'Update')->where('record_no', $doc['no'])->first();
        $this->assertNotNull($log, 'pembaruan dokumen opname harus mencatat Update');
        $this->assertEquals('Persediaan', $log->module);
    }
}
