<?php

namespace App\Http\Controllers;

use App\Http\Requests\LaporanFastMovingRequest;
use App\Http\Resources\LaporanFastMovingResource;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;

class LaporanFastMovingController extends Controller
{
    /**
     * Laporan Fast Moving — velocity per item per periode dari konsumsi nyata
     * (movement OUT `Pengeluaran` saja; transfer/adjustment/opname adalah
     * mekanik inventory, bukan demand — konsisten dengan stock-minimum ADU).
     *
     * Keputusan yang dilayani: prioritas reorder, kenaikan safety stock,
     * alokasi antar gudang, dan cegah stockout (days_of_cover vs lead_time).
     * Sengaja TANPA omzet/margin (keputusan sales) dan TANPA valuasi
     * (irrelevan untuk velocity).
     */
    public function index(LaporanFastMovingRequest $request): AnonymousResourceCollection
    {
        $data = $request->validated();

        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $categoryId = $data['category_id'] ?? null;
        $search = $data['search'] ?? null;

        $periodDays = max(1, (int) $from->diffInDays($to) + 1);
        $prevFrom = $from->copy()->subDays($periodDays)->startOfDay();
        $prevTo = $from->copy()->subDay()->endOfDay();

        $query = Item::query()
            ->with(['category', 'unit'])
            ->when($categoryId !== null, fn ($q) => $q->where('items.category_id', $categoryId));

        if ($needle = strtolower((string) $search)) {
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(items.name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$needle}%"]);
            });
        }

        // Hanya item yang benar-benar keluar di periode ini (pre-filter SQL
        // sebelum paginasi agar meta.total = jumlah item bergerak).
        $query->whereExists(function ($q) use ($from, $to, $warehouseId) {
            $q->selectRaw('1')
                ->from('stock_movements')
                ->whereColumn('stock_movements.item_id', 'items.id')
                ->where('stock_movements.direction', 'OUT')
                ->where('stock_movements.movement_type', 'Pengeluaran')
                ->whereBetween('stock_movements.occurred_at', [$from->toDateTimeString(), $to->toDateTimeString()])
                ->when($warehouseId !== null, fn ($qq) => $qq->where('stock_movements.warehouse_id', $warehouseId));
        });

        $paginator = $query->orderBy('items.name')->paginate((int) ($data['per_page'] ?? 20));
        $paginator->appends($request->query());
        $pageIds = $paginator->getCollection()->pluck('id');

        $aggFor = function (Carbon $start, Carbon $end) use ($pageIds, $warehouseId) {
            return StockMovement::query()
                ->whereIn('item_id', $pageIds)
                ->where('direction', 'OUT')
                ->where('movement_type', 'Pengeluaran')
                ->whereBetween('occurred_at', [$start->toDateTimeString(), $end->toDateTimeString()])
                ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
                ->selectRaw('item_id, SUM(qty) AS keluar, COUNT(*) AS frekuensi, SUM(qty * unit_cost) AS nilai')
                ->groupBy('item_id')
                ->get()
                ->keyBy('item_id');
        };

        $agg = $aggFor($from, $to);
        $prev = $aggFor($prevFrom, $prevTo);

        $stockByItem = ItemStock::query()
            ->whereIn('item_id', $pageIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->selectRaw('item_id, COALESCE(SUM(stock), 0) AS stock, COALESCE(SUM(reserved), 0) AS reserved')
            ->groupBy('item_id')
            ->get()
            ->keyBy('item_id');

        $paginator->setCollection(
            $paginator->getCollection()->map(function (Item $item) use ($agg, $prev, $stockByItem, $periodDays) {
                $row = $agg->get($item->id);
                $keluar = (int) ($row?->keluar ?? 0);
                $frekuensi = (int) ($row?->frekuensi ?? 0);
                $nilai = round((float) ($row?->nilai ?? 0), 2);

                $st = $stockByItem->get($item->id);
                $stock = (int) ($st?->stock ?? 0);
                $reserved = (int) ($st?->reserved ?? 0);
                $tersedia = max(0, $stock - $reserved);

                $adu = round($keluar / $periodDays, 2);
                $cover = $adu > 0 && $tersedia > 0 ? round($tersedia / $adu, 1) : null;

                $prevQty = (int) ($prev->get($item->id)?->keluar ?? 0);
                $trend = $prevQty > 0 ? round(($keluar - $prevQty) / $prevQty * 100, 1) : null;

                $min = $item->min_stock;
                $leadTime = (int) ($item->lead_time ?? 0);
                $butuhReorder = $cover !== null && $leadTime > 0 && $cover <= $leadTime;

                $risiko = match (true) {
                    $tersedia <= 0 => 'Habis',
                    $min > 0 && $tersedia <= $min => 'Kritis',
                    $butuhReorder => 'Menipis',
                    default => 'Aman',
                };

                $item->keluar_qty = $keluar;
                $item->frekuensi = $frekuensi;
                $item->nilai_keluar = $nilai;
                $item->unit_cost_avg_keluar = $keluar > 0 ? round($nilai / $keluar, 2) : 0.0;
                $item->adu = $adu;
                $item->days_of_cover = $cover;
                $item->tersedia = $tersedia;
                $item->reserved = $reserved;
                $item->prev_qty = $prevQty;
                $item->trend_pct = $trend;
                $item->butuh_reorder = $butuhReorder;
                $item->risiko = $risiko;

                return $item;
            })
        );

        return LaporanFastMovingResource::collection($paginator);
    }
}
