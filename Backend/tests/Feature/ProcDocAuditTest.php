<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Department;
use App\Models\Item;
use App\Models\RolePermission;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProcDocAuditTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsPengadaanAdmin(): User
    {
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Pengadaan'],
            ['level' => 'Kelola'],
        );

        $user = User::factory()->create(['role' => 'Test Admin', 'is_active' => true]);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        return $user;
    }

    private function makePrPayload(): array
    {
        $item = Item::factory()->create(['cost' => 1500]);

        return [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => Department::factory()->create()->id,
            'supplier_id' => Supplier::factory()->create()->id,
            'warehouse_id' => Warehouse::factory()->create()->id,
            'reference' => 'BUDGET-4321',
            'note' => 'Restock item minimum',
            'lines' => [['item_id' => $item->id, 'qty' => 50, 'price' => 1500]],
        ];
    }

    public function test_store_records_create(): void
    {
        $this->actingAsPengadaanAdmin();

        $doc = $this->postJson('/api/pengadaan/proc-docs', $this->makePrPayload())
            ->assertStatus(201)->json('data');

        $log = AuditLog::query()->where('action', 'Create')->where('record_no', $doc['no'])->first();
        $this->assertNotNull($log, 'pembuatan PR harus mencatat Create');
        $this->assertEquals('Pengadaan', $log->module);
        $this->assertEquals('ProcDoc', $log->auditable_type);
    }

    public function test_update_records_update(): void
    {
        $this->actingAsPengadaanAdmin();
        $payload = $this->makePrPayload();

        $doc = $this->postJson('/api/pengadaan/proc-docs', $payload)->assertStatus(201)->json('data');
        AuditLog::query()->delete();

        $payload['note'] = 'Catatan diubah';
        $this->putJson("/api/pengadaan/proc-docs/{$doc['id']}", $payload)->assertOk();

        $log = AuditLog::query()->where('action', 'Update')->where('record_no', $doc['no'])->first();
        $this->assertNotNull($log, 'perubahan PR Draft harus mencatat Update');
        $this->assertEquals('Pengadaan', $log->module);
    }

    public function test_destroy_records_delete(): void
    {
        $this->actingAsPengadaanAdmin();

        $doc = $this->postJson('/api/pengadaan/proc-docs', $this->makePrPayload())->assertStatus(201)->json('data');
        AuditLog::query()->delete();

        $this->deleteJson("/api/pengadaan/proc-docs/{$doc['id']}")->assertOk();

        $log = AuditLog::query()->where('action', 'Delete')->where('record_no', $doc['no'])->first();
        $this->assertNotNull($log, 'penghapusan PR Draft harus mencatat Delete');
        $this->assertEquals('Pengadaan', $log->module);
    }

    public function test_submit_still_records_submit(): void
    {
        $this->actingAsPengadaanAdmin();

        $doc = $this->postJson('/api/pengadaan/proc-docs', $this->makePrPayload())->assertStatus(201)->json('data');

        $this->postJson("/api/pengadaan/proc-docs/{$doc['id']}/submit")->assertOk();

        $this->assertTrue(
            AuditLog::query()->where('action', 'Submit')->where('record_no', $doc['no'])->exists(),
            ' perilaku Submit yang sudah ada harus tetap tercatat'
        );
    }
}
