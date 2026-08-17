<?php

namespace App\Http\Controllers;

use App\Http\Resources\StockMinimumResource;
use App\Http\Resources\StockRowResource;
use App\Http\Resources\StockValuationResource;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
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
     * Stock Minimum — per-item shortfall report. One row per item (stock summed
     * across locations), with average daily demand (only real consumption:
     * movement_type 'Pengeluaran'), days of cover, and a suggested reorder qty.
     */
    public function stockMinimum(Request $request)
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'days' => ['nullable', 'integer', Rule::in([14, 30, 60, 90])],
        ]);

        $days = (int) ($data['days'] ?? 30);
        $cutoff = now()->subDays($days);
        $warehouseId = $data['warehouse_id'] ?? null;

        $query = Item::query()
            ->select('items.*')
            ->with(['category', 'supplier', 'unit'])
            ->when($data['category_id'] ?? null, fn ($q, $categoryId) => $q->where('items.category_id', $categoryId));

        if ($needle = strtolower((string) ($data['search'] ?? ''))) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(items.name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$needle}%"]);
            });
        }

        $stockScope = ItemStock::query()->whereColumn('item_id', 'items.id');
        if ($warehouseId !== null) {
            $stockScope->where('warehouse_id', $warehouseId);
        }

        $query->addSelect([
            'total_stock' => (clone $stockScope)->selectRaw('COALESCE(SUM(stock), 0)'),
            'total_reserved' => (clone $stockScope)->selectRaw('COALESCE(SUM(reserved), 0)'),
        ]);

        $usageByItem = StockMovement::query()
            ->selectRaw('item_id, SUM(qty) AS used')
            ->where('direction', 'OUT')
            ->where('movement_type', 'Pengeluaran')
            ->where('occurred_at', '>=', $cutoff)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->groupBy('item_id')
            ->pluck('used', 'item_id');

        $rows = $query->orderBy('items.name')->paginate($request->integer('per_page', 20));

        $rows->getCollection()->transform(function (Item $item) use ($usageByItem, $days) {
            $totalStock = (int) ($item->total_stock ?? 0);
            $reserved = (int) ($item->total_reserved ?? 0);
            $available = max(0, $totalStock - $reserved);
            $min = $item->min_stock;
            $max = $item->max_stock;
            $leadTime = $item->lead_time;

            $adu = $days > 0 ? ((int) ($usageByItem[$item->id] ?? 0)) / $days : 0.0;

            $suggested = $max !== null
                ? max(0, $max - $available)
                : max(0, (int) ceil($adu * $leadTime + $min - $available));

            $status = match (true) {
                $totalStock <= 0 => 'Habis',
                $min > 0 && $available <= 0 => 'Kritis',
                $min > 0 && $available <= $min => 'Menipis',
                default => 'Normal',
            };

            $item->available = $available;
            $item->avg_daily_usage = round($adu, 2);
            $item->days_of_cover = $adu > 0 && $totalStock > 0 ? round($totalStock / $adu, 1) : null;
            $item->suggested_qty = $suggested;
            $item->status = $status;

            return $item;
        });

        return StockMinimumResource::collection($rows);
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

        $movements = StockMovement::with(['warehouse', 'stockDocument.destination'])
            ->where('item_id', $item->id)
            ->when($data['warehouse_id'] ?? null, fn ($q, $warehouseId) => $q->where('warehouse_id', $warehouseId))
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get();

        // Fold the full ledger (up to `to`) so FIFO layers / moving-average basis
        // carry across the `from` boundary, but only emit rows inside [from, to].
        $opening = 0;
        $saldo = 0;
        $fifoLayers = [];
        $onHandQty = 0;
        $onHandValue = 0.0;
        $maxCost = null;
        $rows = [];

        foreach ($movements as $movement) {
            $when = $movement->occurred_at;

            if ($to !== null && $when->gt($to)) {
                break;
            }

            $beforeFrom = $from !== null && $when->lt($from);

            $saldo += $movement->direction === 'IN' ? $movement->qty : -$movement->qty;

            if ($movement->direction === 'IN') {
                $fifoLayers[] = ['qty' => $movement->qty, 'cost' => $movement->unit_cost];
                $onHandQty += $movement->qty;
                $onHandValue += $movement->qty * $movement->unit_cost;
                $maxCost = $maxCost === null ? $movement->unit_cost : max($maxCost, $movement->unit_cost);
            } else {
                $remaining = $movement->qty;
                while ($remaining > 0 && $fifoLayers !== []) {
                    $take = min($remaining, $fifoLayers[0]['qty']);
                    $fifoLayers[0]['qty'] -= $take;
                    $remaining -= $take;

                    if ($fifoLayers[0]['qty'] === 0) {
                        array_shift($fifoLayers);
                    }
                }

                $avg = $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0);
                $onHandValue -= $movement->qty * $avg;
                $onHandQty -= $movement->qty;
            }

            if ($beforeFrom) {
                $opening += $movement->direction === 'IN' ? $movement->qty : -$movement->qty;

                continue;
            }

            $fifoValue = array_sum(array_map(fn ($layer) => $layer['qty'] * $layer['cost'], $fifoLayers));
            $unitCost = match ($method) {
                'Average' => $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0),
                'Maximum Cost' => $maxCost ?? $item->cost ?? 0,
                default => $saldo > 0 ? $fifoValue / $saldo : ($item->cost ?? 0),
            };

            $rows[] = [
                'date' => $movement->occurred_at->toIso8601String(),
                'no' => $movement->reference_no,
                'type' => $movement->movement_type,
                'direction' => $movement->direction,
                'warehouse' => $movement->warehouse?->name,
                'destination' => $movement->movement_type === 'Transfer Gudang'
                    ? $movement->stockDocument?->destination?->name
                    : null,
                'masuk' => $movement->direction === 'IN' ? $movement->qty : 0,
                'keluar' => $movement->direction === 'OUT' ? $movement->qty : 0,
                'saldo' => $saldo,
                'unit' => $item->unit?->name,
                'unit_cost' => $movement->unit_cost,
                'method_cost' => round($unitCost, 2),
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

    /**
     * Nilai Persediaan — one row per item with the on-hand value under each
     * valuation method (FIFO, Average, Maximum Cost), folded from the movement
     * ledger exactly like Kartu Stock. Also classifies how recently each item
     * moved (Fast/Medium/Slow/Dead) for the dead-stock dashboard.
     */
    public function valuation(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $warehouseId = $data['warehouse_id'] ?? null;

        $query = Item::query()
            ->with(['category', 'unit'])
            ->when($data['category_id'] ?? null, fn ($q, $categoryId) => $q->where('items.category_id', $categoryId));

        if ($needle = strtolower((string) ($data['search'] ?? ''))) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(items.name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$needle}%"]);
            });
        }

        $items = $query->orderBy('items.name')->get();
        $itemIds = $items->pluck('id');

        $movements = StockMovement::query()
            ->whereIn('item_id', $itemIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get()
            ->groupBy('item_id');

        $reservedByItem = ItemStock::query()
            ->whereIn('item_id', $itemIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->selectRaw('item_id, COALESCE(SUM(reserved), 0) AS reserved')
            ->groupBy('item_id')
            ->pluck('reserved', 'item_id');

        $now = now();

        $items = $items->map(function (Item $item) use ($movements, $reservedByItem, $now) {
            $fifoLayers = [];
            $onHandQty = 0;
            $onHandValue = 0.0;
            $maxCost = null;
            $saldo = 0;
            $lastMove = null;

            foreach ($movements->get($item->id, collect()) as $movement) {
                $lastMove = $movement->occurred_at;
                $saldo += $movement->direction === 'IN' ? $movement->qty : -$movement->qty;

                if ($movement->direction === 'IN') {
                    $fifoLayers[] = ['qty' => $movement->qty, 'cost' => $movement->unit_cost];
                    $onHandQty += $movement->qty;
                    $onHandValue += $movement->qty * $movement->unit_cost;
                    $maxCost = $maxCost === null ? $movement->unit_cost : max($maxCost, $movement->unit_cost);
                } else {
                    $remaining = $movement->qty;
                    while ($remaining > 0 && $fifoLayers !== []) {
                        $take = min($remaining, $fifoLayers[0]['qty']);
                        $fifoLayers[0]['qty'] -= $take;
                        $remaining -= $take;

                        if ($fifoLayers[0]['qty'] === 0) {
                            array_shift($fifoLayers);
                        }
                    }

                    $avg = $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0);
                    $onHandValue -= $movement->qty * $avg;
                    $onHandQty -= $movement->qty;
                }
            }

            $fifoValue = array_sum(array_map(fn ($layer) => $layer['qty'] * $layer['cost'], $fifoLayers));
            $stock = max(0, $saldo);
            $reserved = (int) ($reservedByItem[$item->id] ?? 0);

            $unitCostFifo = round($stock > 0 ? $fifoValue / $stock : ($item->cost ?? 0), 2);
            $unitCostAvg = round($onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0), 2);
            $unitCostMax = round($maxCost ?? $item->cost ?? 0, 2);

            $daysAgo = $lastMove !== null ? (int) $lastMove->diffInDays($now) : PHP_INT_MAX;
            $moving = match (true) {
                $daysAgo > 150 => 'Dead',
                $daysAgo > 60 => 'Slow',
                $daysAgo > 20 => 'Medium',
                default => 'Fast',
            };

            $item->stock = $stock;
            $item->reserved = $reserved;
            $item->available = max(0, $stock - $reserved);
            $item->unit_cost_fifo = $unitCostFifo;
            $item->unit_cost_avg = $unitCostAvg;
            $item->unit_cost_max = $unitCostMax;
            $item->nilai_fifo = round($stock * $unitCostFifo, 2);
            $item->nilai_avg = round($stock * $unitCostAvg, 2);
            $item->nilai_max = round($stock * $unitCostMax, 2);
            $item->last_move_at = $lastMove?->toIso8601String();
            $item->moving = $moving;

            return $item;
        });

        $perPage = (int) ($data['per_page'] ?? 20);
        $page = Paginator::resolveCurrentPage('page');
        $items = new LengthAwarePaginator(
            $items->forPage($page, $perPage),
            $items->count(),
            $perPage,
            $page,
            ['path' => Paginator::resolveCurrentPath()],
        );

        return StockValuationResource::collection($items);
    }
}
