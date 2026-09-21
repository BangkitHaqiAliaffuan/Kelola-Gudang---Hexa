<?php

namespace App\Services;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use App\Support\StockItemLock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StockLedger
{
    /**
     * Record a single stock movement and rebuild balances atomically.
     * The movement ledger is the source of truth; item_stock + items totals
     * are derived projections.
     */
    public function record(array $attributes): StockMovement
    {
        return DB::transaction(function () use ($attributes) {
            // W2: jalur tulis tunggal ini juga diserialisasi per item agar
            // konsisten dengan StockDocumentService::post().
            StockItemLock::acquire([(int) $attributes['item_id']]);
            $movement = StockMovement::create($attributes);
            $occurred = $movement->occurred_at instanceof \DateTimeInterface
                ? $movement->occurred_at->format('Y-m-d H:i:s')
                : (string) $movement->occurred_at;
            $this->refreshForNewMovements($movement->item_id, [$attributes], $occurred);

            return $movement;
        });
    }

    /**
     * Apply freshly-inserted movements as deltas (Fase 5.1, O(movements)).
     *
     * Semantik identik rebuildForItem per lokasi: clamp max(0) per langkah,
     * avg hanya berubah pada IN via akumulator in_qty/in_cost, guard mismatch
     * bin↔warehouse (skip + Log::error), totals items.* di akhir.
     *
     * BEDA DISENGAJA vs rebuild: baris lokasi basi (ada di item_stock tapi
     * tanpa movement) TIDAK dihapus — itu tugas rebuildForItem/reconcile.
     * Hanya untuk movement in-order (occurred_at >= max historis item);
     * pemanggil memilih jalur karena clamp order-dependent
     * (lihat StockDocumentService::post).
     *
     * @param  list<array{warehouse_id:int,bin_id:?int,direction:string,qty:int,unit_cost:float}>  $movements
     */
    public function applyMovements(int $itemId, array $movements): void
    {
        // Akumulasi stok lokasi yang di-skip (mismatch) agar items.stock
        // identik dengan rebuild (yang men-sum fold SEMUA lokasi termasuk
        // yang skip-tulis — phantom pra-reconcile, dipertahankan demi paritas).
        $skippedStock = 0;

        foreach ($movements as $m) {
            $warehouseId = (int) $m['warehouse_id'];
            $binId = $m['bin_id'] ?? null;
            $binId = $binId === null ? null : (int) $binId;

            // Guard: sama seperti rebuild — jangan tulis item_stock dengan
            // warehouse yang tidak cocok dengan bin.rack.warehouse (drift).
            if ($binId !== null) {
                $rackWh = Bin::with('rack')->find($binId)?->rack?->warehouse_id;
                if ($rackWh !== null && $warehouseId !== (int) $rackWh) {
                    Log::error('StockLedger: warehouse mismatch, skip write — jalankan stock:reconcile-bin-mismatch untuk perbaikan', ['item_id' => $itemId, 'warehouse_id' => $warehouseId, 'bin_id' => $binId, 'rack_warehouse' => $rackWh]);
                    $skippedStock += $this->foldLocationStock($itemId, $warehouseId, $binId);

                    continue;
                }
            }

            $row = ItemStock::where('item_id', $itemId)
                ->where('warehouse_id', $warehouseId)
                ->when($binId === null, fn ($q) => $q->whereNull('bin_id'), fn ($q) => $q->where('bin_id', $binId))
                ->first();

            $stock = (int) ($row?->stock ?? 0);
            $inQty = (int) ($row?->in_qty ?? 0);
            $inCost = (float) ($row?->in_cost ?? 0);
            $qty = (int) $m['qty'];

            if ($m['direction'] === 'IN') {
                $stock += $qty;
                $inQty += $qty;
                $inCost += $qty * (float) $m['unit_cost'];
            } else {
                $stock = max(0, $stock - $qty);
            }
            $average = $inQty > 0 ? $inCost / $inQty : null;

            $values = [
                'stock' => $stock,
                'in_qty' => $inQty,
                'in_cost' => $inCost,
                'unit_cost_avg' => $average,
                'updated_at' => now(),
            ];
            if ($binId === null) {
                DB::table('item_stock')->updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => $warehouseId, 'bin_id' => null],
                    $values
                );
            } else {
                ItemStock::updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => $warehouseId, 'bin_id' => $binId],
                    $values
                );
            }
        }

        $totalStock = (int) ItemStock::where('item_id', $itemId)->sum('stock') + $skippedStock;
        Item::where('id', $itemId)->update([
            'stock' => $totalStock,
            'reserved' => min((int) ItemStock::where('item_id', $itemId)->sum('reserved'), $totalStock),
        ]);
    }

    /**
     * Fold satu lokasi (clamp per langkah, urutan rebuild) — hanya untuk
     * jalur langka mismatch-skip agar items.stock paritas dengan rebuild.
     */
    private function foldLocationStock(int $itemId, int $warehouseId, int $binId): int
    {
        $stock = 0;
        $movements = StockMovement::where('item_id', $itemId)
            ->where('warehouse_id', $warehouseId)
            ->where('bin_id', $binId)
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get(['direction', 'qty']);

        foreach ($movements as $movement) {
            $stock = $movement->direction === 'IN'
                ? $stock + (int) $movement->qty
                : max(0, $stock - (int) $movement->qty);
        }

        return $stock;
    }

    /**
     * Pilih jalur refresh setelah movement baru di-insert (Fase 5.1).
     *
     * In-order (tidak ada movement historis dengan occurred_at setelah
     * $occurredAt) → applyMovements O(m). Backdated → rebuildForItem penuh,
     * karena clamp max(0) order-dependent: fold terurut ≠ delta-di-akhir.
     * Movement yang baru dibuat ber-occurred_at == $occurredAt sehingga
     * dikecualikan oleh perbandingan strict greater-than.
     *
     * @param  list<array{warehouse_id:int,bin_id:?int,direction:string,qty:int,unit_cost:float}>  $movements
     */
    public function refreshForNewMovements(int $itemId, array $movements, string $occurredAt): void
    {
        if ($movements === []) {
            return;
        }

        $backdated = StockMovement::where('item_id', $itemId)
            ->where('occurred_at', '>', $occurredAt)
            ->exists();

        if ($backdated) {
            $this->rebuildForItem($itemId);

            return;
        }

        $this->applyMovements($itemId, $movements);
    }

    /**
     * Rebuild item_stock rows (stock, running average cost) and the
     * denormalized items.stock/reserved totals by folding the ledger.
     */
    public function rebuildForItem(int $itemId): void
    {
        $movements = StockMovement::where('item_id', $itemId)
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get();

        $stockByKey = [];
        $costIn = [];

        foreach ($movements as $movement) {
            $binPart = $movement->bin_id === null ? 'NULL' : (string) $movement->bin_id;
            $key = $movement->warehouse_id.':'.$binPart;
            $sign = $movement->direction === 'IN' ? 1 : -1;

            $stockByKey[$key] = max(0, ($stockByKey[$key] ?? 0) + $sign * $movement->qty);

            if ($movement->direction === 'IN') {
                $costIn[$key] ??= ['qty' => 0, 'cost' => 0.0];
                $costIn[$key]['qty'] += $movement->qty;
                $costIn[$key]['cost'] += $movement->qty * $movement->unit_cost;
            }
        }

        $validBinIds = [];
        $hasNullBin = false;
        foreach ($stockByKey as $key => $stock) {
            [$warehouseId, $binPart] = explode(':', $key, 2);
            $binId = $binPart === 'NULL' ? null : (int) $binPart;
            if ($binId === null) {
                $hasNullBin = true;
            } else {
                $validBinIds[] = $binId;
            }

            $cost = $costIn[$key] ?? null;
            $average = $cost && $cost['qty'] > 0 ? $cost['cost'] / $cost['qty'] : null;

            // Akumulator IN (Fase 5.1): rebuild = resync penuh sehingga
            // reconcile tidak membuat akumulator basi bagi incremental.
            $inQty = $cost['qty'] ?? 0;
            $inCost = $cost['cost'] ?? 0;

            // Guard: jangan tulis item_stock dengan warehouse yang tidak cocok dengan bin.rack.warehouse (drift)
            if ($binId !== null) {
                $rackWh = Bin::with('rack')->find($binId)?->rack?->warehouse_id;
                if ($rackWh !== null && (int) $warehouseId !== (int) $rackWh) {
                    Log::error('StockLedger: warehouse mismatch, skip write — jalankan stock:reconcile-bin-mismatch untuk perbaikan', ['item_id' => $itemId, 'warehouse_id' => $warehouseId, 'bin_id' => $binId, 'rack_warehouse' => $rackWh]);

                    continue;
                }
            }

            if ($binId === null) {
                DB::table('item_stock')->updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => (int) $warehouseId, 'bin_id' => null],
                    ['stock' => $stock, 'in_qty' => $inQty, 'in_cost' => $inCost, 'unit_cost_avg' => $average, 'updated_at' => now()]
                );
            } else {
                ItemStock::updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => (int) $warehouseId, 'bin_id' => $binId],
                    ['stock' => $stock, 'in_qty' => $inQty, 'in_cost' => $inCost, 'unit_cost_avg' => $average, 'updated_at' => now()]
                );
            }
        }

        if ($validBinIds !== [] || $hasNullBin) {
            $query = ItemStock::where('item_id', $itemId);
            if ($validBinIds !== [] && $hasNullBin) {
                $query->where(function ($q) use ($validBinIds) {
                    $q->whereNotIn('bin_id', $validBinIds)->whereNotNull('bin_id');
                });
            } elseif ($validBinIds !== [] && ! $hasNullBin) {
                $query->where(function ($q) use ($validBinIds) {
                    $q->whereNotIn('bin_id', $validBinIds)->orWhereNull('bin_id');
                });
            } elseif ($validBinIds === [] && $hasNullBin) {
                $query->whereNotNull('bin_id');
            }
            $query->delete();
        }

        Item::where('id', $itemId)->update([
            'stock' => array_sum($stockByKey),
            'reserved' => min(ItemStock::where('item_id', $itemId)->sum('reserved'), array_sum($stockByKey)),
        ]);
    }

    /**
     * Distribute a total reserved quantity across an item's stock rows
     * (weighted by current stock) and sync the item total. The item total is
     * derived from the distributed per-bin amounts so items.reserved always
     * reconciles with item_stock (floor rounding may shave a few units).
     */
    public function setReserved(int $itemId, int $reserved): void
    {
        $rows = ItemStock::where('item_id', $itemId)->get();
        $total = (int) $rows->sum('stock');

        $allocations = [];
        foreach ($rows as $row) {
            $key = ($row->bin_id === null ? 'NULL' : (string) $row->bin_id).':'.$row->warehouse_id;
            $allocations[$key] = $total > 0 ? (int) floor($reserved * $row->stock / $total) : 0;
        }

        foreach ($allocations as $key => $alloc) {
            [$binPart, $warehouseId] = explode(':', $key, 2);
            $binId = $binPart === 'NULL' ? null : (int) $binPart;
            $q = ItemStock::where('item_id', $itemId)->where('warehouse_id', (int) $warehouseId);
            if ($binId === null) {
                $q->whereNull('bin_id');
            } else {
                $q->where('bin_id', $binId);
            }
            $q->update(['reserved' => $alloc]);
        }

        Item::where('id', $itemId)->update([
            'reserved' => min(array_sum($allocations), $total),
        ]);
    }
}
