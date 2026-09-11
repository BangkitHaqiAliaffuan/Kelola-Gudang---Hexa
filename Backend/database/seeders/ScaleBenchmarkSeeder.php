<?php

namespace Database\Seeders;

use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Dataset skala target untuk benchmark kuantitatif roadmap (Fase 2-4):
 * ~50.000 item + ~1.000.000 movement + puluhan ribu dokumen.
 *
 * DATABASE DEDICATED: seeder ini jalan di `kelolagudang_bench` — BUKAN di
 * `kelolagudang_test` (diperebutkan suite test + sesi lain, datanya bisa
 * ter-wipe kapan saja oleh migrate:fresh) dan BUKAN di `kelolagudang`.
 *
 * PENGAMAN ANTI-DEV (jangan dihapus/dilonggarkan):
 * - DILARANG menyentuh database dev `kelolagudang`. Gate di bawah abort
 *   SEBELUM satu baris pun ditulis bila koneksi aktif bukan allowlist
 *   (`kelolagudang_bench` kini utama; `kelolagudang_test` diizinkan untuk
 *   kompatibilitas, mis. CI tanpa DB dedicated).
 * - Hanya dipanggil eksplisit, JANGAN didaftarkan di DatabaseSeeder:
 *   DB_CONNECTION=pgsql DB_DATABASE=kelolagudang_bench php artisan db:seed --class=ScaleBenchmarkSeeder
 *
 * Knobs (env, dengan default):
 * - SCALE_BENCH_ITEMS: jumlah item benchmark (default 50000)
 * - SCALE_BENCH_MV: rata-rata movement per item (default 20)
 * - SCALE_BENCH_LARGE_DOCS / SCALE_BENCH_LINES: dokumen raksasa (default 20 x 300)
 * - SCALE_BENCH_SEED: seed LCG deterministik (default 20260901)
 *
 * Kebijakan run ulang: OTOMATIS refresh — data benchmark run lama (sku BENCH-%)
 * dihapus chunked dulu, lalu generate ulang. Tidak menyentuh data non-benchmark.
 *
 * Beda vs StockDocumentSeeder: tanpa ::create per baris (insert batch + chunk),
 * tanpa usort global (sort per batch), tanpa CodeGenerator per dokumen
 * (counter in-PHP + upsert document_counters di akhir), tanpa rebuildForItem
 * per item (proyeksi via agregat SQL yang ekuivalen dengan StockLedger).
 */
class ScaleBenchmarkSeeder extends Seeder
{
    private const SKU_PREFIX = 'BENCH-';

    private const TYPE_PREFIX = [
        'Penerimaan' => 'BM',
        'Pengeluaran' => 'BK',
        'Stock Adjustment' => 'ADJ',
        'Transfer Gudang' => 'TF',
        'Stock Opname' => 'SO',
        'Retur Pembelian' => 'RP',
        'Retur Penjualan' => 'RJ',
    ];

    private const PICS = [
        'Agus Salim',
        'Bayu Pratama',
        'Dewi Lestari',
        'Nur Hidayat',
        'Rudi Hartono',
        'Siti Aminah',
    ];

    /** @var array<string, int> seq per "PREFIX/YEAR" */
    private array $seq = [];

    /** @var callable */
    private $rnd;

    /** @var callable */
    private $int;

