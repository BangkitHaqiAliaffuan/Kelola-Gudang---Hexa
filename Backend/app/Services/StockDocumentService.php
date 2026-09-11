<?php

namespace App\Services;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Support\CodeGenerator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StockDocumentService
{
    public function __construct(private readonly StockLedger $ledger) {}

    /**
     * Post a draft document: derive ledger movements from its lines, rebuild
     * balances, and mark the document Selesai. Posting an already-posted
     * document is a no-op (idempotent).
     */
    public function post(StockDocument $document): StockDocument
    {
        if ($document->isPosted()) {
            return $document;
        }

        if ($document->status === 'Dibatalkan') {
            throw new \InvalidArgumentException('Dokumen yang dibatalkan tidak dapat diposting.');
        }

        $document->loadMissing(['warehouse', 'destination', 'lines.item.bin.rack', 'lines.fromBin.rack.warehouse', 'lines.toBin.rack.warehouse']);
        $this->assertBinsBelongToWarehouse($document);

        if ($document->type === 'Stock Opname') {
            $this->assertOpnameReadyForPost($document);

            return $this->postOpname($document);
        }

        if ($document->type === 'Stock Adjustment') {
            $this->assertAdjustmentReadyForPost($document);
        }

        DB::transaction(function () use ($document) {
            $document->loadMissing(['lines.item', 'lines.fromBin.rack', 'lines.toBin.rack']);

            $itemsTouched = [];

            foreach ($document->lines as $line) {
                $line->setRelation('document', $document);

                // Baris Stock Opname yang belum dihitung (actual_qty null) tidak
                // diposting — guard ini melindungi bila dokumen lolos validasi.
                if ($document->type === 'Stock Opname' && $line->actual_qty === null) {
                    continue;
                }

                if ($line->moveQty() === 0) {
                    continue;
                }

                $movements = $this->movementsFor($document, $line);
                foreach ($movements as $attributes) {
                    $this->assertNoNegativeStock($attributes);
                    StockMovement::create($attributes);
                }

                // Selaraskan unit_cost baris ke biaya posting (rata-rata berjalan
                // saat posting) agar value_total dokumen = ledger. Tanpa ini,
                // draft yang diposting berhari-hari kemudian (ada penerimaan baru
                // di antaranya) menampilkan HPP saat draft dibuat, bukan HPP final.
                // Dikecualikan: RP ter-link (harga beli asal dikunci), Opname
                // (snapshot fisik), Penerimaan/RJ (harga input/sumber), dan garis
                // IN (memakai unit_cost baris apa adanya).
                $outCost = collect($movements)->firstWhere('direction', 'OUT')['unit_cost'] ?? null;
                if ($outCost !== null
                    && in_array($document->type, ['Pengeluaran', 'Transfer Gudang', 'Stock Adjustment'], true)
                    && ! $this->usesPurchaseCost($document, $line)
                ) {
                    $line->update(['unit_cost' => (float) $outCost]);
                }

                $itemsTouched[$line->item_id] = true;
            }

            // Transfer OUT/IN mirrors share one pair_id: link them after insert.
            if ($document->type === 'Transfer Gudang') {
                $this->linkTransferPairs($document);
            }

            foreach (array_keys($itemsTouched) as $itemId) {
                $this->ledger->rebuildForItem($itemId);
            }

            $document->update(['status' => 'Selesai', 'posted_at' => now()]);
        });

        return $document->fresh();
    }

