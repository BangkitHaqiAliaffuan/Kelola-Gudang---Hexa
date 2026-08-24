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

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ];

        $cases = [
            'missing lines' => ['lines' => []],
            'kind invalid' => ['kind' => 'GR'],
            'supplier required' => ['supplier_id' => null],
            'department required' => ['department_id' => null],
            'warehouse required' => ['warehouse_id' => null],
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
                ->where('data.lines.0.unit', $item->unit?->name)
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
        $this->makeSupervisor();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $this->putJson("/api/pengadaan/proc-docs/{$doc->id}", [
            'document_date' => '2026-08-13',

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

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc2 = ProcDoc::where('no', $no2)->firstOrFail();
        $this->makeSupervisor();
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

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->makeSupervisor();
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
        $supervisor = $this->makeSupervisor();

        // Kepala departemen pemohon = Supervisor → ditugaskan sebagai approver PR.
        $department->update(['head_user_id' => $supervisor->id]);

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

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

        // Submit → approver yang ditunjuk = kepala departemen pemohon.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'Menunggu Approval')
            ->assertJsonPath('data.approver_user_id', $supervisor->id)
            ->assertJsonPath('data.approver', $supervisor->name);

        // User lain yang bukan Supervisor (tanpa Kelola) → 403.
        Sanctum::actingAs($this->makeUser('Stranger'), ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // Supervisor → Disetujui + riwayat.
        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui')
            ->assertJsonPath('data.approved_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.approvals.0.status', 'Disetujui')
            ->assertJsonPath('data.approvals.0.approver', $supervisor->name);

        $doc->refresh();
        $this->assertNotNull($doc->approved_by);
        $this->assertNotNull($doc->approved_at);
        $this->assertNull($doc->approver_user_id);
    }

    public function test_requester_cannot_approve_own_doc(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->makeSupervisor();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        // Requester (meski Pengadaan Kelola) tidak boleh menyetujui sendiri — SoD.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);
    }

    public function test_approver_null_when_no_supervisor_kelola_override(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Requester Tulis', 'module' => 'Pengadaan'],
            ['level' => 'Tulis'],
        );
        $requester = $this->makeUser('Requester Tulis');

        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        Sanctum::actingAs($requester, ['*'], 'sanctum');

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        // Tanpa Supervisor aktif → fallback ke Pengadaan Kelola (Procurement Test dari setUp).
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $doc->refresh();
        $this->assertNotNull($doc->approver_user_id);
        // Hanya approver yang ditugaskan yang boleh memutuskan (strict).
        $kelola = $this->makeUser('Kelola Test');
        RolePermission::firstOrCreate(
            ['role' => 'Kelola Test', 'module' => 'Pengadaan'],
            ['level' => 'Kelola'],
        );
        Sanctum::actingAs($kelola, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // Approver yang ditugaskan (fallback Kelola) dapat menyetujui.
        $assigned = User::find($doc->approver_user_id);
        Sanctum::actingAs($assigned, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_supervisor_requester_cannot_approve_own_doc(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Supervisor', 'module' => 'Pengadaan'],
            ['level' => 'Tulis'],
        );
        $supervisor = $this->makeUser('Supervisor');

        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        // Satu-satunya Supervisor == requester → fallback ke Pengadaan Kelola (strict, tidak null).
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $doc->refresh();
        $this->assertNotNull($doc->approver_user_id);
        $this->assertNotEquals($supervisor->id, $doc->approver_user_id);

        // Supervisor (requester) tidak boleh menyetujui sendiri — SoD.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // Hanya approver yang ditugaskan (fallback Kelola) yang boleh menyetujui.
        $assigned = User::find($doc->approver_user_id);
        Sanctum::actingAs($assigned, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_reject_without_reason_allowed(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        // User non-Supervisor (tanpa Kelola) → 403.
        Sanctum::actingAs($this->makeUser('Stranger'), ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reject", ['decision_note' => 'Melebihi anggaran'])
            ->assertStatus(403);

        // Supervisor: tanpa catatan → tetap Ditolak (decision_note null).
        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', 'Ditolak')
            ->assertJsonPath('data.decision_note', null)
            ->assertJsonPath('data.approvals.0.status', 'Ditolak');

        // Dokumen kedua: dengan catatan → Ditolak + note tercatat.
        $this->actingAsProcurement();
        $no2 = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc2 = ProcDoc::where('no', $no2)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc2->id}/submit")->assertOk();

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc2->id}/reject", ['decision_note' => 'Melebihi anggaran'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Ditolak')
            ->assertJsonPath('data.decision_note', 'Melebihi anggaran')
            ->assertJsonPath('data.approvals.0.status', 'Ditolak');
    }

    public function test_cancel_from_draft_and_pending(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $makeDoc = function () use ($department, $supplier, $warehouse, $item): ProcDoc {
            $no = $this->postJson('/api/pengadaan/proc-docs', [
                'kind' => 'PR',
                'document_date' => '2026-08-12',

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
        $this->makeSupervisor();
        $this->postJson("/api/pengadaan/proc-docs/{$pending->id}/submit")->assertOk();
        $this->postJson("/api/pengadaan/proc-docs/{$pending->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'Dibatalkan');

        // Cancel dokumen Disetujui → 422.
        [$d2, $s2, $w2] = $this->makeContext();
        $supervisor = $this->makeSupervisor();
        $no2 = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $d2->id,
            'supplier_id' => $s2->id,
            'warehouse_id' => $w2->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $approved = ProcDoc::where('no', $no2)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/submit")->assertOk();

        $approved->refresh();
        $assigned = User::find($approved->approver_user_id);
        Sanctum::actingAs($assigned, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/approve")->assertOk();

        // PR Disetujui yang belum dirujuk PO kini dapat dibatalkan.
        $this->actingAsProcurement();
        $this->postJson("/api/pengadaan/proc-docs/{$approved->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'Dibatalkan');

        // PR Disetujui yang sudah dirujuk PO → 422.
        $no3 = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $d2->id,
            'supplier_id' => $s2->id,
            'warehouse_id' => $w2->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $referenced = ProcDoc::where('no', $no3)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$referenced->id}/submit")->assertOk();
        $referenced->refresh();
        $assignedRef = User::find($referenced->approver_user_id);
        Sanctum::actingAs($assignedRef, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$referenced->id}/approve")->assertOk();
        $this->actingAsProcurement();

        $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',

            'department_id' => $d2->id,
            'supplier_id' => $s2->id,
            'warehouse_id' => $w2->id,
            'source_proc_doc_id' => $referenced->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201);

        $this->postJson("/api/pengadaan/proc-docs/{$referenced->id}/cancel")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Dokumen telah diterbitkan menjadi Purchase Order — tidak dapat dibatalkan.');
    }

    public function test_store_po_references_approved_pr(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'price' => 1500],
            ],
        ])->assertStatus(201)->json('data.no');

        $pr = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/submit")->assertOk();

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/approve")->assertOk();
        $this->actingAsProcurement();

        // PO merujuk PR Disetujui dengan baris identik → langsung Disetujui
        // (tanpa approval kedua) + riwayat approval otomatis.
        $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $pr->id,
            'reference' => 'PO-DARI-PR',
            'note' => 'Tindak lanjut PR',
            'lines' => [
                ['item_id' => $item->id, 'qty' => 10, 'price' => 1500],
            ],
        ])->assertStatus(201)
            ->assertJson(fn (AssertableJson $json) => $json
                ->where('data.kind', 'PO')
                ->where('data.status', 'Disetujui')
                ->where('data.source_proc_doc_id', $pr->id)
                ->where('data.source_proc_doc', $pr->no)
                ->where('data.reference', 'PO-DARI-PR')
                ->where('data.no', fn ($v) => (bool) preg_match('/^PO\/\d{4}\/\d{4}$/', (string) $v))
                ->where('data.approved_at', fn ($v) => $v !== null)
                ->has('data.approvals', 1)
                ->where('data.approvals.0.status', 'Disetujui')
                ->where('data.approvals.0.decision_note', 'Disetujui otomatis dari PR '.$pr->no));

        // source PR yang belum disetujui → 422.
        $noPending = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $draftPr = ProcDoc::where('no', $noPending)->firstOrFail();

        $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $draftPr->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('source_proc_doc_id');
    }

    public function test_po_index_filters_by_kind_and_status(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();

        // Satu PR → Disetujui → jadikan PO (Draft).
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $pr = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/submit")->assertOk();

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/approve")->assertOk();
        $this->actingAsProcurement();

        $poNo = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',

            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $pr->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $poRows = collect($this->getJson('/api/pengadaan/proc-docs?kind=PO&per_page=10000')->assertOk()->json('data'));
        $this->assertTrue($poRows->contains('no', $poNo));
        $this->assertFalse($poRows->contains('no', $no));

        $prRows = collect($this->getJson('/api/pengadaan/proc-docs?kind=PR&per_page=10000')->assertOk()->json('data'));
        $this->assertTrue($prRows->contains('no', $no));
        $this->assertFalse($prRows->contains('no', $poNo));

        // Status filter memvalidasi set status sesuai kind.
        $this->getJson('/api/pengadaan/proc-docs?kind=PR&status=Disetujui&per_page=10000')->assertOk();
        $this->getJson('/api/pengadaan/proc-docs?kind=PO&status=Disetujui&per_page=10000')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_index_non_manager_hides_others_drafts(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $supervisor = $this->makeSupervisor();
        RolePermission::firstOrCreate(
            ['role' => 'Supervisor', 'module' => 'Pengadaan'],
            ['level' => 'Tulis'],
        );
        $other = $this->makeUser('Operator Gudang');

        $base = [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ];

        // Procurement (Kelola) membuat Draft milik supervisor, Draft milik orang
        // lain, dan satu dokumen ter-submit milik orang lain.
        $mineNo = $this->postJson('/api/pengadaan/proc-docs', $base + ['requester_user_id' => $supervisor->id])
            ->assertStatus(201)->json('data.no');
        $othersDraftNo = $this->postJson('/api/pengadaan/proc-docs', $base + ['requester_user_id' => $other->id])
            ->assertStatus(201)->json('data.no');
        $othersSubmittedNo = $this->postJson('/api/pengadaan/proc-docs', $base + ['requester_user_id' => $other->id])
            ->assertStatus(201)->json('data.no');

        $othersSubmitted = ProcDoc::where('no', $othersSubmittedNo)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$othersSubmitted->id}/submit")->assertOk();

        // Supervisor (Pengadaan Tulis, non-Kelola): Draft milik sendiri + dokumen
        // ter-submit siapa pun tampil; Draft milik orang lain disembunyikan.
        Sanctum::actingAs($supervisor, ['*'], 'sanctum');

        $numbers = array_column($this->getJson('/api/pengadaan/proc-docs?per_page=10000')->assertOk()->json('data'), 'no');

        $this->assertContains($mineNo, $numbers);
        $this->assertContains($othersSubmittedNo, $numbers);
        $this->assertNotContains($othersDraftNo, $numbers);

        // Filter status=Draft juga dibatasi ke Draft milik sendiri.
        $drafts = array_column(
            $this->getJson('/api/pengadaan/proc-docs?status=Draft&per_page=10000')->assertOk()->json('data'),
            'no'
        );
        $this->assertContains($mineNo, $drafts);
        $this->assertNotContains($othersDraftNo, $drafts);
    }

    public function test_show_draft_of_other_forbidden_for_non_manager(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $other = $this->makeUser('Operator Gudang');
        $supervisor = $this->makeSupervisor();
        RolePermission::firstOrCreate(
            ['role' => 'Supervisor', 'module' => 'Pengadaan'],
            ['level' => 'Tulis'],
        );

        $base = [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ];

        $othersNo = $this->postJson('/api/pengadaan/proc-docs', $base + ['requester_user_id' => $other->id])
            ->assertStatus(201)->json('data.no');
        $othersDoc = ProcDoc::where('no', $othersNo)->firstOrFail();

        // Supervisor non-Kelola: Draft milik orang lain → 403.
        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->getJson("/api/pengadaan/proc-docs/{$othersDoc->id}")->assertStatus(403);

        // Draft milik sendiri → 200.
        $mineNo = $this->postJson('/api/pengadaan/proc-docs', $base + ['requester_user_id' => $supervisor->id])
            ->assertStatus(201)->json('data.no');
        $mineDoc = ProcDoc::where('no', $mineNo)->firstOrFail();
        $this->getJson("/api/pengadaan/proc-docs/{$mineDoc->id}")->assertOk();

        // User Pengadaan Kelola → semua Draft bisa diakses.
        $this->actingAsProcurement();
        $this->getJson("/api/pengadaan/proc-docs/{$othersDoc->id}")->assertOk();
    }

    public function test_role_with_approval_module_can_approve(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Approver Baru', 'module' => 'Approval Pengadaan'],
            ['level' => 'Baca'],
        );
        $approver = $this->makeUser('Approver Baru');

        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        // Kepala departemen pemohon = user ber-modul 'Approval Pengadaan'.
        $department->update(['head_user_id' => $approver->id]);

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        // resolveApprover menunjuk kepala departemen pemohon (user-based).
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $approver->id);

        Sanctum::actingAs($approver, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_role_with_pengadaan_tulis_without_approval_module_cannot_approve(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Tulis Saja', 'module' => 'Pengadaan'],
            ['level' => 'Tulis'],
        );
        $nonApprover = $this->makeUser('Tulis Saja');

        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        Sanctum::actingAs($nonApprover, ['*'], 'sanctum');
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [
                ['item_id' => $item->id, 'qty' => 5, 'price' => 1000],
            ],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        // Tanpa Approval Pengadaan → fallback ke Pengadaan Kelola (strict, tidak null).
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();
        $doc->refresh();
        $this->assertNotNull($doc->approver_user_id);

        // Pengadaan Tulis tanpa modul approval dan bukan approver → 403.
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);
    }

    public function test_pr_submit_assigns_department_head(): void
    {
        $head = $this->makeUser('Operator Gudang');
        [$department, $supplier, $warehouse] = $this->makeContext();
        $department->update(['head_user_id' => $head->id]);
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();

        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $head->id)
            ->assertJsonPath('data.approver', $head->name);
    }

    public function test_pr_submit_head_equals_requester_not_assigned(): void
    {
        $requester = $this->makeUser('Operator Gudang');
        [$department, $supplier, $warehouse] = $this->makeContext();
        $department->update(['head_user_id' => $requester->id]);
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'requester_user_id' => $requester->id,
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $doc->refresh();
        $this->assertNotNull($doc->approver_user_id);
        $this->assertNotEquals($requester->id, $doc->approver_user_id);
    }

    public function test_department_head_can_approve_pr_without_module(): void
    {
        $head = $this->makeUser('Operator Gudang');
        [$department, $supplier, $warehouse] = $this->makeContext();
        $department->update(['head_user_id' => $head->id]);
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        // Kepala departemen (tanpa modul approval / Kelola) berhak memutuskan
        // karena ditugaskan sebagai approver.
        Sanctum::actingAs($head, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_po_auto_approved_when_identical_to_pr(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $itemA = $this->makeItem();
        $itemB = $this->makeItem();

        $pr = $this->makeApprovedPr($itemA, $department, $supplier, $warehouse, [
            ['item_id' => $itemA->id, 'qty' => 10, 'price' => 1500],
            ['item_id' => $itemB->id, 'qty' => 5, 'price' => 2000],
        ]);

        // Baris dikirim dengan urutan terbalik → tetap dianggap identik persis.
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $pr->id,
            'lines' => [
                ['item_id' => $itemB->id, 'qty' => 5, 'price' => 2000],
                ['item_id' => $itemA->id, 'qty' => 10, 'price' => 1500],
            ],
        ])->assertStatus(201)->json('data.no');

        $po = ProcDoc::where('no', $no)->firstOrFail();
        $this->assertTrue($po->isApproved());
        $this->assertNotNull($po->approved_at);
        $this->assertNotNull($po->submitted_at);
        $this->assertDatabaseHas('proc_doc_approvals', [
            'proc_doc_id' => $po->id,
            'level' => 1,
            'status' => 'Disetujui',
            'decision_note' => 'Disetujui otomatis dari PR '.$pr->no,
        ]);
    }

    public function test_po_not_auto_approved_when_lines_differ(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $pr = $this->makeApprovedPr($item, $department, $supplier, $warehouse, [
            ['item_id' => $item->id, 'qty' => 10, 'price' => 1500],
        ]);

        // Qty berbeda dari PR → tetap Draft (perlu approval manual).
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $pr->id,
            'lines' => [['item_id' => $item->id, 'qty' => 12, 'price' => 1500]],
        ])->assertStatus(201)->json('data.no');

        $po = ProcDoc::where('no', $no)->firstOrFail();
        $this->assertTrue($po->isDraft());
        $this->assertNull($po->approved_at);
        $this->assertSame(0, $po->approvals()->count());
    }

    public function test_po_not_auto_approved_when_supplier_differs(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $pr = $this->makeApprovedPr($item, $department, $supplier, $warehouse, [
            ['item_id' => $item->id, 'qty' => 10, 'price' => 1500],
        ]);

        $otherSupplier = Supplier::factory()->create();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',
            'department_id' => $department->id,
            'supplier_id' => $otherSupplier->id,
            'warehouse_id' => $warehouse->id,
            'source_proc_doc_id' => $pr->id,
            'lines' => [['item_id' => $item->id, 'qty' => 10, 'price' => 1500]],
        ])->assertStatus(201)->json('data.no');

        $po = ProcDoc::where('no', $no)->firstOrFail();
        $this->assertTrue($po->isDraft());
    }

    public function test_po_manual_without_source_stays_draft(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $po = ProcDoc::where('no', $no)->firstOrFail();
        $this->assertTrue($po->isDraft());
        $this->assertSame(0, $po->approvals()->count());
    }

    public function test_manual_po_approval_flow_role_based(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PO',
            'document_date' => '2026-08-13',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $po = ProcDoc::where('no', $no)->firstOrFail();

        // PO manual: approver ditugaskan berbasis role ber-modul 'Approval Pengadaan'.
        $this->postJson("/api/pengadaan/proc-docs/{$po->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'Menunggu Approval')
            ->assertJsonPath('data.approver_user_id', $supervisor->id);

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$po->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_only_assigned_can_approve_when_head_exists(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $head = $this->makeUser('Operator Gudang');
        $department->update(['head_user_id' => $head->id]);
        $otherApprover = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $head->id);

        // User dengan Approval Pengadaan lain (bukan assigned) → 403 strict.
        Sanctum::actingAs($otherApprover, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // Kelola juga tidak bisa override jika bukan assigned.
        $this->actingAsProcurement();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // Assigned head dapat menyetujui.
        Sanctum::actingAs($head, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Disetujui');
    }

    public function test_kelola_cannot_override_assigned(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();
        $department->update(['head_user_id' => $supervisor->id]);

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $this->actingAsProcurement();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);
    }

    public function test_pr_fallback_to_approval_and_kelola(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        // department tanpa head → fallback ke Approval Pengadaan
        $supervisor = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $supervisor->id);
    }

    public function test_pr_submit_returns_422_when_no_eligible_approver(): void
    {
        // Nonaktifkan semua user Kelola/Approval agar tidak ada fallback.
        User::query()->update(['is_active' => false]);
        // Buat requester baru aktif
        $requester = User::factory()->create(['is_active' => true, 'role' => 'Requester Tulis']);
        RolePermission::firstOrCreate(['role' => 'Requester Tulis', 'module' => 'Pengadaan'], ['level' => 'Tulis']);
        Sanctum::actingAs($requester, ['*'], 'sanctum');

        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertStatus(422)
            ->assertJsonPath('errors.approver_user_id.0', fn ($v) => str_contains((string) $v, 'Tidak ada approver'));
    }

    public function test_inactive_head_falls_back(): void
    {
        $head = $this->makeUser('Operator Gudang');
        $head->update(['is_active' => false]);
        [$department, $supplier, $warehouse] = $this->makeContext();
        $department->update(['head_user_id' => $head->id]);
        $item = $this->makeItem();
        $supervisor = $this->makeSupervisor();

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $supervisor->id);
    }

    public function test_reassign_by_kelola_and_strict(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $head = $this->makeUser('Operator Gudang');
        $department->update(['head_user_id' => $head->id]);

        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        $newApprover = $this->makeSupervisor();
        // Reassign butuh Kelola
        $this->actingAsProcurement();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reassign", ['approver_user_id' => $newApprover->id])
            ->assertOk()
            ->assertJsonPath('data.approver_user_id', $newApprover->id);

        // Old head tidak bisa lagi
        Sanctum::actingAs($head, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertStatus(403);

        // New approver bisa
        Sanctum::actingAs($newApprover, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/approve")->assertOk();
    }

    public function test_reassign_blocked_for_non_kelola_and_cannot_assign_requester(): void
    {
        [$department, $supplier, $warehouse] = $this->makeContext();
        $item = $this->makeItem();
        $head = $this->makeUser('Operator Gudang');
        $department->update(['head_user_id' => $head->id]);

        $requester = $this->makeUser('Requester Tulis');
        RolePermission::firstOrCreate(['role' => 'Requester Tulis', 'module' => 'Pengadaan'], ['level' => 'Tulis']);

        Sanctum::actingAs($requester, ['*'], 'sanctum');
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'requester_user_id' => $requester->id,
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => [['item_id' => $item->id, 'qty' => 5, 'price' => 1000]],
        ])->assertStatus(201)->json('data.no');

        $doc = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/submit")->assertOk();

        // Non-Kelola tidak bisa reassign
        Sanctum::actingAs($head, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reassign", ['approver_user_id' => $head->id])
            ->assertStatus(403);

        // Kelola tidak boleh assign ke requester (SoD)
        $this->actingAsProcurement();
        $this->postJson("/api/pengadaan/proc-docs/{$doc->id}/reassign", ['approver_user_id' => $requester->id])
            ->assertStatus(422);
    }

    /** Buat PR yang sudah Disetujui (requester = user procurement aktif). */
    private function makeApprovedPr(
        Item $item,
        Department $department,
        Supplier $supplier,
        Warehouse $warehouse,
        array $lines,
    ): ProcDoc {
        $supervisor = $this->makeSupervisor();
        $no = $this->postJson('/api/pengadaan/proc-docs', [
            'kind' => 'PR',
            'document_date' => '2026-08-12',
            'department_id' => $department->id,
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'lines' => $lines,
        ])->assertStatus(201)->json('data.no');

        $pr = ProcDoc::where('no', $no)->firstOrFail();
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/submit")->assertOk();

        Sanctum::actingAs($supervisor, ['*'], 'sanctum');
        $this->postJson("/api/pengadaan/proc-docs/{$pr->id}/approve")->assertOk();

        $this->actingAsProcurement();

        return $pr->fresh();
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
        $unique = random_int(10000, 99999);

        return User::factory()->create([
            'name' => 'Procurement Admin',
            'email' => 'procurement.'.strtolower(str_replace(' ', '', $role)).'.'.$unique.'@test.local',
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
            Department::factory()->create(['head_user_id' => null]),
            Supplier::factory()->create(),
            Warehouse::factory()->create(),
        ];
    }

    private function makeSupervisor(): User
    {
        RolePermission::firstOrCreate(
            ['role' => 'Supervisor', 'module' => 'Approval Pengadaan'],
            ['level' => 'Baca'],
        );

        return $this->makeUser('Supervisor');
    }
}