    public function run(): void
    {
        $connection = DB::connection();
        $driver = (string) $connection->getDriverName();
        $name = (string) $connection->getDatabaseName();

        if (! self::isBenchmarkDatabase($driver, $name) || app()->environment('production')) {
            throw new \RuntimeException(
                'ScaleBenchmarkSeeder DITOLAK: hanya boleh jalan di database benchmark '
                .'(kelolagudang_bench, atau kelolagudang_test untuk kompatibilitas) via pgsql, '
                .'bukan production dan bukan database lain. Cara yang benar: '
                .'DB_CONNECTION=pgsql DB_DATABASE=kelolagudang_bench php artisan db:seed --class=ScaleBenchmarkSeeder. '
                ."Koneksi aktif saat ini: {$driver} / {$name}."
            );
        }

        $this->acquireSingleFlight();

        $started = microtime(true);
        $totalItems = max(100, (int) env('SCALE_BENCH_ITEMS', 50000));
        $mvPerItem = max(4, (int) env('SCALE_BENCH_MV', 20));
        $largeDocs = max(0, (int) env('SCALE_BENCH_LARGE_DOCS', 20));
        $largeLines = max(50, (int) env('SCALE_BENCH_LINES', 300));

        $state = (int) env('SCALE_BENCH_SEED', 20260901);
        $this->rnd = static function () use (&$state): float {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

            return $state / 4294967296.0;
        };
        $rnd = $this->rnd;
        $this->int = static function (int $min, int $max) use ($rnd): int {
            return (int) floor($rnd() * ($max - $min + 1)) + $min;
        };

        // ---- 0. Master dev-scale harus sudah ada (dipakai ulang, hemat waktu) ----
        $warehouses = DB::table('warehouses')->orderBy('id')->get(['id', 'name']);
        $bins = DB::table('bins')->orderBy('id')->get(['id', 'rack_id']);
        $racks = DB::table('racks')->orderBy('id')->get(['id', 'warehouse_id']);
        $suppliers = DB::table('suppliers')->orderBy('id')->get(['id', 'name']);
        $customers = DB::table('customers')->orderBy('id')->get(['id', 'name']);
        $departments = DB::table('departments')->orderBy('id')->get(['id', 'name']);
        $projects = DB::table('projects')->orderBy('id')->get(['id', 'name']);
        $categories = DB::table('categories')->orderBy('id')->get(['id']);
        $units = DB::table('units')->orderBy('id')->get(['id']);
        $merks = DB::table('merks')->orderBy('id')->get(['id']);

        if ($warehouses->isEmpty() || $bins->isEmpty() || $suppliers->isEmpty()) {
            throw new \RuntimeException(
                'ScaleBenchmarkSeeder butuh data master dulu. Jalankan: '
                .'DB_DATABASE=kelolagudang_bench php artisan migrate:fresh --seed, '
                .'lalu ulangi seeder benchmark ini.'
            );
        }

        $binWarehouse = [];
        foreach ($bins as $bin) {
            $rack = $racks->firstWhere('id', $bin->rack_id);
            $binWarehouse[$bin->id] = $rack ? (int) $rack->warehouse_id : (int) $warehouses[0]->id;
        }
        $binsByWarehouse = [];
        foreach ($bins as $bin) {
            $binsByWarehouse[$binWarehouse[$bin->id]][] = $bin;
        }

        // ---- 1. Refresh otomatis: hapus data benchmark run lama (chunked, urutan FK) ----
        $this->refreshBenchmarkData();

        // ---- 2. Nomor awal per prefix dari MAX eksisting (tetap unik global) ----
        $this->initSequences();

        // ---- 3. Items benchmark ----
        $this->command?->info("ScaleBenchmark: generate {$totalItems} item...");
        $catIds = $categories->pluck('id')->all();
        $unitIds = $units->pluck('id')->all();
        $merkIds = $merks->pluck('id')->all();
        $supIds = $suppliers->pluck('id')->all();
        $whIds = $warehouses->pluck('id')->all();
        $itemRows = [];
        $now = now()->toDateTimeString();
        $int = $this->int;

        for ($i = 1; $i <= $totalItems; $i++) {
            $whId = $whIds[($i - 1) % count($whIds)];
            $whBins = $binsByWarehouse[$whId];
            $bin = $whBins[($i - 1) % count($whBins)];
            $cost = $int(2000, 250000);
            $min = $int(2, 60);
            $itemRows[] = [
                'sku' => self::SKU_PREFIX.str_pad((string) $i, 5, '0', STR_PAD_LEFT),
                'barcode' => $this->ean13('899'.str_pad((string) (770000000 + $i), 9, '0', STR_PAD_LEFT)),
                'internal_barcode' => self::SKU_PREFIX.'IB-'.str_pad((string) $i, 5, '0', STR_PAD_LEFT),
                'name' => 'Barang Benchmark '.$i,
                'category_id' => $catIds[($i - 1) % count($catIds)],
                'brand_id' => $merkIds !== [] ? $merkIds[($i - 1) % count($merkIds)] : null,
                'unit_id' => $unitIds[($i - 1) % count($unitIds)],
                'preferred_supplier_id' => $supIds[($i - 1) % count($supIds)],
                'default_warehouse_id' => $whId,
                'default_rack_id' => $bin->rack_id,
                'default_bin_id' => $bin->id,
                'cost' => $cost,
                'price' => round($cost * 1.25, 2),
                'min_stock' => $min,
                'max_stock' => $min + $int(80, 4000),
                'lead_time' => $int(1, 21),
                'stock' => 0,
                'reserved' => 0,
                'status' => $i % 10 === 0 ? 'Nonaktif' : 'Aktif',
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($itemRows) >= 2000) {
                DB::table('items')->insert($itemRows);
                $itemRows = [];
            }
        }
        if ($itemRows !== []) {
            DB::table('items')->insert($itemRows);
            $itemRows = [];
        }

        // Saldo global per item (dijaga non-negatif seperti finalBalance seeder dev).
        $balance = [];
        $itemIds = DB::table('items')->where('sku', 'like', self::SKU_PREFIX.'%')->orderBy('id')->pluck('id');
        foreach ($itemIds as $id) {
            $balance[$id] = 0;
        }

        // ---- 4. Loop per batch: stream movement -> dokumen -> insert ----
        $ref = CarbonImmutable::parse('2026-09-01');
        $rangeStart = CarbonImmutable::parse('2025-09-01');
        $stats = ['docs' => 0, 'lines' => 0, 'movements' => 0];
        $batchSize = 1000;

        foreach (array_chunk($itemIds->all(), $batchSize) as $batchIdx => $batchIds) {
            $batchItems = DB::table('items')->whereIn('id', $batchIds)->orderBy('id')
                ->get(['id', 'cost', 'price', 'min_stock', 'status', 'default_warehouse_id', 'default_rack_id', 'default_bin_id', 'preferred_supplier_id']);
            $supMap = $suppliers->keyBy('id');
            $custList = $customers->all();
            $deptList = $departments->all();
            $projList = $projects->all();

            $movements = [];
            foreach ($batchItems as $item) {
                $this->streamItem(
                    $item, $mvPerItem, $ref, $rangeStart, $supMap,
                    $custList, $deptList, $projList, $movements, $balance
                );
            }

            usort($movements, fn ($a, $b) => $a['ts'] <=> $b['ts'] ?: $a['seq'] <=> $b['seq']);

            $documents = $this->groupDocuments($movements, $balance, true);

            // Deplete 20%: turunkan ke bucket Habis/Kritis/Menipis (umpan stock-minimum).
            $this->appendDeplete($batchItems, $balance, $ref, $custList, $documents);

            // Transfer 8%: stok cukup, pasangan OUT+IN.
            $this->appendTransfers($batchItems, $balance, $ref, $warehouses, $binsByWarehouse, $documents);

            $this->persistDocuments($documents, $balance, $stats);

            unset($movements, $documents, $batchItems);
            $this->command?->info('ScaleBenchmark: batch '.($batchIdx + 1).' ('.count($batchIds).' item, docs='.$stats['docs'].', mv='.$stats['movements'].')');
        }

        // ---- 5. Fase global: opname, large docs, non-posted, retur ----
        $this->appendOpnames($balance, $ref, $stats);
        $this->appendLargeDocs($balance, $ref, $largeDocs, $largeLines, $stats);
        $this->appendNonPosted($ref, $warehouses, $binsByWarehouse, $stats);
        $this->appendReturs($balance, $ref, $stats);

        // ---- 6. Finalisasi: counter, proyeksi SQL, verifikasi ----
        $this->flushCounters();
        $this->rebuildProjections();
        $this->verifyAndReport($started, $stats);

        // Lepas klaim otomatis? Tidak — klaim dilepas manual/eksekutor.
    }

    /**
     * Kunci advisory tetap untuk single-flight (lihat acquireSingleFlight).
     * Dipilih arbitrer dari rentang user-lock PG; dokumentasikan di sini agar
     * tak dipakai fitur lain.
     */
    private const ADVISORY_LOCK_KEY = 20260910;

    /**
     * Allowlist ketat: hanya database benchmark yang boleh ditulis.
     * `kelolagudang_bench` utama (dedicated, tak diperebutkan suite test);
     * `kelolagudang_test` diizinkan untuk kompatibilitas. Murni (tanpa DB)
     * agar bisa di-unit-test.
     */
    public static function isBenchmarkDatabase(string $driver, string $name): bool
    {
        return $driver === 'pgsql' && in_array($name, ['kelolagudang_bench', 'kelolagudang_test'], true);
    }

    /**
     * Single-flight: hanya satu run benchmark dalam satu waktu. Run kedua
     * abort alih-alih menumpuk refresh DELETE yang saling mengunci (pernah
     * macet 1 jam: 4 run paralel, 3 backend yatim). Non-blocking
     * (pg_try_advisory_lock); lock otomatis lepas saat sesi berakhir.
     * Catatan: sesi yatim yang koneksinya tak sadar putus tetap memegang
     * lock — bila abort ini muncul tanpa run aktif, terminasi backend yatim:
     * SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     * WHERE datname IN ('kelolagudang_bench','kelolagudang_test').
     */
    private function acquireSingleFlight(): void
    {
        $got = DB::selectOne('SELECT pg_try_advisory_lock(?) AS locked', [self::ADVISORY_LOCK_KEY]);

        if ($got === null || ! (bool) $got->locked) {
            throw new \RuntimeException(
                'ScaleBenchmarkSeeder DITOLAK: run benchmark lain sedang berjalan. '
                .'Tunggu sampai selesai (satu run penuh ~10 menit) alih-alih menjalankan paralel. '
                .'Bila tidak ada run aktif namun tetap ditolak, kemungkinan ada sesi yatim: '
                .'cek pg_stat_activity dan terminasi backend yatim.'
            );
        }
    }

