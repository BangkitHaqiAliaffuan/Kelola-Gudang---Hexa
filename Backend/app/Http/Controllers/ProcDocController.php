<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProcDocRequest;
use App\Http\Requests\UpdateProcDocRequest;
use App\Http\Resources\ProcDocResource;
use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\ProcDocApproval;
use App\Models\ProcDocLine;
use App\Models\RolePermission;
use App\Models\User;
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
        'sourceProcDoc',
        'approvals.approver',
        'lines.item.unit',
        'lines.unit',
    ];

    /**
     * Daftar dokumen pengadaan (Purchase Request / Purchase Order) —
     * searchable by nomor/departemen/supplier/referensi, filterable by status,
     * departemen, dan gudang tujuan. Set status memvalidasi sesuai kind.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'kind' => ['nullable', 'string', Rule::in(ProcDoc::KINDS)],
            'status' => ['nullable', 'string', Rule::in(ProcDoc::statusesFor($request->input('kind')))],
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

        // Draft adalah pekerjaan pribadi pembuatnya: selain user Pengadaan Kelola,
        // hanya Draft milik sendiri (requester atau pembuat) yang terlihat.
        $user = $request->user();
        if ($user && ! $this->isPengadaanKelola($user)) {
            $query->where(function ($q) use ($user) {
                $q->where('status', '!=', 'Draft')
                    ->orWhere(function ($own) use ($user) {
                        $own->where('status', 'Draft')
                            ->where(function ($creator) use ($user) {
                                $creator->where('requester_user_id', $user->id)
                                    ->orWhere('created_by', $user->id);
                            });
                    });
            });
        }

        $query->orderByDesc('document_date')->orderByDesc('id');

        return ProcDocResource::collection(
            $query->paginate((int) $request->query('per_page', 20))
        );
    }

    /**
     * Simpan dokumen pengadaan baru (PR atau PO, berstatus Draft).
     * Nomor di-generate otomatis per kind: PR/YYYY/#### atau PO/YYYY/####.
     * PO boleh merujuk PR sumber yang sudah disetujui (source_proc_doc_id);
     * bila isi PO identik persis dengan PR sumber, PO langsung berstatus
     * Disetujui (tanpa approval kedua) dan dicatat sebagai approval otomatis.
     */
    public function store(StoreProcDocRequest $request): ProcDocResource
    {
        $data = $request->validated();

        $doc = DB::transaction(function () use ($data, $request) {
            $procDoc = ProcDoc::create([
                'no' => CodeGenerator::nextYearly(ProcDoc::class, $data['kind'], 'no', 4),
                'kind' => $data['kind'],
                'status' => 'Draft',
                'document_date' => $data['document_date'],
                'requester_user_id' => $data['requester_user_id'] ?? $request->user()?->id,
                'department_id' => $data['department_id'],
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'source_proc_doc_id' => $data['source_proc_doc_id'] ?? null,
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            $this->saveLines($procDoc, $data['lines']);

            if ($this->poMatchesSource($procDoc)) {
                $this->autoApprovePoFromPr($procDoc, (int) $request->user()?->id);
            }

            return $procDoc;
        });

        return new ProcDocResource($this->loadDetail($doc));
    }

    /**
     * PO dianggap "tidak berubah" dari PR sumber bila supplier & gudang sama
     * dan setiap baris identik persis (item + qty + harga). Urutan baris tidak
     * diperhitungkan — dibandingkan sebagai set yang dinormalisasi.
     */
    private function poMatchesSource(ProcDoc $procDoc): bool
    {
        if ($procDoc->kind !== 'PO' || $procDoc->source_proc_doc_id === null) {
            return false;
        }

        $source = $procDoc->sourceProcDoc()->with('lines')->first();
        if ($source === null) {
            return false;
        }

        if ($procDoc->supplier_id !== $source->supplier_id
            || $procDoc->warehouse_id !== $source->warehouse_id) {
            return false;
        }

        $poLines = $procDoc->lines()->get()->map(
            fn ($line) => [(int) $line->item_id, (int) $line->qty, round((float) $line->price, 4)]
        );
        $sourceLines = $source->lines->map(
            fn ($line) => [(int) $line->item_id, (int) $line->qty, round((float) $line->price, 4)]
        );

        if ($poLines->count() !== $sourceLines->count()) {
            return false;
        }

        $sortLines = fn ($lines) => $lines->sortBy(
            fn ($l) => sprintf('%d-%d-%s', $l[0], $l[1], number_format($l[2], 4, '.', ''))
        )->values();

        return $sortLines($poLines)->toArray() === $sortLines($sourceLines)->toArray();
    }

    /**
     * Finalisasi PO yang menyalin PR Disetujui: status langsung Disetujui,
     * approver = pembuat PO, riwayat approval "Disetujui otomatis dari PR".
     */
    private function autoApprovePoFromPr(ProcDoc $procDoc, int $userId): void
    {
        $source = $procDoc->sourceProcDoc()->first();

        ProcDocApproval::create([
            'proc_doc_id' => $procDoc->id,
            'level' => 1,
            'status' => 'Disetujui',
            'approver_user_id' => $userId,
            'decision_note' => 'Disetujui otomatis dari PR '.($source?->no ?? ''),
            'decided_at' => now(),
        ]);

        $procDoc->update([
            'status' => 'Disetujui',
            'submitted_at' => now(),
            'approver_user_id' => null,
            'approved_by' => $userId,
            'approved_at' => now(),
            'decision_note' => 'Disetujui otomatis dari PR '.($source?->no ?? ''),
        ]);
    }

    public function show(ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $this->canViewDoc(request()->user(), $procDoc)) {
            return response()->json(['message' => 'Dokumen Draft milik pengguna lain tidak dapat diakses.'], 403);
        }

        return new ProcDocResource($this->loadDetail($procDoc));
    }

    /**
     * Perbarui Purchase Request — hanya dokumen berstatus Draft yang bisa diubah.
     */
    public function update(UpdateProcDocRequest $request, ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if (! $this->canViewDoc($request->user(), $procDoc)) {
            return response()->json(['message' => 'Dokumen Draft milik pengguna lain tidak dapat diubah.'], 403);
        }

        if (! $procDoc->isDraft()) {
            return response()->json(['message' => 'Hanya Purchase Request berstatus Draft yang dapat diubah.'], 422);
        }

        $data = $request->validated();

        DB::transaction(function () use ($procDoc, $data, $request) {
            $procDoc->update([
                'document_date' => $data['document_date'],
                'requester_user_id' => $data['requester_user_id'] ?? $request->user()?->id,
                'department_id' => $data['department_id'],
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'source_proc_doc_id' => $data['source_proc_doc_id'] ?? $procDoc->source_proc_doc_id,
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
        if (! $this->canViewDoc(request()->user(), $procDoc)) {
            return response()->json(['message' => 'Dokumen Draft milik pengguna lain tidak dapat dihapus.'], 403);
        }

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
        if (! $this->canViewDoc(request()->user(), $procDoc)) {
            return response()->json(['message' => 'Dokumen Draft milik pengguna lain tidak dapat diajukan.'], 403);
        }

        if (! $procDoc->isDraft()) {
            return response()->json(['message' => 'Hanya dokumen pengadaan berstatus Draft yang dapat diajukan.'], 422);
        }

        $approverId = ApprovalEngine::resolveApprover($procDoc);
        if ($approverId === null) {
            return response()->json([
                'message' => 'Tidak ada approver yang memenuhi syarat — hubungi Administrator untuk atur kepala departemen atau hak akses Approval Pengadaan.',
                'errors' => ['approver_user_id' => ['Tidak ada approver yang memenuhi syarat.']],
            ], 422);
        }

        $procDoc->update(['status' => 'Menunggu Approval', 'submitted_at' => now()]);

        ApprovalEngine::start($procDoc);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Alihkan approver dokumen Menunggu Approval ke user lain (hanya Pengadaan Kelola).
     */
    public function reassign(Request $request, ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        $user = $request->user();
        if (! $user || ! ApprovalEngine::isKelola($user)) {
            return response()->json(['message' => 'Hanya Pengadaan Kelola yang dapat mengalihkan approver.'], 403);
        }

        if (! $procDoc->isPendingApproval()) {
            return response()->json(['message' => 'Hanya dokumen berstatus Menunggu Approval yang dapat dialihkan.'], 422);
        }

        $data = $request->validate([
            'approver_user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $newApprover = User::find($data['approver_user_id']);
        if (! $newApprover || ! $newApprover->is_active) {
            return response()->json(['message' => 'Approver tidak aktif.'], 422);
        }

        if ((int) $newApprover->id === (int) $procDoc->requester_user_id) {
            return response()->json(['message' => 'Approver tidak boleh sama dengan pemohon (SoD).'], 422);
        }

        ApprovalEngine::reassign($procDoc, (int) $newApprover->id, (int) $user->id);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Setujui dokumen pengadaan yang menunggu approval (hanya approver
     * yang ditugaskan; requester tidak boleh menyetujui sendiri).
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
     * Tolak dokumen pengadaan yang menunggu approval — hanya approver yang
     * ditugaskan; catatan penolakan opsional.
     */
    public function reject(Request $request, ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        $data = $request->validate([
            'decision_note' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! $procDoc->isPendingApproval()) {
            return response()->json(['message' => 'Hanya dokumen pengadaan berstatus Menunggu Approval yang dapat ditolak.'], 422);
        }

        if (! ApprovalEngine::canDecide($procDoc, (int) $request->user()?->id)) {
            return response()->json(['message' => 'Anda tidak berwenang menolak dokumen ini.'], 403);
        }

        ApprovalEngine::decide($procDoc, (int) $request->user()?->id, 'Ditolak', $data['decision_note'] ?? null);

        return new ProcDocResource($this->loadDetail($procDoc->fresh()));
    }

    /**
     * Batalkan dokumen pengadaan: Draft, Menunggu Approval, atau Disetujui.
     * PR Disetujui hanya bisa dibatalkan bila belum diterbitkan menjadi PO.
     */
    public function cancel(ProcDoc $procDoc): ProcDocResource|JsonResponse
    {
        if ($procDoc->isApproved() && $procDoc->sourceProcDocs()->exists()) {
            return response()->json(['message' => 'Dokumen telah diterbitkan menjadi Purchase Order — tidak dapat dibatalkan.'], 422);
        }

        if (! $procDoc->isDraft() && ! $procDoc->isPendingApproval() && ! $procDoc->isApproved()) {
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

    /**
     * User dengan akses Pengadaan level Kelola melihat semua dokumen
     * (termasuk Draft milik siapa pun); selain itu hanya Draft milik sendiri.
     */
    private function isPengadaanKelola(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return collect(RolePermission::accessForRole($user->role))
            ->contains(fn (array $permission) => $permission['module'] === 'Pengadaan' && $permission['level'] === 'Kelola');
    }

    private function canViewDoc(?User $user, ProcDoc $procDoc): bool
    {
        if ($this->isPengadaanKelola($user)) {
            return true;
        }

        if ($procDoc->status !== 'Draft') {
            return true;
        }

        return $user !== null
            && ($procDoc->requester_user_id === $user->id || $procDoc->created_by === $user->id);
    }
}
