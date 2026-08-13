<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProcDocRequest;
use App\Http\Requests\UpdateProcDocRequest;
use App\Http\Resources\ProcDocResource;
use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\ProcDocApproval;
use App\Models\ProcDocLine;
use App\Support\ApprovalEngine;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProcDocController extends Controller
{
    private const LOAD_DETAIL = [
        'warehouse',
        'department',
        'supplier',
        'requester',
        'activeApprover',
        'approver',
        'creator',
        'approvals.approver',
        'lines.item.unit',
    ];

    /**
     * Daftar dokumen pengadaan (scope saat ini: Purchase Request, kind=PR) —
     * searchable by nomor/departemen/supplier/referensi, filterable by status,
     * departemen, dan gudang tujuan.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'kind' => ['nullable', 'string', Rule::in(ProcDoc::KINDS)],
            'status' => ['nullable', 'string', Rule::in(ProcDoc::PR_STATUSES)],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = ProcDoc::query()
            ->with(['warehouse', 'department', 'supplier', 'requester'])
            ->withCount('lines')
            ->withSum('lines as qty_total', 'qty')
            ->withSum('lines as value_total', DB::raw('qty * price'));

        if ($needle = strtolower((string) ($data['search'] ?? ''))) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(no) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(reference) LIKE ?', ["%{$needle}%"])
                    ->orWhereHas('department', fn ($d) => $d->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]))
                    ->orWhereHas('supplier', fn ($s) => $s->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]))
                    ->orWhereHas('warehouse', fn ($w) => $w->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]));
            });
        }

        $query->when($data['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($data['department_id'] ?? null, fn ($q, $departmentId) => $q->where('department_id', $departmentId))
            ->when($data['warehouse_id'] ?? null, fn ($q, $warehouseId) => $q->where('warehouse_id', $warehouseId));

        $query->orderByDesc('document_date')->orderByDesc('id');

        return ProcDocResource::collection(
            $query->paginate((int) $request->query('per_page', 20))
        );
    }

    /**
     * Simpan Purchase Request baru (selalu berstatus Draft). Nomor di-generate
     * otomatis: PR/YYYY/#### (tahun-scoped).
     */
    public function store(StoreProcDocRequest $request): ProcDocResource
    {
        $data = $request->validated();

        $doc = DB::transaction(function () use ($data, $request) {
            $procDoc = ProcDoc::create([
                'no' => CodeGenerator::nextYearly(ProcDoc::class, 'PR', 'no', 4),
                'kind' => 'PR',
                'status' => 'Draft',
                'document_date' => $data['document_date'],
                'need_date' => $data['need_date'] ?? null,
                'requester_user_id' => $data['requester_user_id'] ?? $request->user()?->id,
                'department_id' => $data['department_id'],
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            $this->saveLines($procDoc, $data['lines']);

            return $procDoc;
        });

        return new ProcDocResource($this->loadDetail($doc));
    }

    public function show(ProcDoc $procDoc): ProcDocResource
    {
        return new ProcDocResource($this->loadDetail($procDoc));
    }

    /**
     * Perbarui Purchase Request — hanya dokumen berstatus Draft yang bisa diubah.
     */
    public function update(UpdateProcDocRequest $request, ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $procDoc->isDraft()) {
            return response()->json(['message' => 'Hanya Purchase Request berstatus Draft yang dapat diubah.'], 422);
        }

        $data = $request->validated();

        DB::transaction(function () use ($procDoc, $data, $request) {
            $procDoc->update([
                'document_date' => $data['document_date'],
                'need_date' => $data['need_date'] ?? null,
                'requester_user_id' => $data['requester_user_id'] ?? $request->user()?->id,
                'department_id' => $data['department_id'],
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
            ]);

            $procDoc->lines()->delete();
            $this->saveLines($procDoc, $data['lines']);
        });

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Hapus Purchase Request — hanya dokumen berstatus Draft.
     */
    public function destroy(ProcDoc $procDoc): JsonResponse
    {
        if (! $procDoc->isDraft()) {
            return response()->json(['message' => 'Hanya Purchase Request berstatus Draft yang dapat dihapus.'], 422);
        }

        $procDoc->delete();

        return response()->json(['message' => 'Purchase Request berhasil dihapus.'], 200);
    }

    /**
     * Ajukan approval: Draft → Menunggu Approval.
     */
    public function submit(ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $procDoc->isDraft()) {
            return response()->json(['message' => 'Hanya dokumen pengadaan berstatus Draft yang dapat diajukan.'], 422);
        }

        $procDoc->update(['status' => 'Menunggu Approval', 'submitted_at' => now()]);

        ApprovalEngine::start($procDoc);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Setujui dokumen pengadaan yang menunggu approval (approver ditunjuk
     * atau user Pengadaan Kelola; requester tidak boleh menyetujui sendiri).
     */
    public function approve(ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $procDoc->isPendingApproval()) {
            return response()->json(['message' => 'Hanya dokumen pengadaan berstatus Menunggu Approval yang dapat disetujui.'], 422);
        }

        $user = request()->user();
        if (! ApprovalEngine::canDecide($procDoc, (int) $user?->id)) {
            return response()->json(['message' => 'Anda tidak berwenang menyetujui dokumen ini.'], 403);
        }

        ApprovalEngine::decide($procDoc, (int) $user->id, 'Disetujui', null);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Tolak dokumen pengadaan yang menunggu approval — alasan penolakan wajib.
     */
    public function reject(Request $request, ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        $data = $request->validate([
            'decision_note' => ['required', 'string', 'max:1000'],
        ]);

        if (! $procDoc->isPendingApproval()) {
            return response()->json(['message' => 'Hanya dokumen pengadaan berstatus Menunggu Approval yang dapat ditolak.'], 422);
        }

        if (! ApprovalEngine::canDecide($procDoc, (int) $request->user()?->id)) {
            return response()->json(['message' => 'Anda tidak berwenang menolak dokumen ini.'], 403);
        }

        ApprovalEngine::decide($procDoc, (int) $request->user()?->id, 'Ditolak', $data['decision_note']);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Batalkan dokumen pengadaan (Draft atau Menunggu Approval).
     */
    public function cancel(ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $procDoc->isDraft() && ! $procDoc->isPendingApproval()) {
            return response()->json(['message' => 'Dokumen pengadaan dengan status ini tidak dapat dibatalkan.'], 422);
        }

        $wasPending = $procDoc->isPendingApproval();

        $procDoc->update([
            'status' => 'Dibatalkan',
            'approver_user_id' => null,
        ]);

        if ($wasPending) {
            ProcDocApproval::where('proc_doc_id', $procDoc->id)
                ->where('status', 'Menunggu')
                ->delete();
        }

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    private function saveLines(ProcDoc $procDoc, array $lines): void
    {
        $items = Item::whereIn('id', collect($lines)->pluck('item_id')->filter()->unique()->values())
            ->get()
            ->keyBy('id');

        foreach ($lines as $index => $line) {
            $item = $items->get((int) $line['item_id']);

            ProcDocLine::create([
                'proc_doc_id' => $procDoc->id,
                'line_no' => $index + 1,
                'item_id' => $line['item_id'],
                'qty' => $line['qty'],
                'unit_id' => $line['unit_id'] ?? $item?->unit_id,
                'price' => $line['price'],
            ]);
        }
    }

    private function loadDetail(ProcDoc $procDoc): ProcDoc
    {
        $procDoc->load(self::LOAD_DETAIL);
        $procDoc->loadCount('lines');
        $procDoc->setAttribute('qty_total', (int) $procDoc->lines->sum('qty'));
        $procDoc->setAttribute('value_total', (float) $procDoc->lines->sum(fn (ProcDocLine $l) => $l->subtotal()));

        return $procDoc;
    }
}