    // ------------------------------------------------------------------
    // Refresh: hapus data benchmark run lama (chunked, urutan FK terbalik)
    // ------------------------------------------------------------------
    private function refreshBenchmarkData(): void
    {
        $benchIds = DB::table('items')->where('sku', 'like', self::SKU_PREFIX.'%')->pluck('id');
        if ($benchIds->isEmpty()) {
            return;
        }

        // Progres per tahap: fase refresh/finalisasi masing-masing hitungan
        // menit pada 1 jt baris — tanpa log ini terlihat macet (pernah
        // disalahartikan sebagai hang).
        $t0 = microtime(true);
        $info = fn (string $msg) => $this->command?->info(
            'ScaleBenchmark [refresh] '.$msg.' ('.round(microtime(true) - $t0, 1).' dtk)'
        );
        $info('hapus '.count($benchIds).' item lama: movements...');

        foreach (array_chunk($benchIds->all(), 5000) as $chunk) {
            DB::table('stock_movements')->whereIn('item_id', $chunk)->delete();
        }

        $docIds = [];
        foreach (array_chunk($benchIds->all(), 5000) as $chunk) {
            foreach (DB::table('stock_document_lines')->whereIn('item_id', $chunk)->distinct()->pluck('document_id') as $docId) {
                $docIds[$docId] = true;
            }
        }
        $info('movements terhapus; lines...');
        foreach (array_chunk($benchIds->all(), 5000) as $chunk) {
            DB::table('stock_document_lines')->whereIn('item_id', $chunk)->delete();
        }
        $info('lines terhapus; documents...');
        foreach (array_chunk(array_keys($docIds), 2000) as $chunk) {
            DB::table('stock_documents')->whereIn('id', $chunk)->delete();
        }
        $info('documents terhapus; item_stock + items...');
        foreach (array_chunk($benchIds->all(), 5000) as $chunk) {
            DB::table('item_stock')->whereIn('item_id', $chunk)->delete();
            DB::table('items')->whereIn('id', $chunk)->delete();
        }
        $info('refresh selesai.');
    }

    // ------------------------------------------------------------------
    // Nomor dokumen: counter in-PHP per PREFIX/YEAR dari MAX eksisting
    // ------------------------------------------------------------------
    private function initSequences(): void
    {
        $maxByKey = [];
        foreach (DB::table('stock_documents')->pluck('no') as $no) {
            if (is_string($no) && preg_match('/^(BM|BK|RP|RJ|ADJ|TF|SO)\/(\d{4})\/(\d+)$/', $no, $m)) {
                $key = $m[1].'/'.$m[2];
                $maxByKey[$key] = max($maxByKey[$key] ?? 0, (int) $m[3]);
            }
        }
        foreach (self::TYPE_PREFIX as $prefix) {
            foreach (['2025', '2026'] as $year) {
                $this->seq[$prefix.'/'.$year] = $maxByKey[$prefix.'/'.$year] ?? 0;
            }
        }
    }

    private function nextNo(string $type, string $date): string
    {
        $prefix = self::TYPE_PREFIX[$type];
        $year = substr($date, 0, 4);
        $key = $prefix.'/'.$year;
        $this->seq[$key] = ($this->seq[$key] ?? 0) + 1;

        return $prefix.'/'.$year.'/'.str_pad((string) $this->seq[$key], 5, '0', STR_PAD_LEFT);
    }

    private function flushCounters(): void
    {
        foreach ($this->seq as $key => $n) {
            if ($n <= 0) {
                continue;
            }
            // updateOrInsert tak bisa memakai DB::raw ber-referensi kolom saat
            // INSERT — dua langkah: pastikan baris ada, lalu naikkan bila kurang.
            DB::table('document_counters')->insertOrIgnore([
                'scope' => 'yearly',
                'counter_key' => $key,
                'current_number' => 0,
            ]);
            DB::table('document_counters')
                ->where('scope', 'yearly')
                ->where('counter_key', $key)
                ->where('current_number', '<', $n)
                ->update(['current_number' => $n]);
        }
    }

    // ------------------------------------------------------------------
    // Stream movement per item: kronologis, balance-guarded, LCG
    // ------------------------------------------------------------------
    /**
     * @param  array<int, array>  $out
     * @param  array<int, int>  $balance
     */
    private function streamItem(
        object $item,
        int $mvPerItem,
        CarbonImmutable $ref,
        CarbonImmutable $rangeStart,
        $supMap,
        array $custList,
        array $deptList,
        array $projList,
        array &$out,
        array &$balance,
    ): void {
        $int = $this->int;
        $rnd = $this->rnd;
        static $seq = 0;

        $n = $int((int) floor($mvPerItem / 2), (int) ceil($mvPerItem * 1.5));
        $offsets = [];
        for ($j = 0; $j < $n; $j++) {
            // 80% uniform 12 bulan, 20% ekor 30 hari (ref fixed 2026-09-01).
            $offsets[] = $rnd() < 0.8
                ? $int(0, 364)
                : $int(0, 30);
        }
        sort($offsets);

        $currentCost = (float) $item->cost;
        $bal = 0;
        $prevTs = null;
        $supName = $supMap->get($item->preferred_supplier_id)?->name ?? 'Supplier Benchmark';

        for ($j = $n - 1; $j >= 0; $j--) {
            $day = $ref->subDays($offsets[$j])->startOfDay();
            if ($day->lt($rangeStart)) {
                $day = $rangeStart;
            }

            // Retry TERBATAS: slot waktu hanya 660 kemungkinan/jam (07:00-17:59,
            // detik 0). Bila event sebelumnya 17:59:00 di hari yang sama, SEMUA
            // undian gagal selamanya -> infinite loop (pernah macet 98% CPU).
            // Fallback: geser ke 07:00 hari berikut — dijamin maju kronologis
            // ($prevTs < besok 07:00 selalu), pergeseran distribusi diabaikan.
            $date = $day->setTime($int(7, 17), $int(0, 59), 0);
            $tries = 0;
            while ($prevTs !== null && $date->lte($prevTs) && $tries < 200) {
                $date = $day->setTime($int(7, 17), $int(0, 59), 0);
                $tries++;
            }
            if ($prevTs !== null && $date->lte($prevTs)) {
                $date = $prevTs->addDay()->setTime(7, 0, 0);
            }
            $prevTs = $date;

            $roll = $rnd();
            $isIn = $bal <= 0 || $roll < 0.42 || ($roll >= 0.84 && $rnd() < 0.5);

            if ($isIn) {
                $qty = $int(20, 400);
                $currentCost = round($currentCost * (1 + $rnd() * 0.08), 2);
                $type = $roll >= 0.84 ? 'Stock Adjustment' : 'Penerimaan';
                $bal += $qty;
                $out[] = [
                    'seq' => $seq++,
                    'ts' => $date->toDateTimeString(),
                    'item_id' => $item->id,
                    'item_cost' => $item->cost,
                    'item_price' => $item->price,
                    'type' => $type,
                    'direction' => 'IN',
                    'qty' => $qty,
                    'unit_cost' => $currentCost,
                    'warehouse_id' => $item->default_warehouse_id,
                    'rack_id' => $item->default_rack_id,
                    'bin_id' => $this->nullBin($item->id) ? null : $item->default_bin_id,
                    'partner' => $type === 'Penerimaan' ? $supName : null,
                    'customer_id' => null,
                    'department_id' => null,
                    'project_id' => null,
                    'note' => $type === 'Stock Adjustment' ? 'Penyesuaian benchmark (lebih)' : 'Penerimaan benchmark',
                    'pic' => self::PICS[$int(0, 5)],
                ];
            } else {
                $qty = $int(1, min(120, $bal));
                $type = $roll >= 0.84 ? 'Stock Adjustment' : 'Pengeluaran';
                $bal -= $qty;
                $customerId = null;
                $departmentId = null;
                $projectId = null;
                if ($type === 'Pengeluaran' && $custList !== [] && $rnd() < 0.30) {
                    $cust = $custList[$int(0, count($custList) - 1)];
                    $partner = $cust->name;
                    $customerId = $cust->id;
                } elseif ($type === 'Pengeluaran' && $deptList !== [] && $rnd() < 0.45) {
                    $dept = $deptList[$int(0, count($deptList) - 1)];
                    $partner = $dept->name;
                    $departmentId = $dept->id;
                } elseif ($type === 'Pengeluaran' && $projList !== [] && $rnd() < 0.55) {
                    $proj = $projList[$int(0, count($projList) - 1)];
                    $partner = $proj->name;
                    $projectId = $proj->id;
                } else {
                    $partner = $type === 'Pengeluaran' ? 'Departemen Produksi Benchmark' : null;
                }
                $out[] = [
                    'seq' => $seq++,
                    'ts' => $date->toDateTimeString(),
                    'item_id' => $item->id,
                    'item_cost' => $item->cost,
                    'item_price' => $item->price,
                    'type' => $type,
                    'direction' => 'OUT',
                    'qty' => $qty,
                    'unit_cost' => $currentCost,
                    'warehouse_id' => $item->default_warehouse_id,
                    'rack_id' => $item->default_rack_id,
                    'bin_id' => $this->nullBin($item->id) ? null : $item->default_bin_id,
                    'partner' => $partner,
                    'customer_id' => $customerId,
                    'department_id' => $departmentId,
                    'project_id' => $projectId,
                    'note' => $type === 'Stock Adjustment' ? 'Penyesuaian benchmark (kurang)' : 'Pengeluaran benchmark',
                    'pic' => self::PICS[$int(0, 5)],
                ];
            }
        }

        $balance[$item->id] = $bal;
    }