    /**
     * Stock Opname = penghitungan fisik: dokumen opname tidak memindahkan stok
     * langsung. Saat diselesaikan, sistem membuat dokumen Stock Adjustment yang
     * berisi baris selisih (variance ≠ 0) dengan status Menunggu Approval
     * (belum diposting), ter-link ke opname via source_document_id. Posting
     * koreksi dilakukan terpisah (halaman Penyesuaian via Approve) agar ada
     * langkah review sebelum stok berubah. Opname tanpa selisih tidak menghasilkan ADJ.
     */
    private function postOpname(StockDocument $document): StockDocument
    {
        DB::transaction(function () use ($document) {
            $lockedDoc = StockDocument::where('id', $document->id)
                ->lockForUpdate()
                ->first();
            if (! in_array($lockedDoc->status, ['Draft', 'Menunggu Approval'], true)) {
                return $lockedDoc;
            }
            $varianceLines = $lockedDoc->lines
                ->filter(fn (StockDocumentLine $line) => $line->actual_qty !== null)
                ->filter(fn (StockDocumentLine $line) => ((int) $line->actual_qty) - ((int) $line->system_qty) !== 0)
                ->values();

            if ($varianceLines->isNotEmpty()) {
                $adjustment = StockDocument::create([
                    'no' => CodeGenerator::nextYearly(StockDocument::class, 'ADJ', 'no', 5),
                    'type' => 'Stock Adjustment',
                    'status' => 'Menunggu Approval',
                    'document_date' => $document->frozen_at ?? $document->created_at,
                    'warehouse_id' => $document->warehouse_id,
                    'source_document_id' => $document->id,
                    'pic' => $document->pic,
                    'note' => 'Koreksi otomatis dari opname '.$document->no,
                    'created_by' => $document->created_by,
                    'requester_user_id' => $document->requester_user_id,
                    'submitted_at' => now(),
                ]);

                $varianceLines->each(function (StockDocumentLine $line, int $index) use ($adjustment) {
                    $variance = ((int) $line->actual_qty) - ((int) $line->system_qty);

                    StockDocumentLine::create([
                        'document_id' => $adjustment->id,
                        'line_no' => $index + 1,
                        'item_id' => $line->item_id,
                        // Delta bertanda: positif = stok masuk (IN), negatif = keluar (OUT).
                        'qty' => $variance,
                        'from_bin_id' => $line->from_bin_id,
                        'to_bin_id' => $variance > 0 ? $line->from_bin_id : null,
                        'unit_cost' => (float) $line->unit_cost,
                        'reason_code' => $line->reason_code,
                        'note' => $line->note,
                    ]);
                });

                // ADJ dibuat sebagai Draft — koreksi tidak langsung memindahkan
                // stok; posting dilakukan belakangan dari halaman Penyesuaian
                // setelah ditinjau. Alasan selisih diwarisi dari opname sehingga
                // lolos assertAdjustmentReadyForPost saat diposting.
            }

            $lockedDoc->update(['status' => 'Selesai', 'posted_at' => now()]);
        });

        return $document->fresh();
    }

    /**
     * Validasi opname sebelum posting (single chokepoint untuk store-with-Selesai
     * dan /post):
     * 1. Semua barang wajib sudah dihitung fisik.
     * 2. Setiap baris yang variance-nya bukan nol wajib punya alasan selisih
     *    (reason_code) — prasyarat untuk root-cause & defensibilitas audit.
     * 3. Barang yang bergerak (stock_movements) setelah momen freeze (frozen_at)
     *    dianggap variance tidak valid — wajib dihitung ulang (pola DBA "throw out").
     */
    public function assertOpnameReadyForPost(StockDocument $document): void
    {
        $lines = $document->lines;

        $uncounted = $lines->filter(fn ($line) => $line->actual_qty === null)->count();

        if ($uncounted > 0) {
            throw new \InvalidArgumentException(
                "Semua barang wajib dihitung sebelum opname diselesaikan ({$uncounted} belum dicek)."
            );
        }

        $varianceLines = $lines->filter(fn ($line) => $line->actual_qty !== null && $line->variance() !== 0);
        $missingReason = $varianceLines->filter(fn ($line) => empty($line->reason_code));

        if ($missingReason->isNotEmpty()) {
            $labels = $this->labelsFor($missingReason);
            throw new \InvalidArgumentException(
                "Alasan selisih wajib diisi sebelum opname diselesaikan: {$labels}."
            );
        }

        $frozenAt = $document->frozen_at ?? $document->created_at;

        // Fase 2.4: satu query menggantikan N×EXISTS. Predikat per pasangan
        // (item_id, from_bin_id) NULL-aware dipertahankan persis: from_bin NULL
        // hanya cocok dengan movement bin NULL (K4 — versi tanpa bin akan
        // over-blocking opname sah). Syarat waktu + eksklusi dokumen sendiri
        // juga identik; pencocokan akhir di PHP agar NULL-aware.
        $movedKeys = StockMovement::query()
            ->whereIn('item_id', $lines->pluck('item_id')->unique()->values())
            ->where(function ($qTime) use ($frozenAt) {
                $qTime->where('created_at', '>', $frozenAt)
                    ->orWhere('occurred_at', '>', $frozenAt);
            })
            ->where(function ($query) use ($document) {
                $query->whereNull('stock_document_id')
                    ->orWhere('stock_document_id', '!=', $document->id);
            })
            ->get(['item_id', 'bin_id'])
            ->mapWithKeys(fn ($m) => [$m->item_id.':'.($m->bin_id ?? 'NULL') => true]);

        $moved = $lines->filter(
            fn ($line) => isset($movedKeys[$line->item_id.':'.($line->from_bin_id ?? 'NULL')])
        );

        if ($moved->isNotEmpty()) {
            $labels = $this->labelsFor($moved);
            throw new \InvalidArgumentException(
                "Barang bergerak selama opname dan wajib dihitung ulang: {$labels}."
            );
        }
    }

