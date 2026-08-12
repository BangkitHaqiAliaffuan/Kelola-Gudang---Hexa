<?php

namespace App\Services;

use App\Models\ItemStock;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
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

        DB::transaction(function () use ($document) {
            $document->loadMissing(['lines.item', 'lines.fromBin.rack', 'lines.toBin.rack']);

            $itemsTouched = [];

            foreach ($document->lines as $line) {
                $line->setRelation('document', $document);

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
            $cost = $this->costAt($line->item_id, $source);

            return [
                [
                    ...$base,
                    'warehouse_id' => $source->rack->warehouse_id,
                    'rack_id' => $source->rack_id,
                    'bin_id' => $source->id,
                    'direction' => 'OUT',
                    'qty' => $qty,
                    'unit_cost' => $cost,
                ],
                [
                    ...$base,
                    'warehouse_id' => $dest->rack->warehouse_id,
                    'rack_id' => $dest->rack_id,
                    'bin_id' => $dest->id,
                    'direction' => 'IN',
                    'qty' => $qty,
                    'unit_cost' => $cost,
                ],
            ];
        }

        // Arah IN memprioritaskan bin tujuan (to_bin_id); bin asal dipakai sebagai
        // fallback agar dokumen lama (BM/BK/ADJ yang hanya mengisi from_bin_id) tetap
        // terposting. Arah OUT memakai bin asal (sumber stok).
        $bin = $direction === 'IN'
            ? ($line->toBin ?? $line->fromBin ?? $line->item->bin)
            : ($line->fromBin ?? $line->item->bin);

        return [[
            ...$base,
            'warehouse_id' => $bin->rack->warehouse_id,
            'rack_id' => $bin->rack_id,
            'bin_id' => $bin->id,
            'direction' => $direction,
            'qty' => $qty,
            'unit_cost' => $direction === 'IN'
                ? (float) $line->unit_cost
                : $this->costAt($line->item_id, $bin),
        ]];
    }

    /**
     * OUT movements must not push the source location below zero.
     */
    private function assertNoNegativeStock(array $attributes): void
    {
        if ($attributes['direction'] !== 'OUT') {
            return;
        }

        $row = ItemStock::where('item_id', $attributes['item_id'])
            ->where('warehouse_id', $attributes['warehouse_id'])
            ->where('bin_id', $attributes['bin_id'])
            ->first();

        $available = (int) ($row?->stock ?? 0) - (int) ($row?->reserved ?? 0);

        if ($attributes['qty'] > $available) {
            throw new \InvalidArgumentException(
                "Stok tidak mencukupi untuk item {$attributes['item_id']} (butuh {$attributes['qty']}, tersedia {$available})."
            );
        }
    }

    /**
     * Cost to use for OUT movements: the current moving average at that location.
     */
    private function costAt(int $itemId, $bin): float
    {
        if (! $bin) {
            return 0.0;
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