    /** 2% item memakai bin NULL (jalur lantai) — deterministik dari id. */
    private function nullBin(int $itemId): bool
    {
        return $itemId % 50 === 0;
    }

    // ------------------------------------------------------------------
    // Group movement menjadi dokumen (per batch).
    //
    // Kunci group SENGAJA kasar — (bulan,type,wh,customer,dept,proyek) + cap
    // 50 baris — bukan per-hari/per-partner. Alasannya terukur: 20 movement
    // yang tersebar di 20 hari berbeda selalu membentuk 20 dokumen bila kunci
    // memakai hari (1 jt dokumen untuk 50rb item, insert berpuluh menit).
    // Dengan bucket bulan -> ~50-150rb dokumen untuk ~1 jt movement, sesuai
    // orde target roadmap (~50rb dokumen) namun movement tetap 1 jt (jalur
    // yang justru diuji Fase 2: fold valuation/mutasi).
    // Atribusi analitik tetap tepat: klasifikasi tujuan memakai FK
    // (customer/department/project, ada di kunci); partner header = modus
    // (hanya fallback name-match untuk Penerimaan). Tanggal dokumen = garis
    // pertama; occurred_at garis mengikuti tanggal dokumen (pola sama dengan
    // movementsFor produksi: occurred_at = document_date).
    // ------------------------------------------------------------------
    /**
     * @param  array<int, array>  $movements
     * @param  array<int, int>  $balance
     * @return array<int, array>
     */
    private function groupDocuments(array $movements, array &$balance, bool $posted): array
    {
        // Akumulasi per kunci PENUH dulu ( movement se-kunci tersebar di
        // sumbu waktu, greedy "open-doc" hanya menggabung yang berurutan ->
        // ~1 baris/dokumen), lalu pecah per kunci menjadi chunk ≤ cap.
        // Garis dalam satu chunk tetap terurut kronologis (append berurutan).
        $cap = 50;
        $byKey = [];
        $order = [];

        foreach ($movements as $m) {
            $k = substr($m['ts'], 0, 7).'|'.$m['type'].'|'.$m['warehouse_id']
                .'|'.($m['customer_id'] ?? '-').'|'.($m['department_id'] ?? '-').'|'.($m['project_id'] ?? '-');
            if (! isset($byKey[$k])) {
                $byKey[$k] = ['head' => $m, 'lines' => []];
                $order[] = $k;
            }
            $byKey[$k]['lines'][] = $m;
        }

        $documents = [];
        foreach ($order as $k) {
            $g = $byKey[$k];
            foreach (array_chunk($g['lines'], $cap) as $chunk) {
                $counts = [];
                foreach ($chunk as $ln) {
                    $pk = (string) ($ln['partner'] ?? '');
                    $counts[$pk] = ($counts[$pk] ?? 0) + 1;
                }
                arsort($counts);
                $first = $chunk[0];
                $documents[] = [
                    'type' => $g['head']['type'],
                    'day' => substr($first['ts'], 0, 10),
                    'ts' => $first['ts'],
                    'warehouse_id' => $g['head']['warehouse_id'],
                    'destination_warehouse_id' => null,
                    'partner' => array_key_first($counts),
                    'customer_id' => $g['head']['customer_id'],
                    'department_id' => $g['head']['department_id'],
                    'project_id' => $g['head']['project_id'],
                    'pic' => $first['pic'],
                    'note' => $first['note'],
                    'status' => $posted ? 'Selesai' : 'Draft',
                    'lines' => $chunk,
                ];
            }
            unset($byKey[$k]);
        }

        return $documents;
    }

    // ------------------------------------------------------------------
    // Deplete 20%: Pengeluaran ke bucket Habis/Kritis/Menipis
    // ------------------------------------------------------------------
    /**
     * @param  array<int, array>  $documents
     * @param  array<int, int>  $balance
     */
    private function appendDeplete($batchItems, array &$balance, CarbonImmutable $ref, array $custList, array &$documents): void
    {
        $int = $this->int;
        $rnd = $this->rnd;
        $ts = $ref->setTime(23, 57, 0)->toDateTimeString();
        $byWarehouse = [];

        foreach ($batchItems as $item) {
            $bal = (int) ($balance[$item->id] ?? 0);
            $min = (int) $item->min_stock;
            if ($bal <= $min || $rnd() >= 0.20) {
                continue;
            }

            $bucket = $rnd();
            if ($bucket < 0.10) {
                $target = 0;
            } elseif ($bucket < 0.35) {
                $target = max(1, (int) ceil($min * 0.2));
            } else {
                $target = $int(max(1, (int) ceil($min * 0.4)), max(1, $min));
            }

            $consumed = $bal - $target;
            if ($consumed < 1) {
                continue;
            }

            $balance[$item->id] = $target;
            $cust = $custList !== [] && $rnd() < 0.30 ? $custList[$int(0, count($custList) - 1)] : null;
            $byWarehouse[$item->default_warehouse_id][] = [
                'seq' => 0,
                'ts' => $ts,
                'item_id' => $item->id,
                'item_cost' => $item->cost,
                'item_price' => $item->price,
                'type' => 'Pengeluaran',
                'direction' => 'OUT',
                'qty' => $consumed,
                'unit_cost' => $item->cost,
                'warehouse_id' => $item->default_warehouse_id,
                'rack_id' => $item->default_rack_id,
                'bin_id' => $this->nullBin($item->id) ? null : $item->default_bin_id,
                'partner' => $cust?->name ?? 'Departemen Produksi Benchmark',
                'customer_id' => $cust?->id,
                'department_id' => null,
                'project_id' => null,
                'note' => 'Pemakaian benchmark (di bawah minimum)',
                'pic' => self::PICS[$int(0, 5)],
            ];
        }

        foreach ($byWarehouse as $whId => $lines) {
            foreach (array_chunk($lines, 40) as $group) {
                $first = $group[0];
                $documents[] = [
                    'type' => 'Pengeluaran',
                    'day' => substr($first['ts'], 0, 10),
                    'ts' => $first['ts'],
                    'warehouse_id' => $whId,
                    'destination_warehouse_id' => null,
                    'partner' => count($group) === 1 ? $first['partner'] : 'Departemen Produksi Benchmark',
                    'customer_id' => count($group) === 1 ? $first['customer_id'] : null,
                    'department_id' => null,
                    'project_id' => null,
                    'pic' => $first['pic'],
                    'note' => 'Pemakaian benchmark (di bawah minimum)',
                    'status' => 'Selesai',
                    'lines' => $group,
                ];
            }
        }
    }

