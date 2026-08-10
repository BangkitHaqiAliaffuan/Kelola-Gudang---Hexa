<?php

namespace Database\Seeders;

use App\Models\Item;
use App\Models\StockMovement;
use App\Services\StockLedger;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class StockMovementSeeder extends Seeder
{
    private const REFERENCE_DATE = '2026-08-01';

    private const PICS = [
        'Agus Salim',
        'Bayu Pratama',
        'Dewi Lestari',
        'Nur Hidayat',
        'Rudi Hartono',
        'Siti Aminah',
    ];

    public function run(): void
    {
        // Deterministic LCG PRNG so the seeded ledger is reproducible.
        $state = 20260801;
        $rnd = static function () use (&$state): float {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

            return $state / 4294967296.0;
        };
        $int = static function (int $min, int $max) use ($rnd) {
            return (int) floor($rnd() * ($max - $min + 1)) + $min;
        };

        $ledger = new StockLedger;
        $ref = CarbonImmutable::parse(self::REFERENCE_DATE);
        $counters = ['BM' => 0, 'BK' => 0, 'ADJ' => 0];

        $items = Item::with('supplier')->orderBy('id')->get();

        foreach ($items as $item) {
            $n = $int(8, 24);
            $offsets = [];
            for ($j = 0; $j < $n; $j++) {
                $offsets[] = $int(0, 300);
            }
            sort($offsets);

            $currentCost = (float) $item->cost;
            $balance = 0;
            $movements = [];
            $prevTs = null;

            // Generate oldest-first so the balance guard holds in chronological replay order.
            for ($j = $n - 1; $j >= 0; $j--) {
                $day = $ref->subDays($offsets[$j])->startOfDay();

                // Keep timestamps strictly increasing so generation order == chronological order
                // (two movements on the same day must not reorder around the balance guard).
                do {
                    $date = $day->setTime($int(7, 17), $int(0, 59), 0);
                } while ($prevTs !== null && $date->lte($prevTs));
                $prevTs = $date;

                // Force an inbound when there is no balance left.
                $roll = $rnd();
                $isIn = $balance <= 0
                    || $roll < 0.42
                    || ($roll >= 0.84 && $rnd() < 0.5);

                if ($isIn) {
                    $qty = $int(20, 400);
                    $currentCost = round($currentCost * (1 + $rnd() * 0.08), 2);
                    $type = $roll >= 0.84 ? 'Adjustment' : 'Penerimaan';
                    $no = $type === 'Adjustment' ? 'ADJ' : 'BM';
                    $counters[$no]++;
                    $direction = 'IN';
                    $partner = $item->supplier?->name ?? 'Supplier';
                    $note = $type === 'Adjustment' ? 'Penyesuaian stok (lebih)' : 'Penerimaan dari supplier';
                } else {
                    $qty = $int(1, min(120, $balance));
                    $balance -= $qty;
                    $type = $roll >= 0.84 ? 'Adjustment' : 'Pengeluaran';
                    $no = $type === 'Adjustment' ? 'ADJ' : 'BK';
                    $counters[$no]++;
                    $direction = 'OUT';
                    $partner = 'Departemen Produksi';
                    $note = $type === 'Adjustment' ? 'Penyesuaian stok (kurang)' : 'Pengeluaran ke produksi';
                }

                if ($direction === 'IN') {
                    $balance += $qty;
                }

                $movements[] = [
                    'item_id' => $item->id,
                    'warehouse_id' => $item->default_warehouse_id,
                    'rack_id' => $item->default_rack_id,
                    'bin_id' => $item->default_bin_id,
                    'direction' => $direction,
                    'qty' => $qty,
                    'movement_type' => $type,
                    'reference_no' => "{$no}/2026/".str_pad((string) $counters[$no], 5, '0', STR_PAD_LEFT),
                    'partner' => $partner,
                    'unit_cost' => $currentCost,
                    'pic' => self::PICS[$j % count(self::PICS)],
                    'note' => $note,
                    'occurred_at' => $date,
                ];
            }

            DB::transaction(function () use ($movements, $ledger, $item, $balance, $int) {
                foreach ($movements as $attributes) {
                    StockMovement::create($attributes);
                }

                $ledger->rebuildForItem($item->id);

                $reserved = $item->status === 'Nonaktif' || $balance <= 0
                    ? 0
                    : $int(0, min(60, $balance));
                $ledger->setReserved($item->id, $reserved);
            });
        }
    }
}
