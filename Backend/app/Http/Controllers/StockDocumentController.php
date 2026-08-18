<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStockDocumentRequest;
use App\Http\Requests\UpdateStockDocumentRequest;
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
            ->withCount(['lines as checked_count' => fn ($q) => $q->whereNotNull('actual_qty')])
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
     * Ringkasan mutasi untuk dashboard — agregat per jenis (Penerimaan/Pengeluaran)
     * atas seluruh dokumen non-Draft, dihitung di SQL agar tidak men-serialisasi
     * ribuan baris dokumen. qty keluar bertanda negatif (konsisten dengan
     * `qty_total` pada index); frontend memakai nilai absolutnya.
     */
    public function summary()
    {
        $rows = DB::table('stock_documents')
            ->join('stock_document_lines', 'stock_document_lines.document_id', '=', 'stock_documents.id')
            ->whereIn('stock_documents.type', ['Penerimaan', 'Pengeluaran'])
            ->where('stock_documents.status', '!=', 'Draft')
            ->groupBy('stock_documents.type')
            ->selectRaw(
                'stock_documents.type,
                 COUNT(DISTINCT stock_documents.id) as doc_count,
                 SUM(stock_document_lines.qty) as qty,
                 SUM(stock_document_lines.qty * stock_document_lines.unit_cost) as value'
            )
            ->get()
            ->keyBy('type');

        $masuk = $rows->get('Penerimaan');
        $keluar = $rows->get('Pengeluaran');

        return response()->json([
            'data' => [
                'masuk' => [
                    'count' => (int) ($masuk->doc_count ?? 0),
                    'qty' => (int) ($masuk->qty ?? 0),
                    'value' => (float) ($masuk->value ?? 0),
                ],
                'keluar' => [
                    'count' => (int) ($keluar->doc_count ?? 0),
                    'qty' => (int) ($keluar->qty ?? 0),
                ],
            ],
        ]);
    }

    /**
     * Simpan dokumen baru (scope: Penerimaan, Pengeluaran, Transfer Gudang,
     * Retur Pembelian, Retur Penjualan & Stock Adjustment).
     * Bila `status` = Selesai, dokumen langsung diposting sehingga stok bergerak;
     * Draft hanya menyimpan dokumen. Transfer Gudang memakai warehouse_id sebagai
     * gudang asal + destination_warehouse_id sebagai tujuan dan disimpan dengan
     * qty positif (StockDocumentService mengeluarkan pasangan OUT+IN). Retur
     * Pembelian diperlakukan seperti pengeluaran (qty dinegasi, stok keluar ke
     * supplier); Retur Penjualan seperti penerimaan (stok masuk dari customer).
     * RP/RJ yang mengirim source_document_id ter-link ke baris sumber (Penerimaan
     * untuk RP, Pengeluaran untuk RJ): unit_cost baris retur di-backfill harga
     * baris sumber dan source_line_id dicatat.
     * Stock Adjustment membawa delta bertanda (positif = tambah stok ke bin
     * tujuan, negatif = kurangi stok dari bin asal) dan disimpan apa adanya;
     * unit_cost di-backfill moving average (koreksi valuasi-netral).
     */
    public function store(StoreStockDocumentRequest $request)
    {
        $data = $request->validated();

        $isOutbound = in_array($data['type'], ['Pengeluaran', 'Retur Pembelian'], true);
        $isTransfer = $data['type'] === 'Transfer Gudang';
        $isOpname = $data['type'] === 'Stock Opname';
        $isAdjustment = $data['type'] === 'Stock Adjustment';
        // Stock Adjustment memakai bin dari arah qty (to_bin untuk IN, from_bin
        // untuk OUT) untuk backfill unit_cost — load kedua sisi agar lookup lengkap.
        $fromBins = ($isOutbound || $isTransfer || $isAdjustment)
            ? Bin::with('rack')
                ->whereIn('id', collect($data['lines'])->flatMap(fn ($l) => array_filter([
                    $l['from_bin_id'] ?? null,
                    $isAdjustment ? ($l['to_bin_id'] ?? null) : null,
                ]))->unique()->values())
                ->get()
                ->keyBy('id')
            : collect();

        // Baris Stock Opname di-snapshot server-side dari item_stock: system_qty &
        // unit_cost (moving average) diambil per (item, bin) sehingga konsisten dengan
        // Stock Saat Ini / Nilai Persediaan pada saat jadwal dibuat.
        $stockRows = $isOpname
            ? ItemStock::where('warehouse_id', $data['warehouse_id'])
                ->whereIn('bin_id', collect($data['lines'])->pluck('from_bin_id')->filter()->unique()->values())
                ->get()
                ->keyBy(fn ($row) => $row->item_id.'-'.$row->bin_id)
            : collect();

        // Baris dokumen sumber untuk Retur Pembelian/Penjualan yang ter-link —
        // harga asal (unit_cost) baris sumber dipakai menggantikan moving average
        // pada baris retur (RP: Penerimaan, RJ: Pengeluaran).
        $sourceLines = (in_array($data['type'], ['Retur Pembelian', 'Retur Penjualan'], true) && ! empty($data['source_document_id']))
            ? StockDocumentLine::where('document_id', $data['source_document_id'])
                ->whereIn('id', collect($data['lines'])->pluck('source_line_id')->filter()->unique()->values())
                ->get()
                ->keyBy('id')
            : collect();

        try {
            $document = DB::transaction(function () use ($data, $request, $isOutbound, $isTransfer, $isOpname, $isAdjustment, $fromBins, $sourceLines, $stockRows) {
                $prefix = $isTransfer ? 'TF'
                    : ($isOpname ? 'SO'
                        : ($isAdjustment ? 'ADJ'
                            : ($isOutbound ? ($data['type'] === 'Retur Pembelian' ? 'RP' : 'BK')
                                : ($data['type'] === 'Retur Penjualan' ? 'RJ' : 'BM'))));

                $document = StockDocument::create([
                    'no' => CodeGenerator::nextYearly(StockDocument::class, $prefix, 'no', 5),
                    'type' => $data['type'],
                    'status' => $data['status'],
                    'blind_count' => $data['blind_count'] ?? true,
                    'document_date' => $data['document_date'],
                    // Stock Opname: momen "freeze" book balance — barang yang bergerak
                    // setelahnya dianggap variance tidak valid (wajib recount).
                    'frozen_at' => $isOpname ? now() : null,
                    'warehouse_id' => $data['warehouse_id'],
                    'destination_warehouse_id' => $isTransfer ? $data['destination_warehouse_id'] : null,
                    'source_document_id' => in_array($data['type'], ['Retur Pembelian', 'Retur Penjualan'], true) ? ($data['source_document_id'] ?? null) : null,
                    'partner' => $data['partner'] ?? null,
                    'reference_no' => $data['reference_no'] ?? null,
                    'pic' => $data['pic'] ?? null,
                    'note' => $data['note'] ?? null,
                    'created_by' => $request->user('sanctum')?->id,
                ]);

                foreach ($data['lines'] as $index => $line) {
                    $sourceCost = in_array($data['type'], ['Retur Pembelian', 'Retur Penjualan'], true)
                        ? $sourceLines->get((int) ($line['source_line_id'] ?? 0))?->unit_cost
                        : null;

                    $stockKey = $isOpname ? (($line['item_id'] ?? 0).'-'.($line['from_bin_id'] ?? 0)) : null;
                    $stockRow = $isOpname ? $stockRows->get($stockKey) : null;

                    // Stock Adjustment adalah koreksi (bukan pembelian): unit_cost
                    // di-backfill moving average di bin baris (OUT=from, IN=to) agar
                    // koreksi valuasi-netral — tidak menciptakan nilai palsu.
                    $adjustBinId = $isAdjustment
                        ? ((int) $line['qty'] < 0 ? ($line['from_bin_id'] ?? null) : ($line['to_bin_id'] ?? null))
                        : null;

                    StockDocumentLine::create([
                        'document_id' => $document->id,
                        'line_no' => $index + 1,
                        'item_id' => $line['item_id'],
                        // Konvensi ledger: qty garis bertanda. Pengeluaran & Retur Pembelian
                        // disimpan negatif sehingga moveDirection() → OUT dan moveQty() (abs)
                        // menghasilkan movement OUT yang benar di StockDocumentService. Transfer
                        // Gudang & Retur Penjualan tetap positif: Transfer merilis pasangan
                        // OUT+IN di service, Retur Penjualan adalah stok masuk (IN). Stock
                        // Opname tidak membawa qty — memakai system_qty/actual_qty. Stock
                        // Adjustment membawa delta BERTANDA (positif = IN, negatif = OUT).
                        'qty' => $isOpname ? null : ($isAdjustment ? (int) $line['qty'] : ($isOutbound ? -abs($line['qty']) : $line['qty'])),
                        'system_qty' => $isOpname ? (int) ($stockRow?->stock ?? 0) : null,
                        'actual_qty' => $isOpname ? ($line['actual_qty'] ?? null) : null,
                        'unit_cost' => $isOpname
                            ? (float) ($stockRow?->unit_cost_avg ?? $line['unit_cost'] ?? 0)
                            : ($sourceCost !== null
                                ? (float) $sourceCost
                                : ($isAdjustment
                                    ? ($adjustBinId ? ($this->averageCost($line['item_id'], $adjustBinId, $fromBins) ?? 0.0) : 0.0)
                                    : (($isOutbound || $isTransfer)
                                        ? ($this->averageCost($line['item_id'], $line['from_bin_id'], $fromBins) ?? 0.0)
                                        : $line['unit_cost']))),
                        'to_bin_id' => ($isOpname || $isOutbound) ? null : ($line['to_bin_id'] ?? null),
                        'from_bin_id' => $line['from_bin_id'] ?? null,
                        'source_line_id' => $sourceCost !== null ? $line['source_line_id'] : null,
                        'note' => $line['note'] ?? null,
                        'reason_code' => $line['reason_code'] ?? null,
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
            'warehouse', 'destination', 'creator', 'sourceDocument', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack', 'lines.countedBy',
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
            'lines.countedBy',
            'movements',
        ]);

        $byLine = $stockDocument->movements->keyBy('line_no');
        $stockDocument->lines->each(fn (StockDocumentLine $line) => $line->setRelation('movement', $byLine->get($line->line_no)));

        return new StockDocumentResource($stockDocument);
    }

    /**
     * Perbarui dokumen Stock Opname yang masih Draft. Baris diperbarui secara
     * in-place (per item+bin) — TIDAK menghapus & menyisipkan ulang — sehingga
     * audit (counted_by/counted_at) dan note per baris tidak hilang. system_qty
     * dipertahankan dari snapshot; baris baru di-backfill dari item_stock.
     */
    public function update(UpdateStockDocumentRequest $request, StockDocument $stockDocument)
    {
        if ($stockDocument->type !== 'Stock Opname') {
            return response()->json(['message' => 'Hanya dokumen Stock Opname yang dapat diperbarui.'], 422);
        }

        if ($stockDocument->status !== 'Draft') {
            return response()->json(['message' => 'Hanya dokumen Stock Opname berstatus Draft yang dapat diperbarui.'], 422);
        }

        $data = $request->validated();

        $stockDocument->update([
            'document_date' => $data['document_date'] ?? $stockDocument->document_date,
            'pic' => $data['pic'] ?? $stockDocument->pic,
            'note' => $data['note'] ?? $stockDocument->note,
            'blind_count' => $data['blind_count'] ?? $stockDocument->blind_count,
        ]);

        $stockRows = ItemStock::where('warehouse_id', $stockDocument->warehouse_id)
            ->whereIn('bin_id', collect($data['lines'])->pluck('from_bin_id')->filter()->unique()->values())
            ->get()
            ->keyBy(fn ($row) => $row->item_id.'-'.$row->bin_id);

        $existing = $stockDocument->lines()->get()
            ->keyBy(fn (StockDocumentLine $line) => $line->item_id.'-'.$line->from_bin_id);

        $payloadKeys = [];

        foreach ($data['lines'] as $index => $line) {
            $key = ($line['item_id'] ?? 0).'-'.($line['from_bin_id'] ?? 0);
            $payloadKeys[$key] = true;

            $stockRow = $stockRows->get($key);
            $current = $existing->get($key);

            $attributes = [
                'line_no' => $index + 1,
                // system_qty dipertahankan dari snapshot dokumen asli; hanya
                // baris BARU yang di-backfill dari item_stock saat ini.
                'system_qty' => array_key_exists('system_qty', $line)
                    ? $line['system_qty']
                    : ($current ? $current->system_qty : (int) ($stockRow?->stock ?? 0)),
                'actual_qty' => $line['actual_qty'] ?? null,
                'unit_cost' => (float) ($line['unit_cost'] ?? $stockRow?->unit_cost_avg ?? 0),
                'note' => array_key_exists('note', $line) ? $line['note'] : ($current?->note ?? null),
            ];

            // Alasan selisih hanya diubah bila dikirim (save draft biasa tidak
            // menimpa alasan yang sudah diisi saat review).
            if (array_key_exists('reason_code', $line)) {
                $attributes['reason_code'] = $line['reason_code'] ?? null;
            }

            // Jejak audit: siapa & kapan terakhir kali baris dihitung fisik.
            if (array_key_exists('actual_qty', $line)) {
                if ($line['actual_qty'] !== null) {
                    $attributes['counted_by_user_id'] = $request->user('sanctum')?->id;
                    $attributes['counted_at'] = now();
                } else {
                    $attributes['counted_by_user_id'] = null;
                    $attributes['counted_at'] = null;
                }
            }

            if ($current) {
                $current->update($attributes);
            } else {
                StockDocumentLine::create([
                    'document_id' => $stockDocument->id,
                    'item_id' => $line['item_id'],
                    'from_bin_id' => $line['from_bin_id'],
                    'to_bin_id' => null,
                    'qty' => null,
                    ...$attributes,
                ]);
            }
        }

        // Hapus baris yang tidak lagi ada di payload (mis. gudang berubah cakupan).
        $stockDocument->lines()
            ->whereIn('id', $existing->filter(fn (StockDocumentLine $line) => ! isset($payloadKeys[$line->item_id.'-'.$line->from_bin_id]))->keys())
            ->delete();

        return new StockDocumentResource($stockDocument->load([
            'warehouse', 'destination', 'creator', 'sourceDocument', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack', 'lines.countedBy',
        ])->loadCount('lines'));
    }

    /**
     * Posting dokumen: memicu mutasi ledger (dokumen Draft / Menunggu Approval).
     * Guard opname (semua terhitung, alasan selisih, barang bergerak setelah
     * freeze) dieksekusi di StockDocumentService::post — satu titik untuk
     * store-with-Selesai dan /post.
     */
    public function post(StockDocument $stockDocument)
    {
        try {
            $document = $this->service->post($stockDocument);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return new StockDocumentResource($document->load([
            'warehouse', 'destination', 'lines.item.unit', 'lines.fromBin.rack', 'lines.toBin.rack', 'lines.countedBy',
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