    // ------------------------------------------------------------------
    // Transfer 8%: dokumen TF + pasangan OUT+IN (pairing saat persist)
    // ------------------------------------------------------------------
    /**
     * @param  array<int, array>  $documents
     * @param  array<int, int>  $balance
     */
    private function appendTransfers($batchItems, array &$balance, CarbonImmutable $ref, $warehouses, array $binsByWarehouse, array &$documents): void
    {
        $int = $this->int;
        $rnd = $this->rnd;
        $ts = $ref->setTime(23, 55, 0)->toDateTimeString();
        $whIds = $warehouses->pluck('id')->all();

        foreach ($batchItems as $item) {
            $bal = (int) ($balance[$item->id] ?? 0);
            if ($bal < 20 || $rnd() >= 0.08) {
                continue;
            }

            $destWh = $whIds[$int(0, count($whIds) - 1)];
            if ($destWh === (int) $item->default_warehouse_id) {
                $destWh = $whIds[((int) array_search($item->default_warehouse_id, $whIds, true) + 1) % count($whIds)];
            }
            $destBins = $binsByWarehouse[$destWh] ?? [];
            if ($destBins === []) {
                continue;
            }
            $destBin = $destBins[$int(0, count($destBins) - 1)];

            $qty = $int(2, min(15, (int) floor($bal * 0.6)));
            $documents[] = [
                'type' => 'Transfer Gudang',
                'day' => substr($ts, 0, 10),
                'ts' => $ts,
                'warehouse_id' => (int) $item->default_warehouse_id,
                'destination_warehouse_id' => (int) $destWh,
                'partner' => $warehouses->firstWhere('id', $destWh)?->name ?? 'Gudang Benchmark',
                'customer_id' => null,
                'department_id' => null,
                'project_id' => null,
                'pic' => self::PICS[$int(0, 5)],
                'note' => 'Transfer benchmark',
                'status' => 'Selesai',
                'lines' => [[
                    'ts' => $ts,
                    'item_id' => $item->id,
                    'item_cost' => $item->cost,
                    'item_price' => $item->price,
                    'qty' => $qty,
                    'unit_cost' => $item->cost,
                    'from_bin_id' => $this->nullBin($item->id) ? null : $item->default_bin_id,
                    'to_bin_id' => $destBin->id,
                    'to_warehouse_id' => (int) $destWh,
                    'to_rack_id' => $destBin->rack_id,
                    'transfer' => true,
                ]],
            ];
        }
    }

    // ------------------------------------------------------------------
    // Persist: docs -> lines -> movements (chunked), pairing transfer
    // ------------------------------------------------------------------
    /**
     * @param  array<int, array>  $documents
     * @param  array<int, int>  $balance
     * @param  array<string, int>  $stats
     */
    private function persistDocuments(array &$documents, array &$balance, array &$stats): void
    {
        if ($documents === []) {
            return;
        }

        // Satu transaksi per panggilan: gagal di tengah = rollback total,
        // tanpa dokumen yatim tanpa garis (refresh hanya mengenal dokumen
        // yang garisnya merujuk item benchmark).
        DB::transaction(function () use (&$documents, &$balance, &$stats) {
            $this->persistDocumentsInner($documents, $balance, $stats);
        });
    }

