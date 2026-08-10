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
            $key = $movement->warehouse_id.':'.$movement->bin_id;
            $sign = $movement->direction === 'IN' ? 1 : -1;

            $stockByKey[$key] = max(0, ($stockByKey[$key] ?? 0) + $sign * $movement->qty);

            if ($movement->direction === 'IN') {
                $costIn[$key] ??= ['qty' => 0, 'cost' => 0.0];
                $costIn[$key]['qty'] += $movement->qty;
                $costIn[$key]['cost'] += $movement->qty * $movement->unit_cost;
            }
        }

        $validBinIds = [];
        foreach ($stockByKey as $key => $stock) {
            [$warehouseId, $binId] = explode(':', $key, 2);
            $validBinIds[] = (int) $binId;

            $cost = $costIn[$key] ?? null;
            $average = $cost && $cost['qty'] > 0 ? $cost['cost'] / $cost['qty'] : null;

            ItemStock::updateOrInsert(
                ['item_id' => $itemId, 'warehouse_id' => (int) $warehouseId, 'bin_id' => (int) $binId],
                ['stock' => $stock, 'unit_cost_avg' => $average, 'updated_at' => now()]
            );
        }

        if ($validBinIds !== []) {
            ItemStock::where('item_id', $itemId)
                ->whereNotIn('bin_id', $validBinIds)
                ->delete();
        }

        Item::where('id', $itemId)->update([
            'stock' => array_sum($stockByKey),
            'reserved' => min(ItemStock::where('item_id', $itemId)->sum('reserved'), array_sum($stockByKey)),
        ]);
    }

    /**
     * Distribute a total reserved quantity across an item's stock rows
     * (weighted by current stock) and sync the item total.
     */
    public function setReserved(int $itemId, int $reserved): void
    {
        $rows = ItemStock::where('item_id', $itemId)->get();
        $total = (int) $rows->sum('stock');

        foreach ($rows as $row) {
            $rowReserved = $total > 0 ? (int) floor($reserved * $row->stock / $total) : 0;
            ItemStock::where('item_id', $row->item_id)
                ->where('warehouse_id', $row->warehouse_id)
                ->where('bin_id', $row->bin_id)
                ->update(['reserved' => $rowReserved]);
        }

        Item::where('id', $itemId)->update([
            'reserved' => min($reserved, (int) ItemStock::where('item_id', $itemId)->sum('stock')),
        ]);
    }
}
