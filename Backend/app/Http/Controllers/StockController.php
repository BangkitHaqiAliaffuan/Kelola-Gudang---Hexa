<?php

namespace App\Http\Controllers;

use App\Http\Resources\StockRowResource;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class StockController extends Controller
{
    /**
     * Stock Saat Ini — current balances per item + location (warehouse/rack/bin).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = ItemStock::query()
            ->with(['item.category', 'item.unit', 'warehouse', 'bin.rack'])
            ->join('items', 'items.id', '=', 'item_stock.item_id')
            ->select('item_stock.*');

        if ($request->filled('search')) {
            $q = mb_strtolower((string) $request->string('search'));
            $query->where(function ($w) use ($q) {
                $w->whereRaw('LOWER(items.name) LIKE ?', ["%{$q}%"])
                    ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$q}%"]);
            });
        }

        if ($request->filled('item_id')) {
            $query->where('item_stock.item_id', $request->integer('item_id'));
        }

        if ($request->filled('warehouse_id')) {
            $query->where('item_stock.warehouse_id', $request->integer('warehouse_id'));
        }

        if ($request->filled('category_id')) {
            $query->where('items.category_id', $request->integer('category_id'));
        }

        if ($request->filled('status')) {
            $query->whereRaw(
                "CASE
                    WHEN item_stock.stock = 0 THEN 'Habis'
                    WHEN items.min_stock IS NOT NULL AND item_stock.stock <= items.min_stock THEN 'Menipis'
                    WHEN items.max_stock IS NOT NULL AND item_stock.stock >= items.max_stock THEN 'Overstock'
                    ELSE 'Normal'
                END = ?",
                [(string) $request->string('status')]
            );
        }

        $rows = $query
            ->orderBy('items.name')
            ->paginate($request->integer('per_page', 20));

        return StockRowResource::collection($rows);
    }

    /**
     * Kartu Stock — per-item movement history with running balance, optionally
     * scoped by warehouse and date range.
     */
    public function stockCard(Request $request)
    {
        $data = $request->validate([
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'method' => ['nullable', Rule::in(['FIFO', 'Average', 'Maximum Cost'])],
        ]);

        $item = Item::with(['unit', 'warehouse', 'bin'])
            ->findOrFail($data['item_id']);

        $method = $data['method'] ?? 'FIFO';
        $from = $data['from'] ?? null;
        $to = $data['to'] ?? null;

        $movements = StockMovement::where('item_id', $item->id)
            ->when($data['warehouse_id'] ?? null, fn ($q, $warehouseId) => $q->where('warehouse_id', $warehouseId))
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get();

        $opening = 0;
        $inRange = [];

        foreach ($movements as $movement) {
            $when = $movement->occurred_at;

            if ($from !== null && $when->lt($from)) {
                $opening += $movement->direction === 'IN' ? $movement->qty : -$movement->qty;

                continue;
            }

            if ($to !== null && $when->gt($to)) {
                break;
            }

            $inRange[] = $movement;
        }

        $saldo = $opening;
        $runningQty = 0;
        $runningCost = 0.0;
        $maxCost = null;
        $rows = [];

        foreach ($inRange as $movement) {
            $saldo += $movement->direction === 'IN' ? $movement->qty : -$movement->qty;

            if ($movement->direction === 'IN') {
                $runningQty += $movement->qty;
                $runningCost += $movement->qty * $movement->unit_cost;
                $maxCost = $maxCost === null ? $movement->unit_cost : max($maxCost, $movement->unit_cost);
            }

            $unitCost = match ($method) {
                'Average' => $runningQty > 0 ? $runningCost / $runningQty : ($item->cost ?? 0),
                'Maximum Cost' => $maxCost ?? $item->cost ?? 0,
                default => $item->cost ?? 0,
            };

            $rows[] = [
                'date' => $movement->occurred_at->toIso8601String(),
                'no' => $movement->reference_no,
                'type' => $movement->movement_type,
                'direction' => $movement->direction,
                'masuk' => $movement->direction === 'IN' ? $movement->qty : 0,
                'keluar' => $movement->direction === 'OUT' ? $movement->qty : 0,
                'saldo' => $saldo,
                'unit' => $item->unit?->name,
                'unit_cost' => $movement->unit_cost,
                'nilai' => round($saldo * $unitCost, 2),
                'pic' => $movement->pic,
                'note' => $movement->note,
                'partner' => $movement->partner,
                'reference' => $movement->reference_no,
            ];
        }

        $stockTotals = ItemStock::where('item_id', $item->id)
            ->when($data['warehouse_id'] ?? null, fn ($q, $warehouseId) => $q->where('warehouse_id', $warehouseId))
            ->get();

        return response()->json([
            'data' => [
                'item' => [
                    'id' => $item->id,
                    'sku' => $item->sku,
                    'name' => $item->name,
                    'unit' => $item->unit?->name,
                    'min' => $item->min_stock,
                    'max' => $item->max_stock,
                    'cost' => $item->cost,
                    'warehouse' => $item->warehouse?->name,
                    'current_stock' => (int) $stockTotals->sum('stock'),
                    'reserved' => (int) $stockTotals->sum('reserved'),
                ],
                'method' => $method,
                'saldo_awal' => $opening,
                'saldo_akhir' => $saldo,
                'rows' => $rows,
            ],
        ]);
    }
}