    private function labelsFor($lines): string
    {
        $lines->loadMissing(['fromBin']);
        $labels = $lines->take(5)
            ->map(function ($line) {
                $sku = $line->item?->sku ?? '';
                $name = $line->item?->name ?? '';
                $binCode = $line->fromBin?->code;
                $lineNo = $line->line_no;
                $base = trim("{$sku} {$name}");
                $binPart = $binCode ? " (Bin: {$binCode})" : '';
                $lineNoPart = $lineNo ? " - Baris ke-{$lineNo}" : '';

                return "{$base}{$binPart}{$lineNoPart}";
            })
            ->filter()
            ->values()
            ->implode(', ');

        if ($labels === '') {
            $labels = $lines->take(5)->map(fn ($line) => "#{$line->item_id}")->implode(', ');
        }

        return $labels.($lines->count() > 5 ? ', …' : '');
    }

    /**
     * Validasi Stock Adjustment sebelum posting (single chokepoint untuk
     * store-with-Selesai dan /post): setiap baris wajib punya reason_code
     * (root cause) — koreksi stok tanpa alasan tidak boleh diposting.
     */
    private function assertAdjustmentReadyForPost(StockDocument $document): void
    {
        $missingReason = $document->lines->filter(fn ($line) => empty($line->reason_code));

        if ($missingReason->isNotEmpty()) {
            $labels = $this->labelsFor($missingReason);
            throw new \InvalidArgumentException(
                "Alasan selisih wajib diisi sebelum penyesuaian diposting: {$labels}."
            );
        }
    }

    /**
     * Validasi kepemilikan gudang untuk setiap bin pada baris dokumen.
     * Mencegah drift/mismatch antara warehouse_id dokumen vs bin.rack.warehouse_id
     * yang menyebabkan baris dilewati oleh ledger.
     */
    public function assertBinsBelongToWarehouse(StockDocument $document): void
    {
        $type = $document->type;
        $docWhId = (int) $document->warehouse_id;
        $destWhId = (int) ($document->destination_warehouse_id ?? 0);
        $expectedWhName = $document->warehouse?->name ?? "Gudang ID {$docWhId}";
        $expectedDestWhName = $document->destination?->name ?? "Gudang ID {$destWhId}";

        foreach ($document->lines as $line) {
            $sku = $line->item?->sku ?? "ID {$line->item_id}";
            $lineNo = $line->line_no;

            if ($line->fromBin) {
                $fromWhId = (int) $line->fromBin->rack?->warehouse_id;
                if ($fromWhId !== $docWhId) {
                    $actualWh = $line->fromBin->rack?->warehouse?->name ?? "Gudang ID {$fromWhId}";
                    $rackCode = $line->fromBin->rack?->code ?? '-';
                    throw new \InvalidArgumentException(
                        "Bin {$line->fromBin->code} (Rak {$rackCode}) berada di {$actualWh}, bukan {$expectedWhName} (baris {$lineNo} — SKU {$sku})."
                    );
                }
            }

            if ($line->toBin) {
                $expected = ($type === 'Transfer Gudang') ? $destWhId : $docWhId;
                $expectedName = ($type === 'Transfer Gudang') ? $expectedDestWhName : $expectedWhName;
                $toWhId = (int) $line->toBin->rack?->warehouse_id;
                if ($toWhId !== $expected) {
                    $actualWh = $line->toBin->rack?->warehouse?->name ?? "Gudang ID {$toWhId}";
                    $rackCode = $line->toBin->rack?->code ?? '-';
                    throw new \InvalidArgumentException(
                        "Bin {$line->toBin->code} (Rak {$rackCode}) berada di {$actualWh}, bukan {$expectedName} (baris {$lineNo} — SKU {$sku})."
                    );
                }
            }
        }
    }

