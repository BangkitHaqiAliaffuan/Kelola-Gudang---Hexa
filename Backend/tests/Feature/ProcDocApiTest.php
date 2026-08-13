<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\RolePermission;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Testing\Fluent\AssertableJson;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProcDocApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsProcurement();
    }

    public function test_unauthenticated_returns_401(): void
    {
        // Lepas sesi yang di-set di setUp agar request benar-benar tanpa auth.
        Auth::guard('sanctum')->forgetUser();

        $this->getJson('/api/pengadaan/proc-docs')
            ->assertUnauthorized();
    }

    public function test_requires_pengadaan_access(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'No Proc', 'module' => 'Master Data'],
            ['level' => 'Kelola'],
        );
        Sanctum::actingAs($this->makeUser('No Proc'), ['*'], 'sanctum');

        $this->getJson('/api/pengadaan/proc-docs')
            ->assertForbidden();
    }

    public function test_store_creates_draft_pr_with_generated_no(): void
    {
        $item = $this->makeItem();
        [$department, $supplier, $warehouse] = $this->makeContext();

        $res = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'reference' => 'BUDGET-4321',
            'note' => 'Restock item minimum',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 50, 'price' => 1500],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.kind', 'PR')
                ->where('data.status', 'Draft')
                ->where('data.reference', 'BUDGET-4321')
                ->where('data.department_id', $department->id)
                ->where('data.supplier_id', $supplier->id)
                ->where('data.warehouse_id', $warehouse->id)
                ->where('data.line_count', 1)
                ->where('data.no', fn ($v) => (bool) preg_match('/^PR\/\d{4}\/\d{4}$/', (string) $v))
                ->has('data.lines', 1)
                ->where('data.lines.0.item_id', $item->id)
                ->where('data.lines.0.qty', 50)
                ->where('data.lines.0.price', 1500)
                // unit_id di-backfill dari item
                ->where('data.lines.0.unit_id', $item->unit_id));

        $doc = ProcDoc::where('no', $res->json('data.no'))->firstOrFail();
        $this->assertTrue($doc->isDraft());
        $this->assertNull($doc->submitted_at);
        $this->assertSame(50, $doc->lines()->firstOrFail()->qty);
    }

    public function test_store_validation_rules(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $base = [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ];

        $cases = [
            'missing lines' => ['lines' => []],
            'kind invalid' => ['kind' => 'PO'],
            'supplier required' => ['supplier_id' => null],
            'department required' => ['department_id' => null],
            'warehouse required' => ['warehouse_id' => null],
            'need_date before document' => ['need_date' => '2026-08-01'],
            'qty zero' => ['lines' => [['item_id' => $item->id, 'qty' => 0, 'price' => 1000]]],
            'qty negative' => ['lines' => [['item_id' => $item->id, 'qty' => -5, 'price' => 1000]]],
            'item missing' => ['lines' => [['item_id' => 99999999, 'qty' => 1, 'price' => 1000]]],
            'price negative' => ['lines' => [['item_id' => $item->id, 'qty' => 1, 'price' => -1]]],
        ];

        $before = ProcDoc::count();

        foreach ($cases as $name => $mutations) {
            $this->postJson('/api/pengadaan/proc-docs', array_merge($base, $mutations))
                ->assertStatus(422, "kasus validasi gagal: {$name}");
        }

        $this->assertSame($before, ProcDoc::count());
    }

    public function test_index_returns_qty_value_aggregates_and_filters(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'price' => 1500],
                ['item_id' => $item->id, 'qty' => 3, 'price' => 1500],
            ],
        ])->assertStatus(201)->json('data.no');

        $row = collect($this->getJson('/api/pengadaan/proc-docs?per_page=10000')->assertOk()->json('data'))
            ->firstWhere('no', $no);

        $this->assertNotNull($row, 'dokumen tidak muncul di index');
        $this->assertArrayHasKey('qty_total', $row);
        $this->assertArrayHasKey('value_total', $row);
        $this->assertSame(13, $row['qty_total']);
        $this->assertSame(19500, (int) $row['value_total']);

        // Filter status: Draft hanya memuat dokumen baru.
        $this->assertSame(1, count($this->getJson('/api/pengadaan/proc-docs?status=Draft&per_page=10000')->assertOk()->json('data')));
        $this->assertSame(0, count($this->getJson('/api/pengadaan/proc-docs?status=Disetujui&per_page=10000')->assertOk()->json('data')));
    }

    public function test_show_returns_lines_with_item_and_unit(): void
    {
        $item = $this->makeItem();
        [$department, $supplier, $warehouse] = $this->makeContext();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 2000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->getJson("/api/pengadaan/proc-docs/{$doc->id}")
            ->assertOk()
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.no', $no)
                ->has('data.lines', 1)
                ->where('data.lines.0.sku', $item->sku)
                ->where('data.lines.0.name', $item->name)
                ->where('data.lines.0.subtotal', 10000)
                ->where('data.qty_total', 5)
                ->where('data.value_total', 10000));
    }

    public function test_update_only_draft(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $itemA = $this->makeItem();
        $itemB = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $itemA->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->putJson("/api/pengadaan/proc-docs/{$doc->id}", [
            'document_date' => '2026-08-13',
            'need_date' => '2026-08-30',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'reference' => 'BUDGET-9999',
            'lines' => [
                ['item_id' => $itemB->id, 'qty' => 7, 'price' => 2500],
            ],
        ])->assertOk()
            ->assertJsonPath('data.reference', 'BUDGET-9999')
            ->assertJsonPath('data.line_count', 1)
            ->assertJsonPath('data.lines.0.item_id', $itemB->id)
            ->assertJsonPath('data.lines.0.qty', 7);

        $this->assertSame(1, $doc->fresh()->lines()->count());

        // Setelah diajukan (Menunggu Approval), update diblokir.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $this->putJson("/api/pengadaan/proc-docs/{$doc->id}", [
            'document_date' => '2026-08-13',
            'need_date' => '2026-08-30',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $itemB->id, 'qty' => 7, 'price' => 2500],
            ],
        ])->assertStatus(422);
    }

    public function test_destroy_only_draft(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->deleteJson("/api/pengadaan/proc-docs/{$doc->id}")->assertOk();
        $this->assertDatabaseMissing('proc_docs', ['id' => $doc->id]);

        // Recreate lalu submit → destroy diblokir.
        $no2 = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc2 = ProcDoc::where('no', $no2)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc2->id}/submit")->assertOk();

        $this->deleteJson("/api/pengadaan/proc-docs/{$doc2->id}")->assertStatus(422);
    }

    public function test_submit_flows_draft_to_pending(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'Menunggu Approval')
            ->assertJsonPath('data.submitted_at', fn ($v) => $v !== null);

        // Submit ulang diblokir.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertStatus(422);
    }

    public function test_approve_flows_pending_to_approved(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        // Approve langsung pada Draft → 422.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(422);

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui')
            ->assertJsonPath('data.approved_at', fn ($v) => $v !== null);

        $doc->refresh();
        $this->assertNotNull($doc->approved_by);
        $this->assertNotNull($doc->approved_at);
    }

    public function test_reject_requires_reason(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'need_date' => '2026-08-25',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reject")
            ->assertStatus(422)
            ->assertJsonValidationErrors('decision_note');

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reject", ['decision_note' => 'Melebihi anggaran'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Ditolak')
            ->assertJsonPath('data.decision_note', 'Melebihi anggaran');
    }

    public function test_cancel_from_draft_and_pending(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $makeDoc = function () use ($department, $supplier, $warehouse, $item): ProcDoc {
            $no = $this->postJson('/api/pengadaan/proc-docs', [
                'kind' => 'PR',
                'document_date' => '2026-08-12',
                'need_date' => '2026-08-25',
                'department_id' => $department->id,
                'supplier_id' => $supplier->id,
                'warehouse_id' => $warehouse->id,
                'lines' => [
                    ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
                ],
            ])->assertStatus(201)->json('data.no');

            return ProcDoc::where('no', $no)->firstOrFail();
        };

        $draft = $makeDoc();
        $this->postJson("/api/pengadaan/proc-docs/{$draft->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'Dibatalkan');

        $pending = $makeDoc();
        $this->postJson("/api/pengadaan/proc-docs/{$pending->id}/submit")->assertOk();
        $this->postJson("/api/pengadaan/proc-docs/{$pending->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'Dibatalkan');

        // Cancel dokumen Disetujui → 422.
        $approved = $makeDoc();
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/submit")->assertOk();
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/approve")->assertOk();
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/cancel")->assertStatus(422);
    }

    private function actingAsProcurement(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Procurement Test', 'module' => 'Pengadaan'],
            ['level' => 'Kelola'],
        );

        Sanctum::actingAs($this->makeUser('Procurement Test'), ['*'], 'sanctum');
    }

    private function makeUser(string $role): User
    {
        return User::factory()->create([
            'name' => 'Procurement Admin',
            'email' => 'procurement.'.strtolower(str_replace(' ', '', $role)).'@test.local',
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function makeItem(): Item
    {
        $unique = random_int(10000, 99999);

        return Item::factory()->create([
            'sku' => "SKU-PROC-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-PROC-{$unique}",
        ]);
    }

    /** @return array{0: Department, 1: Supplier, 2: Warehouse} */
    private function makeContext(): array
    {
        return [
            Department::factory()->create(),
            Supplier::factory()->create(),
            Warehouse::factory()->create(),
        ];
    }
}
