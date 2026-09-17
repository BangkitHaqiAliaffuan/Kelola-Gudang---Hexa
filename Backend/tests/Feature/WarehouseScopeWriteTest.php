<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Department;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockDocument;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WarehouseScopeWriteTest extends TestCase
{
    use RefreshDatabase;

    private function makeTerbatasWriter(string $name, array $modules): void
    {
        Role::create([
            'name' => $name,
            'description' => null,
            'is_system' => false,
            'can_review' => false,
            'warehouse_scope_mode' => 'Terbatas',
        ]);
        foreach ($modules as $module) {
            RolePermission::create(['role' => $name, 'module' => $module, 'level' => 'Tulis']);
        }
    }

    private function makeScopedUser(string $role, Warehouse $warehouse): User
    {
        $user = User::factory()->create(['role' => $role, 'default_warehouse_id' => null]);
        $user->warehouses()->sync([$warehouse->id]);

        return $user;
    }

    private function binIn(Warehouse $wh): Bin
    {
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);

        return Bin::factory()->create(['rack_id' => $rack->id]);
    }

    public function test_post_to_allowed_warehouse_succeeds_foreign_fails(): void
    {
        $this->makeTerbatasWriter('Op Tulis', ['Persediaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $binA = $this->binIn($a);
        Sanctum::actingAs($this->makeScopedUser('Op Tulis', $a));

        $payload = fn (int $whId, int $binId) => [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-03-01',
            'warehouse_id' => $whId,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 3, 'to_bin_id' => $binId, 'unit_cost' => 1000]],
        ];

        $this->postJson('/api/persediaan/stock-documents', $payload($a->id, $binA->id))
            ->assertCreated();

        $this->postJson('/api/persediaan/stock-documents', $payload($b->id, $binA->id))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_id');
    }

    public function test_transfer_origin_must_be_allowed_destination_free(): void
    {
        $this->makeTerbatasWriter('Op Transfer', ['Persediaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $binA = $this->binIn($a);
        $binB = $this->binIn($b);
        Sanctum::actingAs($this->makeScopedUser('Op Transfer', $a));

        // Seed stock di A via penerimaan Selesai.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-03-01',
            'warehouse_id' => $a->id,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'to_bin_id' => $binA->id, 'unit_cost' => 1000]],
        ])->assertCreated();

        // A→B: asal diizinkan, tujuan bebas → 201.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Selesai',
            'document_date' => '2026-03-02',
            'warehouse_id' => $a->id,
            'destination_warehouse_id' => $b->id,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 4, 'from_bin_id' => $binA->id, 'to_bin_id' => $binB->id]],
        ])->assertCreated();

        // B→A: asal asing → 422 walau tujuan milik sendiri.
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Transfer Gudang',
            'status' => 'Draft',
            'document_date' => '2026-03-03',
            'warehouse_id' => $b->id,
            'destination_warehouse_id' => $a->id,
            'partner' => null,
            'lines' => [['item_id' => $item->id, 'qty' => 1, 'from_bin_id' => $binB->id, 'to_bin_id' => $binA->id]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_id');
    }

    public function test_post_endpoint_rejects_foreign_origin(): void
    {
        $this->makeTerbatasWriter('Op Post', ['Persediaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $doc = StockDocument::create([
            'no' => 'BM/2026/00999', 'type' => 'Penerimaan', 'status' => 'Draft',
            'document_date' => '2026-03-01', 'warehouse_id' => $b->id,
        ]);
        Sanctum::actingAs($this->makeScopedUser('Op Post', $a));

        // Guard service (bukan validasi store) yang menolak → 422 eksplisit.
        $this->postJson("/api/persediaan/stock-documents/{$doc->id}/post")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Gudang asal dokumen di luar lingkup akses Anda.');
    }

    public function test_proc_docs_store_is_scoped(): void
    {
        $this->makeTerbatasWriter('Op Proc', ['Pengadaan']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        $item = Item::factory()->create();
        $department = Department::factory()->create();
        $supplier = Supplier::factory()->create();
        Sanctum::actingAs($this->makeScopedUser('Op Proc', $a));

        $payload = fn (int $whId) => [
            'kind' => 'PR',
            'document_date' => '2026-03-01',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $whId,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1500]],
        ];

        $this->postJson('/api/pengadaan/proc-docs', $payload($a->id))->assertCreated();
        $this->postJson('/api/pengadaan/proc-docs', $payload($b->id))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_id');
    }
}