    /**
     * @param  array<int, array>  $documents
     * @param  array<int, int>  $balance
     * @param  array<string, int>  $stats
     */
    private function persistDocumentsInner(array &$documents, array &$balance, array &$stats): void
    {
        $now = now()->toDateTimeString();
        $docRows = [];
        $docKeys = [];

        foreach ($documents as $di => $def) {
            $no = $this->nextNo($def['type'], $def['ts']);
            $posted = ($def['status'] ?? 'Selesai') === 'Selesai';
            $docRows[] = [
                'no' => $no,
                'type' => $def['type'],
                'status' => $def['status'] ?? 'Selesai',
                'document_date' => $def['ts'],
                'warehouse_id' => $def['warehouse_id'],
                'destination_warehouse_id' => $def['destination_warehouse_id'] ?? null,
                'customer_id' => $def['customer_id'] ?? null,
                'department_id' => $def['department_id'] ?? null,
                'project_id' => $def['project_id'] ?? null,
                'partner' => $def['partner'],
                'reference_no' => $def['type'] === 'Penerimaan' ? 'PO-BENCH-'.$no : ($def['type'] === 'Pengeluaran' ? 'SPK-BENCH-'.$no : null),
                'pic' => $def['pic'],
                'note' => $def['note'],
                'posted_at' => $posted ? $def['ts'] : null,
                'source_document_id' => $def['source_document_id'] ?? null,
                'frozen_at' => $def['type'] === 'Stock Opname' ? $def['ts'] : null,
                'submitted_at' => ($def['status'] ?? null) === 'Menunggu Approval' ? $def['ts'] : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $docKeys[] = $no;
            $documents[$di]['_no'] = $no;
        }

        foreach (array_chunk($docRows, 500) as $chunk) {
            DB::table('stock_documents')->insert($chunk);
        }
        $stats['docs'] += count($docRows);

        $docIdByNo = DB::table('stock_documents')->whereIn('no', $docKeys)->pluck('id', 'no');

        $lineRows = [];
        $moveRows = [];
        $transferPairs = [];

        foreach ($documents as $di => $def) {
            $docId = $docIdByNo[$def['_no']] ?? null;
            if ($docId === null) {
                continue;
            }
            $documents[$di]['_id'] = $docId;
            $posted = ($def['status'] ?? 'Selesai') === 'Selesai';

            foreach (array_values($def['lines']) as $idx => $line) {
                $lineNo = $idx + 1;
                $isTransfer = ($line['transfer'] ?? false) === true;

                if ($isTransfer) {
                    // Key HARUS seragam dengan baris non-transfer (insert batch
                    // menolak VALUES beda panjang) — null untuk yang tak relevan.
                    $lineRows[] = [
                        'document_id' => $docId,
                        'line_no' => $lineNo,
                        'item_id' => $line['item_id'],
                        'qty' => -abs($line['qty']),
                        'system_qty' => null,
                        'actual_qty' => null,
                        'from_bin_id' => $line['from_bin_id'] ?? null,
                        'to_bin_id' => $line['to_bin_id'] ?? null,
                        'source_line_id' => null,
                        'unit_cost' => $line['unit_cost'] ?? 0,
                        'unit_price' => null,
                        'reason_code' => $line['reason_code'] ?? null,
                        'note' => $def['note'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];

                    $moveRows[] = $this->moveRow($docId, $def, $lineNo, $line, 'OUT', abs($line['qty']), (int) $def['warehouse_id'], $line['from_bin_id'] ?? null, $now);
                    $moveRows[] = $this->moveRow($docId, $def, $lineNo, $line, 'IN', abs($line['qty']), (int) $line['to_warehouse_id'], $line['to_bin_id'] ?? null, $now, $line['to_rack_id'] ?? null);
                    $transferPairs[] = [$docId, $lineNo];
                    $stats['movements'] += 2;
                    $stats['lines']++;

                    continue;
                }

                $qty = $line['qty'] ?? null;
                $direction = $line['direction'] ?? (($qty ?? 0) >= 0 ? 'IN' : 'OUT');
                $lineRows[] = [
                    'document_id' => $docId,
                    'line_no' => $lineNo,
                    'item_id' => $line['item_id'],
                    'qty' => $qty,
                    'system_qty' => $line['system_qty'] ?? null,
                    'actual_qty' => $line['actual_qty'] ?? null,
                    'from_bin_id' => $line['from_bin_id'] ?? $line['bin_id'] ?? null,
                    'to_bin_id' => $line['to_bin_id'] ?? null,
                    'source_line_id' => $line['source_line_id'] ?? null,
                    'unit_cost' => $line['unit_cost'] ?? 0,
                    'unit_price' => $def['type'] === 'Pengeluaran' ? (float) ($line['item_price'] ?? 0) : null,
                    'reason_code' => $line['reason_code'] ?? null,
                    'note' => $line['note'] ?? $def['note'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
                $stats['lines']++;

                if (! $posted) {
                    continue;
                }

                $moveQty = $qty !== null ? abs($qty) : (int) ($line['delta'] ?? 0);
                if ($moveQty === 0) {
                    continue;
                }

                $moveRows[] = $this->moveRow(
                    $docId, $def, $lineNo, $line, $direction, $moveQty,
                    (int) ($line['warehouse_id'] ?? $def['warehouse_id']),
                    $line['from_bin_id'] ?? $line['bin_id'] ?? null,
                    $now
                );
                $stats['movements']++;
            }
        }

        foreach (array_chunk($lineRows, 1000) as $chunk) {
            DB::table('stock_document_lines')->insert($chunk);
        }
        foreach (array_chunk($moveRows, 2000) as $chunk) {
            DB::table('stock_movements')->insert($chunk);
        }

        // Pairing transfer: OUT <-> IN via (doc, line_no, direction).
        foreach (array_chunk($transferPairs, 500) as $chunk) {
            $docIds = array_unique(array_column($chunk, 0));
            $rows = DB::table('stock_movements')
                ->whereIn('stock_document_id', $docIds)
                ->where('movement_type', 'Transfer Gudang')
                ->get(['id', 'stock_document_id', 'line_no', 'direction']);
            $byKey = [];
            foreach ($rows as $r) {
                $byKey[$r->stock_document_id.':'.$r->line_no.':'.$r->direction] = $r->id;
            }
            foreach ($chunk as [$docId, $lineNo]) {
                $outId = $byKey[$docId.':'.$lineNo.':OUT'] ?? null;
                $inId = $byKey[$docId.':'.$lineNo.':IN'] ?? null;
                if ($outId && $inId) {
                    DB::table('stock_movements')->where('id', $outId)->update(['pair_id' => $inId]);
                    DB::table('stock_movements')->where('id', $inId)->update(['pair_id' => $outId]);
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $def
     * @param  array<string, mixed>  $line
     */
    private function moveRow(
        int $docId,
        array $def,
        int $lineNo,
        array $line,
        string $direction,
        int $qty,
        int $warehouseId,
        $binId,
        string $now,
        $rackId = null,
    ): array {
        return [
            'item_id' => $line['item_id'],
            'warehouse_id' => $warehouseId,
            'rack_id' => $rackId ?? $line['rack_id'] ?? null,
            'bin_id' => $binId,
            'direction' => $direction,
            'qty' => $qty,
            'movement_type' => $def['type'],
            'reference_no' => $def['_no'],
            'partner' => $def['partner'],
            'unit_cost' => round((float) ($line['unit_cost'] ?? 0), 2),
            'pic' => $def['pic'],
            'note' => $def['note'],
            'occurred_at' => $def['ts'],
            'created_at' => $def['ts'],
            'updated_at' => $now,
            'stock_document_id' => $docId,
            'line_no' => $lineNo,
        ];
    }

    // ------------------------------------------------------------------
    // Fase global: opname (SO Selesai 0-movement + ADJ Draft turunan)
    // ------------------------------------------------------------------
    /**
     * @param  array<int, int>  $balance
     * @param  array<string, int>  $stats
     */
    private function appendOpnames(array &$balance, CarbonImmutable $ref, array &$stats): void
    {
        $int = $this->int;
        $rnd = $this->rnd;
        $ts = $ref->setTime(12, 0, 0)->toDateTimeString();

        $candidates = [];
        foreach ($balance as $itemId => $bal) {
            if ($bal > 0 && $rnd() < 0.02 && count($candidates) < 2000) {
                $candidates[] = $itemId;
            }
        }
        if ($candidates === []) {
            return;
        }

        $meta = DB::table('items')->whereIn('id', $candidates)
            ->get(['id', 'cost', 'default_warehouse_id', 'default_bin_id']);
        $byWarehouse = [];
        foreach ($meta as $m) {
            $byWarehouse[$m->default_warehouse_id][] = $m;
        }

        $documents = [];
        foreach ($byWarehouse as $whId => $items) {
            // SATU dokumen opname per gudang per hari (batas
            // stock_documents_opname_daily_uniq) — seluruh garis masuk satu
            // dokumen; ratusan baris/dokumen justru ideal untuk benchmark
            // guard opname Fase 2.4.
            $lines = [];
            foreach ($items as $m) {
                $system = (int) ($balance[$m->id] ?? 0);
                $delta = $rnd() < 0.7 ? $int(1, max(1, (int) ceil($system * 0.2))) * ($rnd() < 0.5 ? -1 : 1) : 0;
                $delta = max(-$system, $delta);
                $lines[] = [
                    'ts' => $ts,
                    'item_id' => $m->id,
                    'item_cost' => $m->cost,
                    'system_qty' => $system,
                    'actual_qty' => $system + $delta,
                    'delta' => $delta,
                    'unit_cost' => $m->cost,
                    'from_bin_id' => $m->default_bin_id,
                    'direction' => $delta > 0 ? 'IN' : ($delta < 0 ? 'OUT' : null),
                    'reason_code' => $delta !== 0 ? 'Selisih Opname Benchmark' : null,
                ];
            }
            if ($lines === []) {
                continue;
            }
            $documents[] = [
                'type' => 'Stock Opname',
                'day' => substr($ts, 0, 10),
                'ts' => $ts,
                'warehouse_id' => (int) $whId,
                'partner' => null,
                'pic' => self::PICS[$int(0, 5)],
                'note' => 'Opname benchmark',
                'status' => 'Selesai',
                'lines' => $lines,
            ];

            // ADJ Draft turunan (emulasi postOpname: 0 posting langsung).
            $adjLines = [];
            foreach ($lines as $ln) {
                if (($ln['delta'] ?? 0) === 0) {
                    continue;
                }
                $adjLines[] = [
                    'ts' => $ts,
                    'item_id' => $ln['item_id'],
                    'item_cost' => $ln['item_cost'],
                    'qty' => $ln['delta'],
                    'unit_cost' => $ln['unit_cost'],
                    'from_bin_id' => $ln['from_bin_id'],
                    'to_bin_id' => $ln['delta'] > 0 ? $ln['from_bin_id'] : null,
                    'direction' => $ln['delta'] > 0 ? 'IN' : 'OUT',
                    'reason_code' => $ln['reason_code'],
                    'note' => 'Koreksi opname benchmark',
                ];
            }
            if ($adjLines !== []) {
                $documents[] = [
                    'type' => 'Stock Adjustment',
                    'day' => substr($ts, 0, 10),
                    'ts' => $ts,
                    'warehouse_id' => (int) $whId,
                    'partner' => null,
                    'pic' => self::PICS[$int(0, 5)],
                    'note' => 'Koreksi opname benchmark (draft)',
                    'status' => 'Draft',
                    'lines' => $adjLines,
                ];
            }
        }

        $this->persistDocuments($documents, $balance, $stats);
    }

    // ------------------------------------------------------------------
    // Fase global: dokumen raksasa (uji validasi 200+ baris Fase 3.1)
    // ------------------------------------------------------------------
    /**
     * @param  array<int, int>  $balance
     * @param  array<string, int>  $stats
     */
    private function appendLargeDocs(array &$balance, CarbonImmutable $ref, int $docCount, int $linesPerDoc, array &$stats): void
    {
        if ($docCount <= 0) {
            return;
        }

        $int = $this->int;
        $ts = $ref->setTime(10, 0, 0)->toDateTimeString();
        $pool = [];
        foreach ($balance as $itemId => $bal) {
            if ($bal > 50) {
                $pool[] = $itemId;
            }
        }
        if ($pool === []) {
            return;
        }

        $meta = DB::table('items')->whereIn('id', $pool)->get(['id', 'cost', 'price', 'default_warehouse_id', 'default_bin_id']);
        $metaById = [];
        foreach ($meta as $m) {
            $metaById[$m->id] = $m;
        }

        $cursor = 0;
        $documents = [];
        for ($d = 0; $d < $docCount; $d++) {
            $lines = [];
            for ($l = 0; $l < $linesPerDoc; $l++) {
                $itemId = $pool[$cursor % count($pool)];
                $cursor++;
                if (($balance[$itemId] ?? 0) < 2) {
                    continue;
                }
                $m = $metaById[$itemId];
                $qty = $int(1, 3);
                $balance[$itemId] -= $qty;
                $lines[] = [
                    'ts' => $ts,
                    'item_id' => $itemId,
                    'item_cost' => $m->cost,
                    'item_price' => $m->price,
                    'type' => 'Pengeluaran',
                    'direction' => 'OUT',
                    'qty' => $qty,
                    'unit_cost' => $m->cost,
                    'warehouse_id' => $m->default_warehouse_id,
                    'bin_id' => $m->default_bin_id,
                    'partner' => 'Departemen Produksi Benchmark',
                    'note' => 'Baris dokumen raksasa benchmark',
                    'pic' => self::PICS[$int(0, 5)],
                ];
            }
            if ($lines === []) {
                continue;
            }
            $first = $lines[0];
            $documents[] = [
                'type' => 'Pengeluaran',
                'day' => substr($ts, 0, 10),
                'ts' => $ts,
                'warehouse_id' => (int) $first['warehouse_id'],
                'partner' => 'Departemen Produksi Benchmark',
                'pic' => $first['pic'],
                'note' => 'Dokumen raksasa benchmark',
                'status' => 'Selesai',
                'lines' => $lines,
            ];
        }

        $this->persistDocuments($documents, $balance, $stats);
    }

    // ------------------------------------------------------------------
    // Fase global: dokumen belum posting (umpan posting benchmark + dashboard)
    // ------------------------------------------------------------------
    /**
     * @param  array<string, int>  $stats
     */
    private function appendNonPosted(CarbonImmutable $ref, $warehouses, array $binsByWarehouse, array &$stats): void
    {
        $int = $this->int;
        $rnd = $this->rnd;
        $ts = $ref->subDays(5)->setTime(9, 0, 0)->toDateTimeString();
        $types = ['Penerimaan', 'Pengeluaran', 'Stock Adjustment', 'Transfer Gudang'];

        $benchIds = DB::table('items')->where('sku', 'like', self::SKU_PREFIX.'%')->orderBy('id')->pluck('id');
        if ($benchIds->isEmpty()) {
            return;
        }

        $documents = [];
        for ($k = 0; $k < 200; $k++) {
            $type = $types[$int(0, 3)];
            $whId = $warehouses[$int(0, count($warehouses) - 1)]->id;
            $itemId = $benchIds[$int(0, count($benchIds) - 1)];
            $m = DB::table('items')->where('id', $itemId)->first(['id', 'cost', 'price', 'default_bin_id']);
            $signed = match ($type) {
                'Penerimaan' => 1,
                'Pengeluaran' => -1,
                'Stock Adjustment' => $rnd() < 0.5 ? -1 : 1,
                default => -1,
            };
            $status = $type === 'Stock Adjustment'
                ? ['Draft', 'Menunggu Approval', 'Dibatalkan'][$int(0, 2)]
                : ['Draft', 'Dibatalkan'][$int(0, 1)];

            $lineCount = $int(1, 3);
            $lines = [];
            for ($i = 0; $i < $lineCount; $i++) {
                $lines[] = [
                    'ts' => $ts,
                    'item_id' => $m->id,
                    'item_cost' => $m->cost,
                    'item_price' => $m->price,
                    'qty' => $signed * $int(1, 50),
                    'unit_cost' => $m->cost,
                    'from_bin_id' => $m->default_bin_id,
                    'reason_code' => $type === 'Stock Adjustment' ? 'Koreksi Benchmark' : null,
                    'note' => 'Dokumen benchmark belum diposting',
                ];
            }

            $documents[] = [
                'type' => $type,
                'day' => substr($ts, 0, 10),
                'ts' => $ts,
                'warehouse_id' => (int) $whId,
                'destination_warehouse_id' => $type === 'Transfer Gudang' ? (int) $warehouses->reject(fn ($w) => (int) $w->id === (int) $whId)->values()[0]->id : null,
                'partner' => $type === 'Penerimaan' ? 'Supplier Benchmark' : ($type === 'Pengeluaran' ? 'Departemen Produksi Benchmark' : null),
                'pic' => self::PICS[$int(0, 5)],
                'note' => 'Dokumen benchmark belum diposting',
                'status' => $status,
                'lines' => $lines,
            ];
        }

        // NB: persistDocuments mengelompokkan per $documents apa adanya (tanpa
        // regrouping) — setiap entri di atas sudah satu dokumen.
        $flat = [];
        foreach ($documents as $def) {
            $flat[] = $def;
        }
        $balance = [];
        $this->persistDocuments($flat, $balance, $stats);
    }

    // ------------------------------------------------------------------
    // Fase global: retur ber-link (RP -> BM, RJ -> BK, cap sisa qty)
    // ------------------------------------------------------------------
    /**
     * @param  array<int, int>  $balance
     * @param  array<string, int>  $stats
     */
    private function appendReturs(array &$balance, CarbonImmutable $ref, array &$stats): void
    {
        $int = $this->int;
        $ts = $ref->setTime(15, 0, 0)->toDateTimeString();
        $documents = [];

        foreach (['Penerimaan' => 'Retur Pembelian', 'Pengeluaran' => 'Retur Penjualan'] as $srcType => $retType) {
            // WAJIB hanya dari garis benchmark (sku BENCH-%): sumber dev-seed
            // akan membuat dokumen retur yatim yang tak bisa dibersihkan refresh.
            $srcLines = DB::table('stock_document_lines as l')
                ->join('stock_documents as d', 'd.id', '=', 'l.document_id')
                ->join('items as i', 'i.id', '=', 'l.item_id')
                ->where('d.type', $srcType)
                ->where('d.status', 'Selesai')
                ->where('i.sku', 'like', self::SKU_PREFIX.'%')
                ->where('l.qty', '>', 0)
                ->orderBy('l.id')
                ->limit(1500)
                ->get(['l.id as line_id', 'l.document_id', 'l.item_id', 'l.qty', 'l.unit_cost', 'd.warehouse_id', 'd.partner']);

            $consumed = [];
            $groups = [];
            $current = [];
            foreach ($srcLines as $src) {
                $remaining = abs((int) $src->qty) - ($consumed[$src->line_id] ?? 0);
                if ($remaining < 1) {
                    continue;
                }
                $qty = min($remaining, $int(1, 5));
                $consumed[$src->line_id] = ($consumed[$src->line_id] ?? 0) + $qty;

                $current[] = [
                    'ts' => $ts,
                    'item_id' => $src->item_id,
                    'qty' => $retType === 'Retur Pembelian' ? -$qty : $qty,
                    'unit_cost' => $src->unit_cost,
                    'from_bin_id' => null,
                    'to_bin_id' => null,
                    'source_line_id' => $src->line_id,
                    'source_doc' => $src->document_id,
                    'direction' => $retType === 'Retur Pembelian' ? 'OUT' : 'IN',
                    'warehouse_id' => $src->warehouse_id,
                    'note' => 'Retur benchmark ber-link sumber',
                ];

                if (count($current) >= 20) {
                    $groups[] = $current;
                    $current = [];
                }
            }
            if ($current !== []) {
                $groups[] = $current;
            }

            foreach ($groups as $group) {
                $first = $group[0];
                $srcDocId = $first['source_doc'];
                $documents[] = [
                    'type' => $retType,
                    'day' => substr($ts, 0, 10),
                    'ts' => $ts,
                    'warehouse_id' => (int) $first['warehouse_id'],
                    'partner' => $retType === 'Retur Pembelian' ? 'Supplier Benchmark' : 'Customer Benchmark',
                    'pic' => self::PICS[$int(0, 5)],
                    'note' => 'Alasan: retur benchmark',
                    'status' => 'Selesai',
                    'source_document_id' => $srcDocId,
                    'lines' => $group,
                ];

                foreach ($group as $ln) {
                    $balance[$ln['item_id']] = ($balance[$ln['item_id']] ?? 0)
                        + ($retType === 'Retur Pembelian' ? -$ln['qty'] * -1 : $ln['qty']);
                }
            }
        }

        $this->persistDocuments($documents, $balance, $stats);
    }

    // ------------------------------------------------------------------
    // Finalisasi: counter, proyeksi SQL (ekuivalen StockLedger), verifikasi
    // ------------------------------------------------------------------
    private function rebuildProjections(): void
    {
        $like = self::SKU_PREFIX.'%';
        $t0 = microtime(true);
        $info = fn (string $msg) => $this->command?->info(
            'ScaleBenchmark [finalisasi] '.$msg.' ('.round(microtime(true) - $t0, 1).' dtk)'
        );
        $info('bangun ulang item_stock via agregat SQL...');

        DB::table('item_stock')->whereIn('item_id', function ($q) use ($like) {
            $q->select('id')->from('items')->where('sku', 'like', $like);
        })->delete();

        // Stok = net per lokasi (generator menjaga non-negatif, GREATEST
        // sekadar pengaman), unit_cost_avg = rata-rata IN saja — persis rumus
        // StockLedger::rebuildForItem (OUT tidak memengaruhi basis avg).
        DB::insert(
            "INSERT INTO item_stock (item_id, warehouse_id, bin_id, stock, reserved, unit_cost_avg, updated_at)
             SELECT m.item_id, m.warehouse_id, m.bin_id,
                    GREATEST(0, SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END)),
                    0,
                    SUM(CASE WHEN m.direction = 'IN' THEN m.qty * m.unit_cost ELSE 0 END)
                      / NULLIF(SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE 0 END), 0),
                    NOW()
             FROM stock_movements m
             JOIN items i ON i.id = m.item_id
             WHERE i.sku LIKE ?
             GROUP BY m.item_id, m.warehouse_id, m.bin_id",
            [$like]
        );

        // Reserved ringan: tiap baris ke-7 non-kosong menahan 5% (umpan available).
        $info('item_stock selesai; reserved ringan...');
        DB::update(
            'UPDATE item_stock SET reserved = FLOOR(stock * 0.05)
             WHERE item_id IN (SELECT id FROM items WHERE sku LIKE ?)
               AND stock > 0 AND (item_id % 7 = 0)',
            [$like]
        );

        $info('reserved selesai; rollup items...');
        DB::update(
            'UPDATE items SET stock = COALESCE(s.stock, 0), reserved = COALESCE(s.reserved, 0), updated_at = NOW()
             FROM (SELECT item_id, SUM(stock) AS stock, SUM(reserved) AS reserved
                   FROM item_stock GROUP BY item_id) s
             WHERE items.id = s.item_id AND items.sku LIKE ?',
            [$like]
        );
        $info('finalisasi selesai.');
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function verifyAndReport(float $started, array $stats): void
    {
        $like = self::SKU_PREFIX.'%';
        $items = (int) DB::table('items')->where('sku', 'like', $like)->count();
        $docs = (int) DB::table('stock_documents as d')
            ->join('stock_document_lines as l', 'l.document_id', '=', 'd.id')
            ->join('items as i', 'i.id', '=', 'l.item_id')
            ->where('i.sku', 'like', $like)
            ->distinct()->count('d.id');
        $movements = (int) DB::table('stock_movements as m')
            ->join('items as i', 'i.id', '=', 'm.item_id')
            ->where('i.sku', 'like', $like)->count();

        // Rekonsiliasi sampel: net movement vs item_stock per lokasi harus 0 selisih.
        $mismatch = (int) DB::selectOne(
            "SELECT COUNT(*) AS c FROM (
               SELECT m.item_id, m.warehouse_id, m.bin_id,
                      GREATEST(0, SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END)) AS expect,
                      s.stock AS actual
               FROM stock_movements m
               JOIN items i ON i.id = m.item_id
               JOIN item_stock s ON s.item_id = m.item_id
                 AND s.warehouse_id = m.warehouse_id
                 AND (s.bin_id IS NOT DISTINCT FROM m.bin_id)
               WHERE i.sku LIKE ?
               GROUP BY m.item_id, m.warehouse_id, m.bin_id, s.stock
             ) t WHERE t.expect <> t.actual",
            [$like]
        )->c;

        $elapsed = round(microtime(true) - $started, 1);
        $this->command?->info(
            "ScaleBenchmark SELESAI dalam {$elapsed} dtk: item={$items}, dokumen~={$docs}, "
            ."lines={$stats['lines']}, movements~={$movements} (stream={$stats['movements']}), "
            .'mismatch_rekonsiliasi='.$mismatch
        );

        if ($mismatch !== 0) {
            throw new \RuntimeException("Rekonsiliasi ledger gagal: {$mismatch} lokasi selisih.");
        }
    }

    /** EAN-13 checksum untuk barcode deterministik yang unik. */
    private function ean13(string $prefix12): string
    {
        $digits = substr(preg_replace('/\D/', '', $prefix12), 0, 12);
        $digits = str_pad($digits, 12, '0', STR_PAD_LEFT);
        $sum = 0;
        for ($i = 0; $i < 12; $i++) {
            $sum += ((int) $digits[$i]) * ($i % 2 === 0 ? 1 : 3);
        }

        return $digits.((10 - ($sum % 10)) % 10);
    }
}
