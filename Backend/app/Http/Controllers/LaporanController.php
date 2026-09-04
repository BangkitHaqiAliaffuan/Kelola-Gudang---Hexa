<?php

namespace App\Http\Controllers;

use App\Http\Requests\LaporanKeluarAnalyticsRequest;
use App\Http\Requests\LaporanMutasiRequest;
use App\Http\Resources\LaporanMutasiResource;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Project;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\WorkOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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

        $items = $items->map(function (Item $item) use ($movements, $from, $to) {
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

    /**
     * Analitik Barang Keluar (Pengeluaran) per tujuan per bulan.
     *
     * Tujuan = Customer | Departemen | Proyek, sejalan dengan dropdown Tujuan
     * di form Barang Keluar. Resolusi identitas (tie-break):
     * customer_id → department_id → project_id → cocok nama departemen →
     * cocok nama proyek → lainnya. Angka keputusan hanya dari dokumen Selesai
     * (sudah posting); dokumen belum posting masuk seksi `proses` (tertahan).
     * Semua "nilai" adalah nilai pokok persediaan (qty × unit_cost), BUKAN revenue.
     */
    public function keluarAnalytics(LaporanKeluarAnalyticsRequest $request): JsonResponse
    {
        $data = $request->validated();

        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $atRiskDays = (int) ($data['at_risk_days'] ?? 90);
        $band = (float) ($data['variance_band'] ?? 5);

        $deptMap = Department::query()->pluck('id', 'name')
            ->mapWithKeys(fn ($id, $name) => [mb_strtolower(trim((string) $name)) => ['id' => $id, 'name' => $name]]);
        $projMap = Project::query()->pluck('id', 'name')
            ->mapWithKeys(fn ($id, $name) => [mb_strtolower(trim((string) $name)) => ['id' => $id, 'name' => $name]]);

        // Klasifikasi satu dokumen menjadi identitas tujuan teresolusi.
        $classify = function (StockDocument $d) use ($deptMap, $projMap): array {
            if ($d->customer_id) {
                return ['jenis' => 'customer', 'id' => (int) $d->customer_id, 'nama' => $d->customer?->name ?? $d->partner ?? '—', 'segmen' => $d->customer?->segment];
            }
            if ($d->department_id) {
                return ['jenis' => 'departemen', 'id' => (int) $d->department_id, 'nama' => $d->department?->name ?? $d->partner ?? '—', 'segmen' => null];
            }
            if ($d->project_id) {
                return ['jenis' => 'proyek', 'id' => (int) $d->project_id, 'nama' => $d->project?->name ?? $d->partner ?? '—', 'segmen' => null];
            }
            $key = mb_strtolower(trim((string) $d->partner));
            if ($key !== '' && isset($deptMap[$key])) {
                return ['jenis' => 'departemen', 'id' => (int) $deptMap[$key]['id'], 'nama' => $deptMap[$key]['name'], 'segmen' => null];
            }
            if ($key !== '' && isset($projMap[$key])) {
                return ['jenis' => 'proyek', 'id' => (int) $projMap[$key]['id'], 'nama' => $projMap[$key]['name'], 'segmen' => null];
            }

            return ['jenis' => 'lainnya', 'id' => null, 'nama' => $d->partner ?? '—', 'segmen' => null];
        };
        $tujuanKey = fn (array $t): string => $t['jenis'].'|'.($t['id'] ?? 'null').'|'.$t['nama'];

        $baseDocs = StockDocument::query()
            ->with(['customer', 'department', 'project'])
            ->withSum('lines as qty_total', 'qty')
            ->withSum('lines as value_total', DB::raw('qty * unit_cost'))
            ->withSum('lines as revenue_total', DB::raw('qty * unit_price'))
            ->where('type', 'Pengeluaran')
            ->whereBetween('document_date', [$from, $to])
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when(isset($data['customer_id']), fn ($q) => $q->where('customer_id', $data['customer_id']))
            ->when(isset($data['department_id']), fn ($q) => $q->where('department_id', $data['department_id']))
            ->when(isset($data['project_id']), fn ($q) => $q->where('project_id', $data['project_id']))
            ->orderBy('document_date')
            ->get()
            ->each(fn (StockDocument $d) => $d->setAttribute('_tujuan', $classify($d)));

        if (isset($data['jenis_tujuan'])) {
            $baseDocs = $baseDocs->filter(fn (StockDocument $d) => $d->getAttribute('_tujuan')['jenis'] === $data['jenis_tujuan'])->values();
        }

        $posted = $baseDocs->where('status', 'Selesai')->values();
        $tertahan = $baseDocs->whereIn('status', ['Draft', 'Menunggu Approval', 'Dalam Perjalanan'])->values();

        $absQty = fn (StockDocument $d): int => abs((int) ($d->qty_total ?? 0));
        $absNilai = fn (StockDocument $d): float => round(abs((float) ($d->value_total ?? 0)), 2);
        // Omzet = harga jual × qty (null bila baris tanpa harga jual).
        $absOmzet = fn (StockDocument $d): ?float => $d->revenue_total !== null ? round(abs((float) $d->revenue_total), 2) : null;

        // ---- Ringkasan + MoM (dekomposisi volume vs rata-rata nilai) ----
        $totalNilai = round($posted->sum($absNilai), 2);
        $totalQty = $posted->sum($absQty);
        $perBulan = [];
        foreach ($posted as $d) {
            /** @var Carbon $tgl */
            $tgl = $d->document_date;
            $key = $tgl->format('Y-m');
            $perBulan[$key] ??= ['bulan' => $key, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $perBulan[$key]['qty'] += $absQty($d);
            $perBulan[$key]['nilai'] = round($perBulan[$key]['nilai'] + $absNilai($d), 2);
            $perBulan[$key]['dokumen']++;
        }
        ksort($perBulan);
        $perBulan = array_values($perBulan);
        $mom = null;
        if (count($perBulan) >= 2) {
            $last = $perBulan[count($perBulan) - 1];
            $prev = $perBulan[count($perBulan) - 2];
            $mom = [
                'bulan' => $last['bulan'],
                'bulan_lalu' => $prev['bulan'],
                'nilai' => $last['nilai'],
                'nilai_lalu' => $prev['nilai'],
                'pct' => $prev['nilai'] > 0 ? round(($last['nilai'] - $prev['nilai']) / $prev['nilai'] * 100, 1) : null,
                'qty' => $last['qty'],
                'qty_lalu' => $prev['qty'],
                'qty_pct' => $prev['qty'] > 0 ? round(($last['qty'] - $prev['qty']) / $prev['qty'] * 100, 1) : null,
            ];
        }

        // ---- Agregat per tujuan ----
        $aggTujuan = [];
        $aggTujuanBulan = [];
        $aggJenis = [];
        $aggSegmen = [];
        foreach ($posted as $d) {
            $t = $d->getAttribute('_tujuan');
            $key = $tujuanKey($t);
            $aggTujuan[$key] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggTujuan[$key]['qty'] += $absQty($d);
            $aggTujuan[$key]['nilai'] = round($aggTujuan[$key]['nilai'] + $absNilai($d), 2);
            $aggTujuan[$key]['dokumen']++;

            $bulan = $d->document_date->format('Y-m');
            $bk = $key.'|'.$bulan;
            $aggTujuanBulan[$bk] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'bulan' => $bulan, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggTujuanBulan[$bk]['qty'] += $absQty($d);
            $aggTujuanBulan[$bk]['nilai'] = round($aggTujuanBulan[$bk]['nilai'] + $absNilai($d), 2);
            $aggTujuanBulan[$bk]['dokumen']++;

            $aggJenis[$t['jenis']] ??= ['jenis' => $t['jenis'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggJenis[$t['jenis']]['qty'] += $absQty($d);
            $aggJenis[$t['jenis']]['nilai'] = round($aggJenis[$t['jenis']]['nilai'] + $absNilai($d), 2);
            $aggJenis[$t['jenis']]['dokumen']++;

            if ($t['jenis'] === 'customer') {
                $seg = $t['segmen'] ?? 'Tanpa Segmen';
                $aggSegmen[$seg] ??= ['segmen' => $seg, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
                $aggSegmen[$seg]['qty'] += $absQty($d);
                $aggSegmen[$seg]['nilai'] = round($aggSegmen[$seg]['nilai'] + $absNilai($d), 2);
                $aggSegmen[$seg]['dokumen']++;
            }
        }
        $topTujuan = collect(array_values($aggTujuan))->sortByDesc('nilai')->values();
        $kum = 0.0;
        $topTujuan = $topTujuan->map(function ($r) use ($totalNilai, &$kum) {
            $kum = round($kum + $r['nilai'], 2);
            $r['share'] = $totalNilai > 0 ? round($r['nilai'] / $totalNilai * 100, 1) : 0;
            $r['share_kumulatif'] = $totalNilai > 0 ? round($kum / $totalNilai * 100, 1) : 0;

            return $r;
        })->values()->all();
        $perTujuanBulan = collect(array_values($aggTujuanBulan))->sortBy([['bulan', 'asc'], ['nilai', 'desc']])->values()->all();

        // ---- Omzet & margin (hanya customer-kind; dept/proyek = pemakaian internal at-cost) ----
        $postedIds = $posted->pluck('id');
        $omzetTotal = 0.0;
        $hppTerjual = 0.0;
        $omzetTujuanBulan = [];
        $aggMargin = [];
        foreach ($posted as $d) {
            $t = $d->getAttribute('_tujuan');
            if ($t['jenis'] !== 'customer') {
                continue;
            }
            $om = $absOmzet($d);
            if ($om === null) {
                continue;
            }
            $hpp = $absNilai($d);
            $omzetTotal = round($omzetTotal + $om, 2);
            $hppTerjual = round($hppTerjual + $hpp, 2);
            $bulan = $d->document_date->format('Y-m');
            $key = $tujuanKey($t);
            $bk = $key.'|'.$bulan;
            $omzetTujuanBulan[$bk] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'bulan' => $bulan, 'qty' => 0, 'omzet' => 0.0, 'hpp' => 0.0, 'dokumen' => 0];
            $omzetTujuanBulan[$bk]['qty'] += $absQty($d);
            $omzetTujuanBulan[$bk]['omzet'] = round($omzetTujuanBulan[$bk]['omzet'] + $om, 2);
            $omzetTujuanBulan[$bk]['hpp'] = round($omzetTujuanBulan[$bk]['hpp'] + $hpp, 2);
            $omzetTujuanBulan[$bk]['dokumen']++;
            $aggMargin[$key] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'omzet' => 0.0, 'hpp' => 0.0, 'dokumen' => 0];
            $aggMargin[$key]['qty'] += $absQty($d);
            $aggMargin[$key]['omzet'] = round($aggMargin[$key]['omzet'] + $om, 2);
            $aggMargin[$key]['hpp'] = round($aggMargin[$key]['hpp'] + $hpp, 2);
            $aggMargin[$key]['dokumen']++;
        }
        $topMargin = collect(array_values($aggMargin))->map(function ($r) use ($omzetTotal) {
            $r['margin'] = round($r['omzet'] - $r['hpp'], 2);
            $r['margin_pct'] = $r['omzet'] > 0 ? round(($r['omzet'] - $r['hpp']) / $r['omzet'] * 100, 1) : null;
            $r['share_omzet'] = $omzetTotal > 0 ? round($r['omzet'] / $omzetTotal * 100, 1) : 0;

            return $r;
        })->sortByDesc('margin')->values()->all();
        $omzetTujuanBulanOut = collect(array_values($omzetTujuanBulan))->map(function ($r) {
            $r['margin'] = round($r['omzet'] - $r['hpp'], 2);
            $r['margin_pct'] = $r['omzet'] > 0 ? round(($r['omzet'] - $r['hpp']) / $r['omzet'] * 100, 1) : null;

            return $r;
        })->sortBy([['bulan', 'asc'], ['omzet', 'desc']])->values()->all();
        // Cakupan harga: garis posted ber-harga aktual vs estimasi vs tanpa harga.
        $cakupan = ['aktual' => 0, 'estimasi' => 0, 'tanpa_harga' => 0];
        if ($postedIds->isNotEmpty()) {
            $cov = StockDocumentLine::query()->whereIn('document_id', $postedIds)
                ->selectRaw('COUNT(*) as total, COUNT(unit_price) as berharga, SUM(CASE WHEN unit_price_estimated THEN 1 ELSE 0 END) as estimasi')
                ->first();
            $cakupan = [
                'aktual' => (int) (($cov->berharga ?? 0) - ($cov->estimasi ?? 0)),
                'estimasi' => (int) ($cov->estimasi ?? 0),
                'tanpa_harga' => (int) (($cov->total ?? 0) - ($cov->berharga ?? 0)),
            ];
        }

        // ---- Top item keluar (dari baris dokumen posted) ----
        $postedIds = $posted->pluck('id');
        $topItems = [];
        if ($postedIds->isNotEmpty()) {
            $rows = StockDocumentLine::query()
                ->whereIn('document_id', $postedIds)
                ->selectRaw('item_id, SUM(ABS(qty)) as qty, SUM(ABS(qty) * unit_cost) as nilai')
                ->groupBy('item_id')
                ->orderByDesc(DB::raw('SUM(ABS(qty) * unit_cost)'))
                ->limit(10)
                ->get();
            $items = Item::with('unit')->whereIn('id', $rows->pluck('item_id'))->get()->keyBy('id');
            foreach ($rows as $r) {
                $it = $items->get($r->item_id);
                $topItems[] = [
                    'item_id' => (int) $r->item_id,
                    'sku' => $it?->sku,
                    'nama' => $it?->name ?? "Item #{$r->item_id}",
                    'satuan' => $it?->unit?->name,
                    'qty' => (int) $r->qty,
                    'nilai' => round((float) $r->nilai, 2),
                ];
            }
        }

        // ---- Retur tertaut (Retur Penjualan Selesai periode ini) ----
        $returs = StockDocument::query()
            ->with(['lines', 'customer'])
            ->withSum('lines as qty_total', 'qty')
            ->withSum('lines as value_total', DB::raw('qty * unit_cost'))
            ->withSum('lines as revenue_total', DB::raw('qty * unit_price'))
            ->where('type', 'Retur Penjualan')
            ->where('status', 'Selesai')
            ->whereBetween('document_date', [$from, $to])
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->get();
        $returQty = 0;
        $returNilai = 0.0;
        $returOmzet = 0.0;
        $perAlasan = [];
        $returPerTujuan = [];
        $returPerItem = [];
        $sourceDocIds = $returs->pluck('source_document_id')->filter()->unique()->values();
        $sourceDocs = $sourceDocIds->isNotEmpty()
            ? StockDocument::with(['customer', 'department', 'project'])->whereIn('id', $sourceDocIds)->get()->keyBy('id')
            : collect();
        foreach ($returs as $r) {
            $q = abs((int) ($r->qty_total ?? 0));
            $n = round(abs((float) ($r->value_total ?? 0)), 2);
            $returQty += $q;
            $returNilai = round($returNilai + $n, 2);
            if ($r->revenue_total !== null) {
                $returOmzet = round($returOmzet + abs((float) $r->revenue_total), 2);
            }

            $alasan = 'Tanpa Alasan';
            if (preg_match('/^Alasan:\s*([^\r\n;]+)/m', (string) $r->note, $m)) {
                $alasan = trim($m[1]);
            }
            $perAlasan[$alasan] ??= ['alasan' => $alasan, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $perAlasan[$alasan]['qty'] += $q;
            $perAlasan[$alasan]['nilai'] = round($perAlasan[$alasan]['nilai'] + $n, 2);
            $perAlasan[$alasan]['dokumen']++;

            // Tujuan retur = tujuan dokumen Pengeluaran sumber (fallback customer retur itu sendiri).
            $src = $r->source_document_id ? $sourceDocs->get($r->source_document_id) : null;
            $t = $src ? $classify($src) : ['jenis' => 'customer', 'id' => $r->customer_id ? (int) $r->customer_id : null, 'nama' => $r->customer?->name ?? $r->partner ?? '—'];
            $rk = $t['jenis'].'|'.($t['id'] ?? 'null').'|'.$t['nama'];
            $returPerTujuan[$rk] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $returPerTujuan[$rk]['qty'] += $q;
            $returPerTujuan[$rk]['nilai'] = round($returPerTujuan[$rk]['nilai'] + $n, 2);
            $returPerTujuan[$rk]['dokumen']++;

            foreach ($r->lines as $ln) {
                $iid = (int) $ln->item_id;
                $returPerItem[$iid] ??= ['item_id' => $iid, 'qty' => 0, 'nilai' => 0.0];
                $returPerItem[$iid]['qty'] += abs((int) ($ln->qty ?? 0));
                $returPerItem[$iid]['nilai'] = round($returPerItem[$iid]['nilai'] + abs((int) ($ln->qty ?? 0)) * (float) ($ln->unit_cost ?? 0), 2);
            }
        }
        $returItemIds = array_keys($returPerItem);
        $returItemMaster = $returItemIds !== [] ? Item::with('unit')->whereIn('id', $returItemIds)->get()->keyBy('id') : collect();
        $returPerItemOut = collect($returPerItem)->map(function ($r) use ($returItemMaster) {
            $it = $returItemMaster->get($r['item_id']);
            $r['sku'] = $it?->sku;
            $r['nama'] = $it?->name ?? "Item #{$r['item_id']}";
            $r['satuan'] = $it?->unit?->name;

            return $r;
        })->sortByDesc('nilai')->values()->all();

        // ---- Aktivitas tujuan (baru vs berulang, at-risk vs acuan akhir periode) ----
        $aktivitas = [];
        foreach ($aggTujuan as $key => $a) {
            $last = $posted->filter(fn (StockDocument $d) => $tujuanKey($d->getAttribute('_tujuan')) === $key)->max('document_date');
            $days = $last ? $to->diffInDays($last, true) : null;
            $aktivitas[] = [
                'jenis' => $a['jenis'],
                'id' => $a['id'],
                'nama' => $a['nama'],
                'dokumen' => $a['dokumen'],
                'nilai' => $a['nilai'],
                'terakhir' => $last ? $last->toDateString() : null,
                'hari_sejak_terakhir' => $days !== null ? (int) floor($days) : null,
                'status' => $a['dokumen'] <= 1 ? 'baru' : (($days !== null && $days > $atRiskDays) ? 'at-risk' : 'aktif'),
            ];
        }
        usort($aktivitas, fn ($a, $b) => $b['nilai'] <=> $a['nilai']);

        // ---- Kecepatan proses (lead time + aging tertahan) ----
        $leadDays = [];
        foreach ($posted as $d) {
            if ($d->posted_at && $d->document_date) {
                $leadDays[] = max(0, $d->document_date->diffInDays($d->posted_at, true));
            }
        }
        sort($leadDays);
        $aging = ['0-7 hari' => ['count' => 0, 'nilai' => 0.0], '8-30 hari' => ['count' => 0, 'nilai' => 0.0], '>30 hari' => ['count' => 0, 'nilai' => 0.0]];
        $tertahanNilai = 0.0;
        foreach ($tertahan as $d) {
            $n = $absNilai($d);
            $tertahanNilai = round($tertahanNilai + $n, 2);
            $age = (int) floor($to->diffInDays($d->document_date, true));
            $bucket = $age <= 7 ? '0-7 hari' : ($age <= 30 ? '8-30 hari' : '>30 hari');
            $aging[$bucket]['count']++;
            $aging[$bucket]['nilai'] = round($aging[$bucket]['nilai'] + $n, 2);
        }
        $proses = [
            'lead_median_hari' => $leadDays !== [] ? round($leadDays[(int) floor((count($leadDays) - 1) / 2)], 1) : null,
            'lead_avg_hari' => $leadDays !== [] ? round(array_sum($leadDays) / count($leadDays), 1) : null,
            'tertahan_dokumen' => $tertahan->count(),
            'tertahan_nilai' => $tertahanNilai,
            'aging' => array_map(fn ($k, $v) => ['rentang' => $k, 'dokumen' => $v['count'], 'nilai' => $v['nilai']], array_keys($aging), array_values($aging)),
        ];

        // ---- Serapan proyek (vs budget Rp + vs target WO per item) ----
        $proyekOut = [];
        $projKeys = collect($aggTujuan)->filter(fn ($a) => $a['jenis'] === 'proyek')->values();
        if ($projKeys->isNotEmpty()) {
            $projModels = Project::whereIn('id', $projKeys->pluck('id')->filter()->values())->get()->keyBy('id');
            foreach ($projKeys as $a) {
                $docIds = $posted->filter(fn (StockDocument $d) => $tujuanKey($d->getAttribute('_tujuan')) === $tujuanKey($a))->pluck('id');
                $keluarPerItem = $docIds->isNotEmpty()
                    ? StockDocumentLine::query()->whereIn('document_id', $docIds)
                        ->selectRaw('item_id, SUM(ABS(qty)) as qty, SUM(ABS(qty) * unit_cost) as nilai')
                        ->groupBy('item_id')->get()->keyBy('item_id')
                    : collect();
                $pm = $a['id'] !== null ? $projModels->get($a['id']) : null;
                $targets = $a['id'] !== null
                    ? WorkOrder::with('item.unit')->where('project_id', $a['id'])->get()
                    : collect();
                $items = [];
                foreach ($targets as $wo) {
                    $kel = $keluarPerItem->get($wo->item_id);
                    $kelQty = $kel ? (int) $kel->qty : 0;
                    $tgt = (int) ($wo->target_qty ?? 0);
                    $var = $tgt > 0 ? round(($kelQty - $tgt) / $tgt * 100, 1) : null;
                    $items[] = [
                        'item_id' => (int) $wo->item_id,
                        'sku' => $wo->item?->sku,
                        'nama' => $wo->item?->name ?? "Item #{$wo->item_id}",
                        'satuan' => $wo->item?->unit?->name,
                        'target_qty' => $tgt,
                        'keluar_qty' => $kelQty,
                        'nilai_keluar' => $kel ? round((float) $kel->nilai, 2) : 0.0,
                        'varians_pct' => $var,
                        'flag' => $var !== null && abs($var) > $band,
                        'work_order' => $wo->no,
                    ];
                }
                // Item keluar tanpa WO tercatat (serapan tak terencana).
                $woItemIds = $targets->pluck('item_id')->map(fn ($v) => (int) $v)->all();
                $itemMaster = Item::with('unit')->whereIn('id', $keluarPerItem->keys())->get()->keyBy('id');
                foreach ($keluarPerItem as $iid => $kel) {
                    if (in_array((int) $iid, $woItemIds, true)) {
                        continue;
                    }
                    $it = $itemMaster->get($iid);
                    $items[] = [
                        'item_id' => (int) $iid,
                        'sku' => $it?->sku,
                        'nama' => $it?->name ?? "Item #{$iid}",
                        'satuan' => $it?->unit?->name,
                        'target_qty' => 0,
                        'keluar_qty' => (int) $kel->qty,
                        'nilai_keluar' => round((float) $kel->nilai, 2),
                        'varians_pct' => null,
                        'flag' => true,
                        'work_order' => null,
                    ];
                }
                $budget = $pm?->budget !== null ? (float) $pm->budget : null;
                $proyekOut[] = [
                    'id' => $a['id'],
                    'nama' => $a['nama'],
                    'nilai_keluar' => $a['nilai'],
                    'qty_keluar' => $a['qty'],
                    'budget' => $budget,
                    'serapan_budget_pct' => $budget !== null && $budget > 0 ? round($a['nilai'] / $budget * 100, 1) : null,
                    'status_proyek' => $pm?->status,
                    'items' => $items,
                ];
            }
            usort($proyekOut, fn ($a, $b) => $b['nilai_keluar'] <=> $a['nilai_keluar']);
        }

        return response()->json(['data' => [
            'periode' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'ringkasan' => [
                'nilai' => $totalNilai,
                'qty' => $totalQty,
                'dokumen' => $posted->count(),
                'rata_nilai' => $posted->count() > 0 ? round($totalNilai / $posted->count(), 2) : 0,
                'mom' => $mom,
            ],
            'per_bulan' => $perBulan,
            'per_tujuan_per_bulan' => $perTujuanBulan,
            'top_tujuan' => array_slice($topTujuan, 0, 10),
            'per_jenis' => array_values($aggJenis),
            'per_segmen' => array_values($aggSegmen),
            'top_items' => $topItems,
            'retur' => [
                'qty' => $returQty,
                'nilai' => $returNilai,
                'omzet' => $returOmzet,
                'rate_qty' => $totalQty > 0 ? round($returQty / $totalQty * 100, 2) : 0,
                'rate_nilai' => $totalNilai > 0 ? round($returNilai / $totalNilai * 100, 2) : 0,
                'per_alasan' => collect(array_values($perAlasan))->sortByDesc('nilai')->values()->all(),
                'per_tujuan' => collect(array_values($returPerTujuan))->sortByDesc('nilai')->values()->all(),
                'per_item' => array_slice($returPerItemOut, 0, 10),
            ],
            'omzet' => [
                'total' => $omzetTotal,
                'hpp' => $hppTerjual,
                'margin' => round($omzetTotal - $hppTerjual, 2),
                'margin_pct' => $omzetTotal > 0 ? round(($omzetTotal - $hppTerjual) / $omzetTotal * 100, 1) : null,
                'bersih' => round($omzetTotal - $returOmzet, 2),
                'cakupan' => $cakupan,
                'per_customer_per_bulan' => $omzetTujuanBulanOut,
                'top_margin' => array_slice($topMargin, 0, 10),
            ],
            'aktivitas' => $aktivitas,
            'proses' => $proses,
            'proyek' => $proyekOut,
        ]]);
    }
}
