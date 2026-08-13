<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStockDocumentRequest;
use App\Http\Resources\StockDocumentResource;
use App\Models\Bin;
use App\Models\ItemStock;
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
     * Simpan dokumen baru (scope: Penerimaan, Pengeluaran, Transfer Gudang,
     * Retur Pembelian & Retur Penjualan).
     * Bila `status` = Selesai, dokumen langsung diposting sehingga stok bergerak;
     * Draft hanya menyimpan dokumen. Transfer Gudang memakai warehouse_id sebagai
     * gudang asal + destination_warehouse_id sebagai tujuan dan disimpan dengan
     * qty positif (StockDocumentService mengeluarkan pasangan OUT+IN). Retur
     * Pembelian diperlakukan seperti pengeluaran (qty dinegasi, stok keluar ke
     * supplier); Retur Penjualan seperti penerimaan (stok masuk dari customer).
     */
    public function store(StoreStockDocumentRequest $request)
    {
        $data = $request->validated();

        $isOutbound = in_array($data['type'], ['Pengeluaran', 'Retur Pembelian'], true);
        $isTransfer = $data['type'] === 'Transfer Gudang';
        $fromBins = ($isOutbound || $isTransfer)
            ? Bin::with('rack')
                ->whereIn('id', collect($data['lines'])->pluck('from_bin_id')->filter()->unique()->values())
                ->get()
                ->keyBy('id')
            : collect();

        // Baris Penerimaan sumber untuk Retur Pembelian yang ter-link — harga beli
        // asal (unit_cost) dipakai menggantikan moving average pada baris retur.
        $sourceLines = ($data['type'] === 'Retur Pembelian' && ! empty($data['source_document_id']))
            ? StockDocumentLine::where('document_id', $data['source_document_id'])
                ->whereIn('id', collect($data['lines'])->pluck('source_line_id')->filter()->unique()->values())
                ->get()
                ->keyBy('id')
            : collect();

        try {
            $document = DB::transaction(function () use ($data, $request, $isOutbound, $isTransfer, $fromBins, $sourceLines) {
                $prefix = $isTransfer ? 'TF' : ($isOutbound ? ($data['type'] === 'Retur Pembelian' ? 'RP' : 'BK') : ($data['type'] === 'Retur Penjualan' ? 'RJ' : 'BM'));

                $document = StockDocument::create([
                    'no' => CodeGenerator::nextYearly(StockDocument::class, $prefix, 'no', 5),
                    'type' => $data['type'],
                    'status' => $data['status'],
                    'document_date' => $data['document_date'],
                    'warehouse_id' => $data['warehouse_id'],
                    'destination_warehouse_id' => $isTransfer ? $data['destination_warehouse_id'] : null,
                    'source_document_id' => $data['type'] === 'Retur Pembelian' ? ($data['source_document_id'] ?? null) : null,
                    'partner' => $data['partner'] ?? null,
                    'reference_no' => $data['reference_no'] ?? null,
                    'pic' => $data['pic'] ?? null,
                    'note' => $data['note'] ?? null,
                    'created_by' => $request->user()?->id,
                ]);

                foreach ($data['lines'] as $index => $line) {
                    $sourceCost = $data['type'] === 'Retur Pembelian'
                        ? $sourceLines->get((int) ($line['source_line_id'] ?? 0))?->unit_cost
                        : null;

                    StockDocumentLine::create([
                        'document_id' => $document->id,
                        'line_no' => $index + 1,
                        'item_id' => $line['item_id'],
                        // Konvensi ledger: qty garis bertanda. Pengeluaran & Retur Pembelian
                        // disimpan negatif sehingga moveDirection() → OUT dan moveQty() (abs)
                        // menghasilkan movement OUT yang benar di StockDocumentService. Transfer
                        // Gudang & Retur Penjualan tetap positif: Transfer merilis pasangan
                        // OUT+IN di service, Retur Penjualan adalah stok masuk (IN).
                        'qty' => $isOutbound ? -abs($line['qty']) : $line['qty'],
                        // Retur Pembelian ter-link memakai harga beli asal dari baris
                        // Penerimaan sumber; retur manual tetap moving average.
                        'unit_cost' => $sourceCost !== null
                            ? (float) $sourceCost
                            : (($isOutbound || $isTransfer)
                                ? ($this->averageCost($line['item_id'], $line['from_bin_id'], $fromBins) ?? 0.0)
                                : $line['unit_cost']),
                        'to_bin_id' => $isOutbound ? null : $line['to_bin_id'],
                        'from_bin_id' => $line['from_bin_id'] ?? null,
                        'source_line_id' => $sourceCost !== null ? $line['source_line_id'] : null,
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
            'warehouse', 'destination', 'creator', 'sourceDocument', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack',
        ])->loadCount('lines')))->response()->setStatusCode(201);
    }

    /**
     * Biaya rata-rata (moving average) sebuah item di sebuah bin. Dipakai untuk
     * mengisi unit_cost baris Pengeluaran & Retur Pembelian sehingga agregat nilai
     * (qty * unit_cost) dan detail dokumen akurat — posting itu sendiri memakai AVG
     * yang sama via StockDocumentService::costAt(), jadi dua sumber ini selalu
     * konsisten.
     */
    private function averageCost(int $itemId, int $binId, $bins): ?float
    {
        $bin = $bins->get($binId);

        if (! $bin?->rack) {
            return null;
        }

        $avg = ItemStock::where('item_id', $itemId)
            ->where('warehouse_id', $bin->rack->warehouse_id)
            ->where('bin_id', $binId)
            ->value('unit_cost_avg');

        return $avg !== null ? (float) $avg : null;
    }

    public function show(StockDocument $stockDocument): StockDocumentResource
    {
        $stockDocument->load([
            'warehouse',
            'destination',
            'creator',
            'sourceDocument',
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