    /**
     * Build the 1-2 movement payloads a single line produces.
     */
    private function movementsFor(StockDocument $document, StockDocumentLine $line): array
    {
        $qty = $line->moveQty();
        $direction = $line->moveDirection();
        $occurredAt = $document->document_date;

        $base = [
            'item_id' => $line->item_id,
            'movement_type' => $document->type,
            'reference_no' => $document->no,
            'partner' => $document->partner,
            'pic' => $document->pic,
            'note' => $line->note ?? $document->note,
            'occurred_at' => $occurredAt,
            'stock_document_id' => $document->id,
            'line_no' => $line->line_no,
        ];

        if ($document->type === 'Transfer Gudang') {
            $sourceWarehouseId = (int) $document->warehouse_id;
            $destWarehouseId = (int) $document->destination_warehouse_id;

            $source = $line->fromBin ?? (
                $line->item->bin && (int) $line->item->bin->rack?->warehouse_id === $sourceWarehouseId
                    ? $line->item->bin
                    : null
            );
            $dest = $line->toBin ?? (
                $line->item->bin && (int) $line->item->bin->rack?->warehouse_id === $destWarehouseId
                    ? $line->item->bin
                    : null
            );

            $cost = $this->costAt($line->item_id, $source, $sourceWarehouseId);

            return [
                [
                    ...$base,
                    'warehouse_id' => $sourceWarehouseId,
                    'rack_id' => $source?->rack_id,
                    'bin_id' => $source?->id,
                    'direction' => 'OUT',
                    'qty' => $qty,
                    'unit_cost' => $cost,
                ],
                [
                    ...$base,
                    'warehouse_id' => $destWarehouseId,
                    'rack_id' => $dest?->rack_id,
                    'bin_id' => $dest?->id,
                    'direction' => 'IN',
                    'qty' => $qty,
                    'unit_cost' => $cost,
                ],
            ];
        }

        $warehouseId = (int) $document->warehouse_id;

        // Arah IN memprioritaskan bin tujuan (to_bin_id); bin asal dipakai sebagai
        // fallback agar dokumen lama yang hanya mengisi from_bin_id tetap terposting.
        // Arah OUT memakai bin asal (from_bin_id).
        // Fallback ke default_bin item HANYA dipakai jika default_bin tersebut berada di gudang yang sama.
        // Bila tidak segudang atau tanpa bin, bin bernilai null (stok lantai).
        $chosenBin = $direction === 'IN'
            ? ($line->toBin ?? $line->fromBin)
            : $line->fromBin;

        $bin = $chosenBin ?? (
            $line->item->bin && (int) $line->item->bin->rack?->warehouse_id === $warehouseId
                ? $line->item->bin
                : null
        );

        return [[
            ...$base,
            'warehouse_id' => $warehouseId,
            'rack_id' => $bin?->rack_id,
            'bin_id' => $bin?->id,
            'direction' => $direction,
            'qty' => $qty,
            'unit_cost' => $direction === 'IN'
                ? (float) $line->unit_cost
                : ($this->usesPurchaseCost($document, $line)
                    ? (float) $line->unit_cost
                    : $this->costAt($line->item_id, $bin, $warehouseId)),
        ]];
    }

    /**
     * Retur Pembelian mencatat OUT dengan harga beli asal dari baris Penerimaan
     * sumber (di-backfill controller saat simpan). Aman untuk rata-rata: ledger
     * menghitung unit_cost_avg hanya dari movement IN, jadi baris OUT dengan harga
     * beli asal tidak menggeser moving average stok. Retur manual (tanpa link)
     * memakai nilai backfill = moving average yang sama.
     */
    private function usesPurchaseCost(StockDocument $document, StockDocumentLine $line): bool
    {
        return $document->type === 'Retur Pembelian' && (float) $line->unit_cost > 0;
    }

