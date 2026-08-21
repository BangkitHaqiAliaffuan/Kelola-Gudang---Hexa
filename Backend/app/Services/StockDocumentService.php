<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Support\CodeGenerator;
use Illuminate\Support\Facades\DB;

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

        if ($document->type === 'Stock Opname') {
            $document->loadMissing(['lines.item', 'lines.fromBin.rack', 'lines.toBin.rack']);
            $this->assertOpnameReadyForPost($document);

            return $this->postOpname($document);
        }

        if ($document->type === 'Stock Adjustment') {
            $document->loadMissing(['lines.item']);
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
     * berisi baris selisih (variance ≠ 0) dengan status DRAFT (belum diposting),
     * ter-link ke opname via source_document_id. Posting koreksi dilakukan
     * terpisah (halaman Penyesuaian) agar ada langkah review sebelum stok
     * berubah. Opname tanpa selisih tidak menghasilkan ADJ.
     */
    private function postOpname(StockDocument $document): StockDocument
    {
        DB::transaction(function () use ($document) {
            $varianceLines = $document->lines
                ->filter(fn (StockDocumentLine $line) => $line->actual_qty !== null)
                ->filter(fn (StockDocumentLine $line) => ((int) $line->actual_qty) - ((int) $line->system_qty) !== 0)
                ->values();

            if ($varianceLines->isNotEmpty()) {
                $adjustment = StockDocument::create([
                    'no' => CodeGenerator::nextYearly(StockDocument::class, 'ADJ', 'no', 5),
                    'type' => 'Stock Adjustment',
                    'status' => 'Draft',
                    'document_date' => $document->document_date,
                    'warehouse_id' => $document->warehouse_id,
                    'source_document_id' => $document->id,
                    'pic' => $document->pic,
                    'note' => 'Koreksi otomatis dari opname '.$document->no,
                    'created_by' => $document->created_by,
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

            $document->update(['status' => 'Selesai', 'posted_at' => now()]);
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
    private function assertOpnameReadyForPost(StockDocument $document): void
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
        $moved = $lines->filter(function ($line) use ($document, $frozenAt) {
            $q = StockMovement::where('item_id', $line->item_id)
                ->where('occurred_at', '>', $frozenAt)
                ->where(function ($query) use ($document) {
                    $query->whereNull('stock_document_id')
                        ->orWhere('stock_document_id', '!=', $document->id);
                });
            if ($line->from_bin_id === null) {
                $q->whereNull('bin_id');
            } else {
                $q->where('bin_id', $line->from_bin_id);
            }

            return $q->exists();
        });

        if ($moved->isNotEmpty()) {
            $labels = $this->labelsFor($moved);
            throw new \InvalidArgumentException(
                "Barang bergerak selama opname dan wajib dihitung ulang: {$labels}."
            );
        }
    }

    private function labelsFor($lines): string
    {
        $labels = $lines->take(5)
            ->map(fn ($line) => trim(($line->item?->sku ?? '').' '.($line->item?->name ?? '')))
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
            $source = $line->fromBin ?? $line->item->bin;
            $dest = $line->toBin ?? $line->item->bin;
            // Opsi A: bin boleh null (lantai/gudang) — fallback ke warehouse_id dokumen jika bin null.
            $sourceWarehouseId = $source ? $source->rack->warehouse_id : $document->warehouse_id;
            $destWarehouseId = $dest ? $dest->rack->warehouse_id : $document->destination_warehouse_id;
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

        // Arah IN memprioritaskan bin tujuan (to_bin_id); bin asal dipakai sebagai
        // fallback agar dokumen lama (BM/BK/ADJ yang hanya mengisi from_bin_id) tetap
        // terposting. Arah OUT memakai bin asal (sumber stok).
        // Opsi A: bin boleh null — jika semua bin null, warehouse diambil dari dokumen.
        $bin = $direction === 'IN'
            ? ($line->toBin ?? $line->fromBin ?? $line->item->bin)
            : ($line->fromBin ?? $line->item->bin);

        $warehouseId = $bin ? $bin->rack->warehouse_id : $document->warehouse_id;

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

            throw new \InvalidArgumentException(
                "Stok tidak mencukupi untuk {$label} (butuh {$attributes['qty']}, tersedia {$available})."
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
