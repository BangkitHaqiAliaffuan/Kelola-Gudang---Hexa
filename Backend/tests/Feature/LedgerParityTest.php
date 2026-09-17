<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Merk;
use App\Models\Rack;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Parity incremental vs full-fold (Fase 5.1).
 *
 * `applyMovements` (delta O(m)) harus menghasilkan ledger identik dengan
 * `rebuildForItem` (fold O(n)) untuk movement in-order. Pengecualian yang
 * disengaja dan diassert eksplisit: baris lokasi basi (rebuild menghapus,
 * incremental mempertahankan) dan dokumen backdated (wajib fallback
 * rebuild karena clamp order-dependent).
 */
class LedgerParityTest extends TestCase
{
    use RefreshDatabase;

    private StockLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(StockLedger::class);
    }

    /**
     * Fixture deterministik: semua kolom unique-DB diisi eksplisit per trial.
     * Infrastruktur (gudang/rak/bin) dibuat SEKALI per test — definisi factory
     * mengevaluasi draw unique() walau dioverride, dan pool kecil (bay/position
     * 1–99) habis bila dibuat ulang tiap trial dari 30-trial loop.
     *
     * @return array{whA: Warehouse, whB: Warehouse, binA: Bin, binB: Bin}
     */
    private function makeInfra(): array
    {
        $whA = Warehouse::factory()->create(['code' => 'GDG-PTA', 'name' => 'WH Parity A']);
        $whB = Warehouse::factory()->create(['code' => 'GDG-PTB', 'name' => 'WH Parity B']);
        $rackA = Rack::factory()->create([
            'warehouse_id' => $whA->id, 'aisle' => 'A', 'bay' => '01', 'code' => 'R-PTA', 'name' => 'Rak PTA',
        ]);
        $rackB = Rack::factory()->create([
            'warehouse_id' => $whB->id, 'aisle' => 'A', 'bay' => '01', 'code' => 'R-PTB', 'name' => 'Rak PTB',
        ]);
        $binA = Bin::factory()->create([
            'rack_id' => $rackA->id, 'level' => '01', 'position' => '01', 'code' => 'B-PTA', 'name' => 'Bin PTA',
        ]);
        $binB = Bin::factory()->create([
            'rack_id' => $rackB->id, 'level' => '01', 'position' => '01', 'code' => 'B-PTB', 'name' => 'Bin PTB',
        ]);

        return ['whA' => $whA, 'whB' => $whB, 'binA' => $binA, 'binB' => $binB];
    }

    /** @return array{itemA: Item, itemB: Item} */
    private function makeItems(int $t, Category $cat, Unit $unit, Merk $merk): array
    {
        $attrs = fn (string $sfx) => [
            'sku' => "SKU-PARITY-T{$t}-{$sfx}",
            'barcode' => "BP{$t}{$sfx}",
            'internal_barcode' => "IB-PT{$t}{$sfx}",
            'name' => "Parity Item T{$t} {$sfx}",
            'category_id' => $cat->id,
            'sub_category_id' => null,
            'brand_id' => $merk->id,
            'unit_id' => $unit->id,
            'default_warehouse_id' => null,
        ];

        return [
            'itemA' => Item::factory()->create($attrs('A')),
            'itemB' => Item::factory()->create($attrs('B')),
        ];
    }

    /**
     * @param  array{whA: Warehouse, whB: Warehouse, binA: Bin, binB: Bin}  $infra
     * @return array{whA: Warehouse, whB: Warehouse, binA: Bin, binB: Bin, itemA: Item, itemB: Item}
     */
    private function makeStage(int $t, array $infra, Category $cat, Unit $unit, Merk $merk): array
    {
        return [...$infra, ...$this->makeItems($t, $cat, $unit, $merk)];
    }

    private function sharedMaster(): array
    {
        return [
            Category::factory()->create(['code' => 'KAT-PT', 'name' => 'Kategori Parity']),
            Unit::factory()->create(),
            Merk::factory()->create(),
        ];
    }

    /**
     * @param  array{whA: Warehouse, whB: Warehouse, binA: Bin, binB: Bin}  $stage
     * @return array{warehouse_id:int,bin_id:?int,direction:string,qty:int,unit_cost:float,occurred_at:string}
     */
    private function movementAttributes(array $stage, int $itemId, string $loc, string $dir, int $qty, float $cost, int $day): array
    {
        [$wh, $bin] = match ($loc) {
            'A0' => [$stage['whA']->id, null],
            'A1' => [$stage['whA']->id, $stage['binA']->id],
            'B0' => [$stage['whB']->id, null],
            default => [$stage['whB']->id, $stage['binB']->id],
        };

        return [
            'item_id' => $itemId,
            'warehouse_id' => $wh,
            'bin_id' => $bin,
            'direction' => $dir,
            'qty' => $qty,
            'movement_type' => 'Penerimaan',
            'reference_no' => 'PARITY',
            'unit_cost' => $cost,
            'occurred_at' => sprintf('2026-03-%02d 10:00:00', $day),
        ];
    }

    private function assertSameLedger(int $itemA, int $itemB, string $ctx): void
    {
        $keyed = fn (int $id) => ItemStock::where('item_id', $id)->get()
            ->keyBy(fn ($r) => $r->warehouse_id.':'.($r->bin_id ?? 'NULL'));

        $rowsA = $keyed($itemA);
        $rowsB = $keyed($itemB);
        $this->assertSame($rowsB->keys()->sort()->values()->all(), $rowsA->keys()->sort()->values()->all(), "baris lokasi sama ({$ctx})");

        foreach ($rowsA as $key => $ra) {
            $rb = $rowsB->get($key);
            $this->assertSame((int) $rb->stock, (int) $ra->stock, "stock {$key} ({$ctx})");
            $this->assertSame((int) $rb->in_qty, (int) $ra->in_qty, "in_qty {$key} ({$ctx})");
            $this->assertEqualsWithDelta((float) $rb->in_cost, (float) $ra->in_cost, 0.01, "in_cost {$key} ({$ctx})");
            $this->assertEqualsWithDelta((float) ($rb->unit_cost_avg ?? 0), (float) ($ra->unit_cost_avg ?? 0), 0.01, "avg {$key} ({$ctx})");
        }

        $ia = Item::find($itemA);
        $ib = Item::find($itemB);
        $this->assertSame((int) $ib->stock, (int) $ia->stock, "items.stock ({$ctx})");
        $this->assertSame((int) $ib->reserved, (int) $ia->reserved, "items.reserved ({$ctx})");
    }

    public function test_incremental_matches_rebuild_prng(): void
    {
        mt_srand(20260917);
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();

        for ($trial = 0; $trial < 30; $trial++) {
            $stage = $this->makeStage($trial, $infra, $cat, $unit, $merk);
            $locs = ['A0', 'A1', 'B0', 'B1'];
            $n = mt_rand(1, 120);
            $chunk = mt_rand(1, 10);

            $events = [];
            for ($i = 0; $i < $n; $i++) {
                $events[] = [
                    $locs[mt_rand(0, 3)],
                    mt_rand(0, 1) === 0 ? 'IN' : 'OUT',
                    mt_rand(1, 50),
                    (float) mt_rand(100, 20000),
                ];
            }

            // Jalur A: insert semua movement, terapkan incremental per chunk
            // (mensimulasikan banyak posting berurutan).
            $day = 1;
            foreach (array_chunk($events, $chunk) as $batch) {
                $attrs = [];
                foreach ($batch as [$loc, $dir, $qty, $cost]) {
                    $a = $this->movementAttributes($stage, $stage['itemA']->id, $loc, $dir, $qty, $cost, $day);
                    StockMovement::create($a);
                    $attrs[] = $a;
                    $day = min(28, $day + ($dir === 'IN' ? 0 : 1));
                }
                $this->ledger->applyMovements($stage['itemA']->id, $attrs);
            }

            // Jalur B: stream movement identik, satu rebuild di akhir.
            $day = 1;
            foreach ($events as [$loc, $dir, $qty, $cost]) {
                StockMovement::create($this->movementAttributes($stage, $stage['itemB']->id, $loc, $dir, $qty, $cost, $day));
                $day = min(28, $day + ($dir === 'IN' ? 0 : 1));
            }
            $this->ledger->rebuildForItem($stage['itemB']->id);

            $this->assertSameLedger($stage['itemA']->id, $stage['itemB']->id, "trial {$trial}");
        }
    }

    public function test_overconsume_then_in_matches(): void
    {
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();
        $stage = $this->makeStage(0, $infra, $cat, $unit, $merk);

        foreach (['itemA' => true, 'itemB' => true] as $key => $_) {
            $itemId = $stage[$key]->id;
            $out = $this->movementAttributes($stage, $itemId, 'A1', 'OUT', 10, 1000.0, 1);
            $in = $this->movementAttributes($stage, $itemId, 'A1', 'IN', 3, 2000.0, 2);
            StockMovement::create($out);
            StockMovement::create($in);
        }

        $this->ledger->applyMovements($stage['itemA']->id, [
            $this->movementAttributes($stage, $stage['itemA']->id, 'A1', 'OUT', 10, 1000.0, 1),
            $this->movementAttributes($stage, $stage['itemA']->id, 'A1', 'IN', 3, 2000.0, 2),
        ]);
        $this->ledger->rebuildForItem($stage['itemB']->id);

        // Clamp per langkah: OUT di state kosong → 0, lalu IN 3 → 3 (bukan -7).
        $this->assertSame(3, (int) ItemStock::where('item_id', $stage['itemA']->id)->value('stock'));
        $this->assertSameLedger($stage['itemA']->id, $stage['itemB']->id, 'overconsume');
    }

    public function test_backdated_falls_back_to_rebuild(): void
    {
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();
        $stage = $this->makeStage(0, $infra, $cat, $unit, $merk);

        foreach (['itemA' => true, 'itemB' => true] as $key => $_) {
            $itemId = $stage[$key]->id;
            $jan = $this->movementAttributes($stage, $itemId, 'A1', 'IN', 10, 1000.0, 1);
            $jan['occurred_at'] = '2026-01-05 10:00:00';
            StockMovement::create($jan);
            $this->ledger->rebuildForItem($itemId);
        }

        // Dokumen backdated: OUT Desember 8 setelah histori Januari.
        // Fold terurut: OUT di state kosong → clamp 0, lalu IN 10 → 10.
        // Delta-di-akhir (tanpa fallback) akan memberi 10 − 8 = 2 — SALAH.
        $dec = $this->movementAttributes($stage, $stage['itemA']->id, 'A1', 'OUT', 8, 1000.0, 1);
        $dec['occurred_at'] = '2025-12-05 10:00:00';
        $decB = $this->movementAttributes($stage, $stage['itemB']->id, 'A1', 'OUT', 8, 1000.0, 1);
        $decB['occurred_at'] = '2025-12-05 10:00:00';
        StockMovement::create($dec);
        StockMovement::create($decB);

        $this->ledger->refreshForNewMovements($stage['itemA']->id, [$dec], '2025-12-05 10:00:00');
        $this->ledger->rebuildForItem($stage['itemB']->id);

        $this->assertSame(10, (int) ItemStock::where('item_id', $stage['itemA']->id)->value('stock'));
        $this->assertSameLedger($stage['itemA']->id, $stage['itemB']->id, 'backdated');
    }

    public function test_stale_location_row_differs_by_design(): void
    {
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();
        $stage = $this->makeStage(0, $infra, $cat, $unit, $merk);

        // Baris yatim tanpa movement (mis. sisa reset bin manual). Pakai query
        // builder karena model ItemStock $timestamps=false (create() tak
        // menulis updated_at yang NOT NULL).
        DB::table('item_stock')->insert([
            'item_id' => $stage['itemA']->id,
            'warehouse_id' => $stage['whA']->id,
            'bin_id' => null,
            'stock' => 7,
            'reserved' => 0,
            'in_qty' => 0,
            'in_cost' => 0,
            'unit_cost_avg' => null,
            'updated_at' => now(),
        ]);
        DB::table('item_stock')->insert([
            'item_id' => $stage['itemB']->id,
            'warehouse_id' => $stage['whA']->id,
            'bin_id' => null,
            'stock' => 7,
            'reserved' => 0,
            'in_qty' => 0,
            'in_cost' => 0,
            'unit_cost_avg' => null,
            'updated_at' => now(),
        ]);

        $in = $this->movementAttributes($stage, $stage['itemA']->id, 'B1', 'IN', 5, 1000.0, 1);
        StockMovement::create($in);
        $inB = $this->movementAttributes($stage, $stage['itemB']->id, 'B1', 'IN', 5, 1000.0, 1);
        StockMovement::create($inB);

        $this->ledger->applyMovements($stage['itemA']->id, [$in]);
        $this->ledger->rebuildForItem($stage['itemB']->id);

        // BEDA DISENGAJA: rebuild menghapus baris basi; incremental
        // mempertahankan (penghapusan = tugas reconcile). Diassert eksplisit
        // agar perbedaan ini tidak dilaporkan sebagai regresi kelak.
        $this->assertSame(2, ItemStock::where('item_id', $stage['itemA']->id)->count());
        $this->assertSame(1, ItemStock::where('item_id', $stage['itemB']->id)->count());
    }

    public function test_mismatch_skipped_by_both_paths(): void
    {
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();
        $stage = $this->makeStage(0, $infra, $cat, $unit, $merk);

        // Bin milik gudang B ditulis dengan warehouse A → mismatch.
        foreach (['itemA' => true, 'itemB' => true] as $key => $_) {
            $itemId = $stage[$key]->id;
            StockMovement::create([
                'item_id' => $itemId,
                'warehouse_id' => $stage['whA']->id,
                'bin_id' => $stage['binB']->id,
                'direction' => 'IN',
                'qty' => 4,
                'movement_type' => 'Penerimaan',
                'reference_no' => 'PARITY',
                'unit_cost' => 1000,
                'occurred_at' => '2026-03-01 10:00:00',
            ]);
        }

        $m = StockMovement::where('item_id', $stage['itemA']->id)->first()->toArray();
        $this->ledger->applyMovements($stage['itemA']->id, [$m]);
        $this->ledger->rebuildForItem($stage['itemB']->id);

        $this->assertSame(0, ItemStock::where('item_id', $stage['itemA']->id)->count());
        $this->assertSame(0, ItemStock::where('item_id', $stage['itemB']->id)->count());
        $this->assertSameLedger($stage['itemA']->id, $stage['itemB']->id, 'mismatch');
    }

    public function test_record_applies_single_movement(): void
    {
        [$cat, $unit, $merk] = $this->sharedMaster();
        $infra = $this->makeInfra();
        $stage = $this->makeStage(0, $infra, $cat, $unit, $merk);

        $this->ledger->record($this->movementAttributes($stage, $stage['itemA']->id, 'A1', 'IN', 6, 1500.0, 1));

        $row = ItemStock::where('item_id', $stage['itemA']->id)->first();
        $this->assertNotNull($row);
        $this->assertSame(6, (int) $row->stock);
        $this->assertSame(6, (int) $row->in_qty);
        $this->assertEqualsWithDelta(9000.0, (float) $row->in_cost, 0.01);
        $this->assertEqualsWithDelta(1500.0, (float) $row->unit_cost_avg, 0.01);
        $this->assertSame(6, (int) Item::find($stage['itemA']->id)->stock);
    }
}