    /**
     * OUT movements must not push the source location below zero.
     */
    private function assertNoNegativeStock(array $attributes): void
    {
        if ($attributes['direction'] !== 'OUT') {
            return;
        }

        // Opsi B: Retur Pembelian cek total gudang (fungible per gudang), bukan per bin.
        if ($attributes['movement_type'] === 'Retur Pembelian') {
            $totalAvailableRaw = ItemStock::where('item_id', $attributes['item_id'])
                ->where('warehouse_id', $attributes['warehouse_id'])
                ->selectRaw('COALESCE(SUM(stock),0) - COALESCE(SUM(reserved),0) as total')
                ->value('total');
            $available = (int) ($totalAvailableRaw ?? 0);
            // Untuk retur, tidak ada konsep fisik vs available khusus — pakai total available.
            if ($attributes['qty'] > $available) {
                $item = Item::find($attributes['item_id']);
                $label = $item ? trim(($item->sku ?? '').' '.($item->name ?? '')) : "#{$attributes['item_id']}";
                throw new \InvalidArgumentException(
                    "Stok tidak mencukupi untuk {$label} (butuh {$attributes['qty']}, tersedia {$available} di gudang).",
                );
            }

            return;
        }

        $query = ItemStock::where('item_id', $attributes['item_id'])
            ->where('warehouse_id', $attributes['warehouse_id']);
        if ($attributes['bin_id'] === null) {
            $query->whereNull('bin_id');
        } else {
            $query->where('bin_id', $attributes['bin_id']);
        }
        $row = $query->first();

        // Stock Opname menyesuaikan stok terhadap kenyataan fisik: guard memakai
        // stok fisik (stock), bukan available, karena reservasi adalah komitmen
        // virtual yang tidak menambah/mengurangi barang yang benar-benar ada.
        // Koreksi dari opname (Stock Adjustment ter-link ke opname via
        // source_document_id) mempertahankan semantik yang sama.
        $physical = $attributes['movement_type'] === 'Stock Opname';
        if (! $physical && $attributes['movement_type'] === 'Stock Adjustment') {
            $source = StockDocument::find($attributes['stock_document_id'])?->sourceDocument;
            $physical = $source?->type === 'Stock Opname';
        }

        $available = $physical
            ? (int) ($row?->stock ?? 0)
            : (int) ($row?->stock ?? 0) - (int) ($row?->reserved ?? 0);

        if ($attributes['qty'] > $available) {
            $item = Item::find($attributes['item_id']);
            $label = $item ? trim(($item->sku ?? '').' '.($item->name ?? '')) : "#{$attributes['item_id']}";

            $binLabel = $attributes['bin_id']
                ? (Bin::find($attributes['bin_id'])?->code ?? 'Bin')
                : 'Lantai/Tanpa Bin';

            $totalWarehouse = ItemStock::where('item_id', $attributes['item_id'])
                ->where('warehouse_id', $attributes['warehouse_id'])
                ->selectRaw('COALESCE(SUM(stock),0) - COALESCE(SUM(reserved),0) AS total')
                ->value('total') ?? 0;

            throw new \InvalidArgumentException(
                "Stok tidak mencukupi untuk {$label} (butuh {$attributes['qty']} di letak {$binLabel}, tersedia {$available}). Total keseluruhan di gudang tersedia: {$totalWarehouse}."
            );
        }
    }

    /**
     * Cost to use for OUT movements: the current moving average at that location.
     * When bin is null (lantai/gudang, Opsi A), lookup by warehouse_id + bin_id IS NULL.
     */
    private function costAt(int $itemId, $bin, ?int $warehouseId = null): float
    {
        if (! $bin) {
            $wid = $warehouseId;
            if ($wid === null) {
                return 0.0;
            }
            $avg = ItemStock::where('item_id', $itemId)
                ->where('warehouse_id', $wid)
                ->whereNull('bin_id')
                ->value('unit_cost_avg');

            return (float) ($avg ?? 0);
        }

        $avg = ItemStock::where('item_id', $itemId)
            ->where('warehouse_id', $bin->rack->warehouse_id)
            ->where('bin_id', $bin->id)
            ->value('unit_cost_avg');

        return (float) ($avg ?? 0);
    }

    /**
     * After inserting a transfer's OUT and IN movements, set pair_id on both
     * so the mirror pair is auditable (see stock_movements.pair_id).
     */
    private function linkTransferPairs(StockDocument $document): void
    {
        $lines = StockDocumentLine::where('document_id', $document->id)->pluck('line_no');

        foreach ($lines as $lineNo) {
            $movements = StockMovement::where('stock_document_id', $document->id)
                ->where('line_no', $lineNo)
                ->orderBy('direction')
                ->get();

            if ($movements->count() !== 2) {
                continue;
            }

            [$in, $out] = $movements;

            $in->update(['pair_id' => $out->id]);
            $out->update(['pair_id' => $in->id]);
        }
    }
}
