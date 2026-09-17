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

    public function test_admin_manages_role_scope_mode(): void
    {
        $this->actingAsMasterAdmin();

        $this->postJson('/api/master/roles', ['name' => 'Op Dinamis'])
            ->assertCreated()
            ->assertJsonPath('data.warehouse_scope_mode', 'Semua');

        $this->putJson('/api/master/roles/Op Dinamis', ['warehouse_scope_mode' => 'Terbatas'])
            ->assertOk()
            ->assertJsonPath('data.warehouse_scope_mode', 'Terbatas');

        $this->putJson('/api/master/roles/Op Dinamis', ['warehouse_scope_mode' => 'Bebas'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_scope_mode');

        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Op Dinamis', 'warehouse_scope_mode' => 'Terbatas']);
    }

    public function test_admin_assigns_warehouses_to_user_with_w4_guard(): void
    {
        $this->actingAsMasterAdmin();
        Role::create(['name' => 'Op W4', 'warehouse_scope_mode' => 'Terbatas']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();

        $base = [
            'name' => 'Operator W4',
            'email' => 'opw4@test.local',
            'role' => 'Op W4',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        // Tanpa gudang & tanpa default → 422 (W4).
        $this->postJson('/api/master/users', $base)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_ids');

        // Dengan pivot → 201 + ids terbaca di show.
        $id = $this->postJson('/api/master/users', [...$base, 'warehouse_ids' => [$a->id, $b->id]])
            ->assertCreated()
            ->json('data.id');

        $this->getJson("/api/master/users/{$id}")
            ->assertOk()
            ->assertJsonPath('data.warehouse_ids', [$a->id, $b->id]);

        // Update sync pivot.
        $this->putJson("/api/master/users/{$id}", [
            'name' => 'Operator W4',
            'email' => 'opw4@test.local',
            'role' => 'Op W4',
            'warehouse_ids' => [$b->id],
        ])->assertOk()->assertJsonPath('data.warehouse_ids', [$b->id]);

        // Hapus semua pivot tanpa default → 422.
        $this->putJson("/api/master/users/{$id}", [
            'name' => 'Operator W4',
            'email' => 'opw4@test.local',
            'role' => 'Op W4',
            'warehouse_ids' => [],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('warehouse_ids');
    }
}
