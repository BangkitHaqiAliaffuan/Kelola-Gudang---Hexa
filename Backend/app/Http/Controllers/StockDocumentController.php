<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStockDocumentRequest;
use App\Http\Resources\StockDocumentResource;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Services\StockDocumentService;
use App\Support\CodeGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StockDocumentController extends Controller
{
    public function __construct(private readonly StockDocumentService $service) {}

    /**
     * Daftar dokumen mutasi stock — searchable by nomor/partner/note, filterable
     * by jenis, status, gudang, dan rentang tanggal.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', 'string', Rule::in(StockDocument::TYPES)],
            'status' => ['nullable', 'string', Rule::in(StockDocument::STATUSES)],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = StockDocument::query()
            ->with(['warehouse', 'destination'])
            ->withCount('lines')
            ->withSum('lines as qty_total', 'qty')
            ->withSum('lines as value_total', DB::raw('qty * unit_cost'));

        if ($needle = strtolower((string) ($data['search'] ?? ''))) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(no) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(partner) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(note) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->when($data['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($data['warehouse_id'] ?? null, fn ($q, $warehouseId) => $q->where('warehouse_id', $warehouseId))
            ->when($data['from'] ?? null, fn ($q, $from) => $q->whereDate('document_date', '>=', $from))
            ->when($data['to'] ?? null, fn ($q, $to) => $q->whereDate('document_date', '<=', $to));

        $query->orderByDesc('document_date')->orderByDesc('id');

        return StockDocumentResource::collection(
            $query->paginate((int) $request->query('per_page', 20))
        );
    }

    /**
     * Simpan dokumen baru (scope: Penerimaan). Bila `status` = Selesai, dokumen
     * langsung diposting sehingga stok bergerak; Draft hanya menyimpan dokumen.
     */
    public function store(StoreStockDocumentRequest $request)
    {
        $data = $request->validated();

        try {
            $document = DB::transaction(function () use ($data, $request) {
                $document = StockDocument::create([
                    'no' => CodeGenerator::nextYearly(StockDocument::class, 'BM', 'no', 5),
                    'type' => $data['type'],
                    'status' => $data['status'],
                    'document_date' => $data['document_date'],
                    'warehouse_id' => $data['warehouse_id'],
                    'partner' => $data['partner'] ?? null,
                    'reference_no' => $data['reference_no'] ?? null,
                    'pic' => $data['pic'] ?? null,
                    'note' => $data['note'] ?? null,
                    'created_by' => $request->user()?->id,
                ]);

                foreach ($data['lines'] as $index => $line) {
                    StockDocumentLine::create([
                        'document_id' => $document->id,
                        'line_no' => $index + 1,
                        'item_id' => $line['item_id'],
                        'qty' => $line['qty'],
                        'unit_cost' => $line['unit_cost'],
                        'to_bin_id' => $line['to_bin_id'],
                        'from_bin_id' => $line['from_bin_id'] ?? null,
                        'note' => $line['note'] ?? null,
                    ]);
                }

                if ($data['status'] === 'Selesai') {
                    $this->service->post($document);
                }

                return $document;
            });
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return (new StockDocumentResource($document->load([
            'warehouse', 'destination', 'creator', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack',
        ])->loadCount('lines')))->response()->setStatusCode(201);
    }

    public function show(StockDocument $stockDocument): StockDocumentResource
    {
        $stockDocument->load([
            'warehouse',
            'destination',
            'creator',
            'lines.item.unit',
            'lines.fromBin.rack',
            'lines.toBin.rack',
            'movements',
        ]);

        $byLine = $stockDocument->movements->keyBy('line_no');
        $stockDocument->lines->each(fn (StockDocumentLine $line) => $line->setRelation('movement', $byLine->get($line->line_no)));

        return new StockDocumentResource($stockDocument);
    }

    /**
     * Posting dokumen: memicu mutasi ledger (dokumen Draft / Menunggu Approval).
     */
    public function post(StockDocument $stockDocument)
    {
        try {
            $document = $this->service->post($stockDocument);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return new StockDocumentResource($document->load([
            'warehouse', 'destination', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack',
        ]));
    }

    /**
     * Batalkan dokumen yang belum diposting.
     */
    public function cancel(StockDocument $stockDocument)
    {
        if ($stockDocument->isPosted()) {
            return response()->json(['message' => 'Dokumen yang sudah diposting tidak dapat dibatalkan.'], 422);
        }

        $stockDocument->update(['status' => 'Dibatalkan', 'posted_at' => null]);

        return new StockDocumentResource($stockDocument->load(['warehouse', 'destination']));
    }
}
