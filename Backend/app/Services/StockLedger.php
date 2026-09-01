<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;

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
            $movement = StockMovement::create($attributes);
            $this->rebuildForItem($movement->item_id);

            return $movement;
        });
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

            // Guard: jangan tulis item_stock dengan warehouse yang tidak cocok dengan bin.rack.warehouse (drift)
            if ($binId !== null) {
                $rackWh = \App\Models\Bin::with('rack')->find($binId)?->rack?->warehouse_id;
                if ($rackWh !== null && (int) $warehouseId !== (int) $rackWh) {
                    \Illuminate\Support\Facades\Log::warning('StockLedger: warehouse mismatch, skip write', ['item_id' => $itemId, 'warehouse_id' => $warehouseId, 'bin_id' => $binId, 'rack_warehouse' => $rackWh]);
                    continue;
                }
            }

            if ($binId === null) {
                DB::table('item_stock')->updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => (int) $warehouseId, 'bin_id' => null],
                    ['stock' => $stock, 'unit_cost_avg' => $average, 'updated_at' => now()]
                );
            } else {
                ItemStock::updateOrInsert(
                    ['item_id' => $itemId, 'warehouse_id' => (int) $warehouseId, 'bin_id' => $binId],
                    ['stock' => $stock, 'unit_cost_avg' => $average, 'updated_at' => now()]
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
