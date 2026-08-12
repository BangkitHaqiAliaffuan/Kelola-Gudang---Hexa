<?php

namespace App\Http\Controllers;

use App\Http\Resources\StockDocumentResource;
use App\Models\StockDocument;
use App\Services\StockDocumentService;
use Illuminate\Http\Request;
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
            ->withCount('lines');

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

    public function show(StockDocument $stockDocument): StockDocumentResource
    {
        $stockDocument->load([
            'warehouse',
            'destination',
            'creator',
            'lines.item.unit',
            'lines.fromBin.rack',
            'lines.toBin.rack',
        ]);

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
