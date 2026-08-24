<?php

namespace App\Http\Controllers;

use App\Http\Requests\LaporanMutasiRequest;
use App\Http\Resources\LaporanMutasiResource;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Carbon;

class LaporanController extends Controller
{
    /**
     * Laporan Mutasi — agregat per item per periode (saldo_awal, masuk, keluar, saldo_akhir, nilai).
     * Konsisten dengan StockController::valuation (batch fold) + stockCard opening semantics.
     */
    public function mutasi(LaporanMutasiRequest $request): AnonymousResourceCollection
    {
        $data = $request->validated();

        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $categoryId = $data['category_id'] ?? null;
        $search = $data['search'] ?? null;

        $query = Item::query()
            ->with(['category', 'unit'])
            ->when($categoryId !== null, fn ($q) => $q->where('items.category_id', $categoryId));

        if ($needle = strtolower((string) $search)) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(items.name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$needle}%"]);
            });
        }

        $items = $query->orderBy('items.name')->get();
        $itemIds = $items->pluck('id');

        if ($itemIds->isEmpty()) {
            $paginator = new LengthAwarePaginator([], 0, (int) ($data['per_page'] ?? 20), 1, ['path' => Paginator::resolveCurrentPath()]);
            return LaporanMutasiResource::collection($paginator);
        }

        // Batch movements for all items, scoped by warehouse if filter, ordered for FIFO fold.
        $movements = StockMovement::query()
            ->whereIn('item_id', $itemIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get()
            ->groupBy('item_id');

        // Reserved per item (current, for available calc if needed — not used for mutasi qty but for consistency)
        // Nilai akhir via moving average (unit_cost_avg) per warehouse scope.

        $items = $items->map(function (Item $item) use ($movements, $from, $to, $warehouseId) {
            $fifoLayers = [];
            $onHandQty = 0;
            $onHandValue = 0.0;
            $saldo = 0;
            $saldoAwal = 0;
            $masuk = 0;
            $keluar = 0;

            foreach ($movements->get($item->id, collect()) as $movement) {
                $when = $movement->occurred_at;

                // Beyond window -> stop (movements ordered)
                if ($when->gt($to)) {
                    break;
                }

                $beforeFrom = $when->lt($from);

                // FIFO / avg bookkeeping (same as stockCard/valuation)
                if ($movement->direction === 'IN') {
                    $fifoLayers[] = ['qty' => $movement->qty, 'cost' => $movement->unit_cost];
                    $onHandQty += $movement->qty;
                    $onHandValue += $movement->qty * $movement->unit_cost;
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

                // Saldo running
                $delta = $movement->direction === 'IN' ? $movement->qty : -$movement->qty;
                $saldo += $delta;

                if ($beforeFrom) {
                    $saldoAwal += $delta;
                    continue;
                }

                // Inside window [from, to]
                if ($movement->direction === 'IN') {
                    $masuk += $movement->qty;
                } else {
                    $keluar += $movement->qty;
                }
            }

            $saldoAkhir = $saldo; // saldo after folding up to $to

            // Nilai akhir via average (consistent with ItemStock unit_cost_avg)
            // If no movements, fallback to item cost.
            $unitCostAvg = $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0);
            $unitCostAvg = round($unitCostAvg, 2);
            $nilaiAkhir = round(max(0, $saldoAkhir) * $unitCostAvg, 2);

            // Attach computed fields for resource
            $item->saldo_awal = max(0, $saldoAwal);
            // saldo_awal should not be negative (opening can't be negative due to ledger guard)
            if ($item->saldo_awal < 0) {
                $item->saldo_awal = 0;
            }
            $item->masuk = $masuk;
            $item->keluar = $keluar;
            $item->saldo_akhir = max(0, $saldoAkhir);
            $item->nilai_akhir = $nilaiAkhir;
            $item->unit_cost_avg = $unitCostAvg;

            return $item;
        });

        $perPage = (int) ($data['per_page'] ?? 20);
        $page = Paginator::resolveCurrentPage('page');
        $paginator = new LengthAwarePaginator(
            $items->forPage($page, $perPage)->values(),
            $items->count(),
            $perPage,
            $page,
            ['path' => Paginator::resolveCurrentPath(), 'query' => $request->query()],
        );

        return LaporanMutasiResource::collection($paginator);
    }
}
