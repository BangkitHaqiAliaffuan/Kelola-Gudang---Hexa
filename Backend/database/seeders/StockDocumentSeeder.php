<?php

namespace Database\Seeders;

use App\Models\Bin;
use App\Models\Item;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class StockDocumentSeeder extends Seeder
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

    private const TYPE_PREFIX = [
        'Penerimaan' => 'BM',
        'Pengeluaran' => 'BK',
        'Stock Adjustment' => 'ADJ',
        'Transfer Gudang' => 'TF',
        'Stock Opname' => 'SO',
    ];

    private const MAX_LINES_PER_DOCUMENT = 6;

    public function run(): void
    {
        // Deterministic LCG PRNG so the seeded ledger is reproducible.
        $state = 20260801;
        $rnd = static function () use (&$state): float {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

            return $state / 4294967296.0;
        };
        $int = static function (int $min, int $max) use ($rnd): int {
            return (int) floor($rnd() * ($max - $min + 1)) + $min;
        };
        $pick = static function (array $list) use ($int) {
            return $list[$int(0, count($list) - 1)];
        };

        $ref = CarbonImmutable::parse(self::REFERENCE_DATE);
        $items = Item::with('supplier')->orderBy('id')->get();
        $warehouses = Warehouse::orderBy('id')->get();
        $binsByWarehouse = Bin::with('rack')->get()
            ->groupBy(fn (Bin $bin): int => $bin->rack->warehouse_id);

        $counters = ['BM' => 0, 'BK' => 0, 'ADJ' => 0, 'TF' => 0, 'SO' => 0];

        // ---- Phase 1: per-item movement stream (chronological, balance-guarded) ----
        $movementList = [];
        $seq = 0;
        $finalBalance = [];

        foreach ($items as $item) {
            $n = $int(8, 24);
            $offsets = [];
            for ($j = 0; $j < $n; $j++) {
                $offsets[] = $int(0, 300);
            }
            sort($offsets);

            $currentCost = (float) $item->cost;
            $balance = 0;
            $prevTs = null;

            // Oldest-first so the balance guard holds in chronological replay order.
            for ($j = $n - 1; $j >= 0; $j--) {
                $day = $ref->subDays($offsets[$j])->startOfDay();

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
                    $type = $roll >= 0.84 ? 'Stock Adjustment' : 'Penerimaan';
                    $direction = 'IN';
                    $partner = $item->supplier?->name ?? 'Supplier';
                    $note = $type === 'Stock Adjustment' ? 'Penyesuaian stok (lebih)' : 'Penerimaan dari supplier';
                    $balance += $qty;
                } else {
                    $qty = $int(1, min(120, $balance));
                    $type = $roll >= 0.84 ? 'Stock Adjustment' : 'Pengeluaran';
                    $direction = 'OUT';
                    $partner = 'Departemen Produksi';
                    $note = $type === 'Stock Adjustment' ? 'Penyesuaian stok (kurang)' : 'Pengeluaran ke produksi';
                    $balance -= $qty;
                }

                $movementList[] = [
                    'seq' => $seq++,
                    'item' => $item,
                    'type' => $type,
                    'date' => $date,
                    'warehouse_id' => $item->default_warehouse_id,
                    'rack_id' => $item->default_rack_id,
                    'bin_id' => $item->default_bin_id,
                    'from_bin_id' => $item->default_bin_id,
                    'direction' => $direction,
                    'qty' => $qty,
                    'unit_cost' => $currentCost,
                    'partner' => $partner,
                    'note' => $note,
                    'pic' => $pick(self::PICS),
                ];
            }

            $finalBalance[$item->id] = $balance;
        }

        usort($movementList, fn (array $a, array $b): int => $a['date'] <=> $b['date'] ?: $a['seq'] <=> $b['seq']);

        // ---- Phase 2: group movements into documents (<= MAX_LINES per doc) ----
        $documents = [];
        $open = null;

        $closeDoc = static function () use (&$open, &$documents) {
            if ($open !== null && $open['lines'] !== []) {
                $documents[] = $open;
            }
            $open = null;
        };

        foreach ($movementList as $movement) {
            $day = $movement['date']->startOfDay()->toDateTimeString();
            $same = $open !== null
                && $open['type'] === $movement['type']
                && $open['day'] === $day
                && $open['warehouse_id'] === $movement['warehouse_id'];

            if (! $same || count($open['lines']) >= self::MAX_LINES_PER_DOCUMENT) {
                $closeDoc();
                $open = [
                    'type' => $movement['type'],
                    'day' => $day,
                    'warehouse_id' => $movement['warehouse_id'],
                    'date' => $movement['date'],
                    'partner' => $movement['partner'],
                    'pic' => $movement['pic'],
                    'note' => $movement['note'],
                    'lines' => [],
                ];
            }

            $open['lines'][] = $movement;
        }
        $closeDoc();

        // ---- Phase 3: transfers (single line per doc, after all phase-1 events) ----
        $transferDate = $ref->setTime(23, 55, 0);
        $transferredItems = [];

        foreach ($items as $item) {
            if (($finalBalance[$item->id] ?? 0) < 20 || $rnd() >= 0.16 || count($transferredItems) >= 25) {
                continue;
            }

            $destWarehouse = $pick(array_values($warehouses->reject(fn ($wh) => $wh->id === $item->default_warehouse_id)->all()));
            $destBins = $binsByWarehouse[$destWarehouse->id] ?? null;

            if ($destBins === null || $destBins->isEmpty()) {
                continue;
            }

            $qty = $int(2, min(15, (int) floor($finalBalance[$item->id] * 0.6)));
            $destBin = $destBins[$int(0, $destBins->count() - 1)];

            $documents[] = [
                'type' => 'Transfer Gudang',
                'day' => $transferDate->startOfDay()->toDateTimeString(),
                'warehouse_id' => $item->default_warehouse_id,
                'destination_warehouse_id' => $destWarehouse->id,
                'date' => $transferDate,
                'partner' => $destWarehouse->name,
                'pic' => $pick(self::PICS),
                'note' => 'Transfer gudang',
                'lines' => [
                    [
                        'item' => $item,
                        'qty' => -$qty,
                        'unit_cost' => $item->cost,
                        'from_bin_id' => $item->default_bin_id,
                        'to_bin_id' => $destBin->id,
                        'from_warehouse_id' => $item->default_warehouse_id,
                        'to_warehouse_id' => $destWarehouse->id,
                        'to_rack_id' => $destBin->rack_id,
                        'direction' => 'OUT',
                        'pair' => true,
                    ],
                ],
            ];

            $transferredItems[$item->id] = true;
        }

        // ---- Phase 4: stock opname (variance = actual - system), multi-SKU per doc ----
        $opnameDate = $ref->setTime(23, 56, 0);
        $opnamedItems = [];

        foreach ($warehouses as $warehouse) {
            if (count($opnamedItems) >= 100) {
                break;
            }

            $candidates = [];
            foreach ($items as $item) {
                if ($item->default_warehouse_id !== $warehouse->id) {
                    continue;
                }
                if (isset($transferredItems[$item->id]) || ($finalBalance[$item->id] ?? 0) < 1 || $rnd() >= 0.15) {
                    continue;
                }
                $candidates[] = $item;
            }

            $candidates = array_slice($candidates, 0, $int(8, 12));

            $lines = [];
            foreach ($candidates as $item) {
                $system = $finalBalance[$item->id];
                $mismatch = $rnd() < 0.7;

                if ($mismatch) {
                    $maxDelta = max(1, (int) ceil($system * 0.3));
                    if ($rnd() < 0.55) {
                        $delta = min($int(1, $maxDelta), $system);
                        $actual = $system - $delta;
                    } else {
                        $delta = $int(1, $maxDelta);
                        $actual = $system + $delta;
                    }
                } else {
                    $delta = 0;
                    $actual = $system;
                }

                $lines[] = [
                    'item' => $item,
                    'system_qty' => $system,
                    'actual_qty' => $actual,
                    'delta' => $delta,
                    'unit_cost' => $item->cost,
                    'from_bin_id' => $item->default_bin_id,
                    'to_bin_id' => null,
                    'from_warehouse_id' => $item->default_warehouse_id,
                    'direction' => $delta > 0 ? 'IN' : ($delta < 0 ? 'OUT' : null),
                ];
            }

            while ($lines !== []) {
                $groupSize = min($int(3, 6), count($lines));
                if ($groupSize < 2) {
                    break;
                }

                $group = array_splice($lines, 0, $groupSize);

                foreach ($group as $line) {
                    $finalBalance[$line['item']->id] = $line['actual_qty'];
                    $opnamedItems[$line['item']->id] = true;
                }

                $documents[] = [
                    'type' => 'Stock Opname',
                    'day' => $opnameDate->startOfDay()->toDateTimeString(),
                    'warehouse_id' => $warehouse->id,
                    'destination_warehouse_id' => null,
                    'date' => $opnameDate,
                    'partner' => null,
                    'pic' => $pick(self::PICS),
                    'note' => 'Opname stok (hitung fisik)',
                    'lines' => $group,
                ];
            }
        }

        // ---- Phase 5: bring a subset of items below their minimum (consumption),
        //      so the Stock Minimum report has a realistic spread (Habis/Kritis/Menipis) ----
        $depleteDate = $ref->setTime(23, 57, 0);
        $depleteLines = [];

        foreach ($items as $item) {
            $balance = (int) ($finalBalance[$item->id] ?? 0);
            $min = (int) $item->min_stock;

            // Skip transferred items (finalBalance ignores the transfer split) and
            // items already at/below their minimum (no room to consume below it).
            if (isset($transferredItems[$item->id]) || $balance <= $min || $rnd() >= 0.20) {
                continue;
            }

            $bucket = $rnd();
            if ($bucket < 0.10) {
                $target = 0;                                                              // Habis
            } elseif ($bucket < 0.35) {
                $target = max(1, (int) ceil($min * 0.2));                                  // Kritis ketat
            } else {
                $target = $int(max(1, (int) ceil($min * 0.4)), max(1, $min));              // Menipis lebar
            }

            $consumed = $balance - $target;
            if ($consumed < 1) {
                continue;
            }

            $depleteLines[$item->default_warehouse_id][] = [
                'item' => $item,
                'qty' => -$consumed,
                'unit_cost' => $item->cost,
                'from_bin_id' => $item->default_bin_id,
                'to_bin_id' => null,
                'from_warehouse_id' => $item->default_warehouse_id,
                'direction' => 'OUT',
                'final' => $target,
            ];
        }

        foreach ($depleteLines as $warehouseId => $lines) {
            while ($lines !== []) {
                $groupSize = min($int(3, 6), count($lines));
                if ($groupSize < 2) {
                    break;
                }

                $group = array_splice($lines, 0, $groupSize);

                foreach ($group as $line) {
                    $finalBalance[$line['item']->id] = $line['final'];
                }

                $documents[] = [
                    'type' => 'Pengeluaran',
                    'day' => $depleteDate->startOfDay()->toDateTimeString(),
                    'warehouse_id' => $warehouseId,
                    'date' => $depleteDate,
                    'partner' => 'Departemen Produksi',
                    'pic' => $pick(self::PICS),
                    'note' => 'Pemakaian produksi (stok tersisa di bawah minimum)',
                    'lines' => $group,
                ];
            }
        }

        // ---- Phase 6: a few non-posted documents (lines but no movements) ----
        $nonPostedTypes = ['Penerimaan', 'Pengeluaran', 'Stock Adjustment', 'Transfer Gudang'];
        $nonPostedStatuses = ['Draft', 'Menunggu Approval', 'Dibatalkan'];

        for ($k = 0, $count = $int(4, 7); $k < $count; $k++) {
            $type = $pick($nonPostedTypes);
            $lineCount = $int(1, 3);
            $lines = [];

            for ($i = 0; $i < $lineCount; $i++) {
                $item = $pick($items->all());
                $signed = match ($type) {
                    'Penerimaan' => 1,
                    'Pengeluaran' => -1,
                    'Stock Adjustment' => $rnd() < 0.5 ? -1 : 1,
                    default => -1,
                };

                $lines[] = [
                    'item' => $item,
                    'qty' => $signed * $int(1, 50),
                    'unit_cost' => $item->cost,
                    'from_bin_id' => $item->default_bin_id,
                    'to_bin_id' => $type === 'Transfer Gudang' ? $pick($binsByWarehouse->first()->all())->id : null,
                    'from_warehouse_id' => $item->default_warehouse_id,
                ];
            }

            $documents[] = [
                'type' => $type,
                'day' => $ref->subDays($int(0, 30))->startOfDay()->toDateTimeString(),
                'warehouse_id' => $lines[0]['item']->default_warehouse_id,
                'destination_warehouse_id' => $type === 'Transfer Gudang' ? $pick(array_values($warehouses->all()))->id : null,
                'date' => $ref->subDays($int(0, 30))->setTime($int(7, 17), $int(0, 59), 0),
                'partner' => $type === 'Penerimaan' ? ($lines[0]['item']->supplier?->name ?? 'Supplier') : ($type === 'Pengeluaran' ? 'Departemen Produksi' : null),
                'pic' => $pick(self::PICS),
                'note' => 'Dokumen belum diposting',
                'status' => $pick($nonPostedStatuses),
                'lines' => $lines,
            ];
        }

        // ---- Persist: documents -> lines -> movements, then rebuild balances ----
        $ledger = new StockLedger;

        DB::transaction(function () use ($documents, $counters, $finalBalance, $int, $ledger) {
            $counters = ['BM' => 0, 'BK' => 0, 'ADJ' => 0, 'TF' => 0, 'SO' => 0];
            $docNo = static function (string $type, array &$counters) {
                $prefix = StockDocumentSeeder::TYPE_PREFIX[$type];
                $counters[$prefix]++;

                return "{$prefix}/2026/".str_pad((string) $counters[$prefix], 5, '0', STR_PAD_LEFT);
            };

            foreach ($documents as $def) {
                $status = $def['status'] ?? 'Selesai';
                $posted = $status === 'Selesai';

                $doc = StockDocument::create([
                    'no' => $docNo($def['type'], $counters),
                    'type' => $def['type'],
                    'status' => $status,
                    'document_date' => $def['date'],
                    'warehouse_id' => $def['warehouse_id'],
                    'destination_warehouse_id' => $def['destination_warehouse_id'] ?? null,
                    'partner' => $def['partner'],
                    'reference_no' => $def['type'] === 'Penerimaan' ? "PO-{$int(10000, 99999)}" : ($def['type'] === 'Pengeluaran' ? "SPK-{$int(10000, 99999)}" : null),
                    'pic' => $def['pic'],
                    'note' => $def['note'],
                    'posted_at' => $posted ? $def['date'] : null,
                ]);

                foreach ($def['lines'] as $index => $line) {
                    $lineNo = $index + 1;

                    $lineModel = StockDocumentLine::create([
                        'document_id' => $doc->id,
                        'line_no' => $lineNo,
                        'item_id' => $line['item']->id,
                        'qty' => $line['qty'] ?? null,
                        'system_qty' => $line['system_qty'] ?? null,
                        'actual_qty' => $line['actual_qty'] ?? null,
                        'from_bin_id' => $line['from_bin_id'] ?? null,
                        'to_bin_id' => $line['to_bin_id'] ?? null,
                        'unit_cost' => $line['unit_cost'] ?? 0,
                    ]);

                    if (! $posted) {
                        continue;
                    }

                    if ($def['type'] === 'Transfer Gudang') {
                        $out = StockMovement::create([
                            'item_id' => $line['item']->id,
                            'warehouse_id' => $def['warehouse_id'],
                            'rack_id' => $line['item']->default_rack_id,
                            'bin_id' => $line['from_bin_id'],
                            'direction' => 'OUT',
                            'qty' => abs($line['qty']),
                            'movement_type' => $def['type'],
                            'reference_no' => $doc->no,
                            'partner' => $doc->partner,
                            'unit_cost' => $line['unit_cost'],
                            'pic' => $doc->pic,
                            'note' => $doc->note,
                            'occurred_at' => $def['date'],
                            'stock_document_id' => $doc->id,
                            'line_no' => $lineNo,
                        ]);

                        $in = StockMovement::create([
                            'item_id' => $line['item']->id,
                            'warehouse_id' => $line['to_warehouse_id'],
                            'rack_id' => $line['to_rack_id'],
                            'bin_id' => $line['to_bin_id'],
                            'direction' => 'IN',
                            'qty' => abs($line['qty']),
                            'movement_type' => $def['type'],
                            'reference_no' => $doc->no,
                            'partner' => $doc->partner,
                            'unit_cost' => $line['unit_cost'],
                            'pic' => $doc->pic,
                            'note' => $doc->note,
                            'occurred_at' => $def['date'],
                            'stock_document_id' => $doc->id,
                            'line_no' => $lineNo,
                        ]);

                        $out->update(['pair_id' => $in->id]);
                        $in->update(['pair_id' => $out->id]);

                        continue;
                    }

                    $qty = ($line['qty'] ?? null) !== null ? abs($line['qty']) : (int) ($line['delta'] ?? 0);
                    if ($qty === 0) {
                        continue;
                    }

                    $direction = $line['direction'] ?? ($line['qty'] >= 0 ? 'IN' : 'OUT');

                    StockMovement::create([
                        'item_id' => $line['item']->id,
                        'warehouse_id' => $line['from_warehouse_id'] ?? $line['warehouse_id'] ?? $def['warehouse_id'],
                        'rack_id' => $line['item']->default_rack_id,
                        'bin_id' => $line['from_bin_id'] ?? $line['bin_id'],
                        'direction' => $direction,
                        'qty' => $qty,
                        'movement_type' => $def['type'],
                        'reference_no' => $doc->no,
                        'partner' => $doc->partner,
                        'unit_cost' => $line['unit_cost'],
                        'pic' => $doc->pic,
                        'note' => $doc->note,
                        'occurred_at' => $def['date'],
                        'stock_document_id' => $doc->id,
                        'line_no' => $lineNo,
                    ]);
                }
            }

            foreach (array_keys($finalBalance) as $itemId) {
                $ledger->rebuildForItem($itemId);
            }

            foreach ($finalBalance as $itemId => $balance) {
                $item = Item::find($itemId);
                if ($item === null) {
                    continue;
                }

                $reserved = $item->status === 'Nonaktif' || $balance <= 0
                    ? 0
                    : $int(0, min(60, $balance));
                $ledger->setReserved($itemId, $reserved);
            }
        });
    }
}
