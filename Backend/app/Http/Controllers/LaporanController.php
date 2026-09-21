<?php

namespace App\Http\Controllers;

use App\Http\Requests\LaporanKeluarAnalyticsRequest;
use App\Http\Requests\LaporanMutasiRequest;
use App\Http\Requests\TransaksiAnalyticsRequest;
use App\Http\Resources\LaporanMutasiResource;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Project;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Support\TransaksiAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
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

        // Fase 2.2: paginasi Item di SQL, agregat qty per halaman via GROUP BY +
        // CASE (dulu: load semua item + semua movement lalu fold di PHP).
        // Partisi temporal memakai occurred_at persis seperti fold lama
        // (occurred_at = document_date). Nilai akhir tetap via moving-average
        // fold per halaman (GROUP BY tidak bisa mereproduksinya).
        $paginator = $query->orderBy('items.name')->paginate((int) ($data['per_page'] ?? 20));
        $paginator->appends($request->query());
        $pageIds = $paginator->getCollection()->pluck('id');

        $fromStr = $from->toDateTimeString();
        $toStr = $to->toDateTimeString();
        $signed = "CASE WHEN direction = 'IN' THEN qty ELSE -qty END";

        $agg = StockMovement::query()
            ->whereIn('item_id', $pageIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->selectRaw(
                'item_id, '.
                "SUM(CASE WHEN occurred_at < ? THEN ({$signed}) ELSE 0 END) AS opening, ".
                "SUM(CASE WHEN occurred_at BETWEEN ? AND ? AND direction = 'IN' THEN qty ELSE 0 END) AS masuk, ".
                "SUM(CASE WHEN occurred_at BETWEEN ? AND ? AND direction = 'OUT' THEN qty ELSE 0 END) AS keluar",
                [$fromStr, $fromStr, $toStr, $fromStr, $toStr]
            )
            ->groupBy('item_id')
            ->get()
            ->keyBy('item_id');

        // Basis moving-average untuk nilai_akhir: full history ≤ to per item halaman.
        $movements = StockMovement::query()
            ->whereIn('item_id', $pageIds)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->where('occurred_at', '<=', $toStr)
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get()
            ->groupBy('item_id');

        // Nilai akhir via moving average (unit_cost_avg) per warehouse scope.

        $paginator->setCollection(
            $paginator->getCollection()->map(function (Item $item) use ($agg, $movements) {
                $row = $agg->get($item->id);

                $saldoAwal = max(0, (int) ($row?->opening ?? 0));
                $masuk = (int) ($row?->masuk ?? 0);
                $keluar = (int) ($row?->keluar ?? 0);
                $saldoAkhir = max(0, $saldoAwal + $masuk - $keluar);

                $onHandQty = 0;
                $onHandValue = 0.0;

                foreach ($movements->get($item->id, collect()) as $movement) {
                    if ($movement->direction === 'IN') {
                        $onHandQty += $movement->qty;
                        $onHandValue += $movement->qty * $movement->unit_cost;
                    } else {
                        $avg = $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0);
                        $onHandValue -= $movement->qty * $avg;
                        $onHandQty -= $movement->qty;
                    }
                }

                // Nilai akhir via average (consistent with ItemStock unit_cost_avg)
                // If no movements, fallback to item cost.
                $unitCostAvg = $onHandQty > 0 ? $onHandValue / $onHandQty : ($item->cost ?? 0);
                $unitCostAvg = round($unitCostAvg, 2);
                $nilaiAkhir = round(max(0, $saldoAkhir) * $unitCostAvg, 2);

                // Attach computed fields for resource
                $item->saldo_awal = $saldoAwal;
                $item->masuk = $masuk;
                $item->keluar = $keluar;
                $item->saldo_akhir = $saldoAkhir;
                $item->nilai_akhir = $nilaiAkhir;
                $item->unit_cost_avg = $unitCostAvg;

                return $item;
            })
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

        // Klasifikasi satu baris dokumen (array skalar, lihat $baseDocs di
        // bawah) menjadi identitas tujuan teresolusi.
        $classify = function (array $d) use ($deptMap, $projMap): array {
            if ($d['customer_id']) {
                return ['jenis' => 'customer', 'id' => (int) $d['customer_id'], 'nama' => $d['customer_name'] ?? $d['partner'] ?? '—', 'segmen' => $d['customer_segment']];
            }
            if ($d['department_id']) {
                return ['jenis' => 'departemen', 'id' => (int) $d['department_id'], 'nama' => $d['department_name'] ?? $d['partner'] ?? '—', 'segmen' => null];
            }
            if ($d['work_order_id']) {
                $nama = $d['wo_no'] ? $d['wo_no'].($d['wo_project_name'] ? ' · '.$d['wo_project_name'] : '') : ($d['partner'] ?? '—');

                return ['jenis' => 'work_order', 'id' => (int) $d['work_order_id'], 'nama' => $nama, 'segmen' => null];
            }
            // Arsip: BK lama bertujuan proyek (project_id tak lagi diisi baru).
            if ($d['project_id']) {
                return ['jenis' => 'proyek', 'id' => (int) $d['project_id'], 'nama' => $d['project_name'] ?? $d['partner'] ?? '—', 'segmen' => null];
            }
            $key = mb_strtolower(trim((string) $d['partner']));
            if ($key !== '' && isset($deptMap[$key])) {
                return ['jenis' => 'departemen', 'id' => (int) $deptMap[$key]['id'], 'nama' => $deptMap[$key]['name'], 'segmen' => null];
            }
            if ($key !== '' && isset($projMap[$key])) {
                return ['jenis' => 'proyek', 'id' => (int) $projMap[$key]['id'], 'nama' => $projMap[$key]['name'], 'segmen' => null];
            }

            return ['jenis' => 'lainnya', 'id' => null, 'nama' => $d['partner'] ?? '—', 'segmen' => null];
        };
        $tujuanKey = fn (array $t): string => $t['jenis'].'|'.($t['id'] ?? 'null').'|'.$t['nama'];

        // W3: SATU query agregat — join lines yang di-GROUP BY per dokumen +
        // join nama relasi. Tanpa hidrasi model, tanpa eager load, tanpa
        // withSum (3 subquery korelasi per baris). Baris ringan (±20 skalar)
        // dipetakan ke array; document_date/posted_at di-cast ke Carbon agar
        // matematika downstream IDENTIK (termasuk pembulatan per-baris).
        $baseDocs = StockDocument::query()
            ->leftJoin('stock_document_lines as l', 'l.document_id', '=', 'stock_documents.id')
            ->leftJoin('customers as c', 'c.id', '=', 'stock_documents.customer_id')
            ->leftJoin('departments as dep', 'dep.id', '=', 'stock_documents.department_id')
            ->leftJoin('projects as p', 'p.id', '=', 'stock_documents.project_id')
            ->leftJoin('work_orders as wo', 'wo.id', '=', 'stock_documents.work_order_id')
            ->leftJoin('projects as wp', 'wp.id', '=', 'wo.project_id')
            ->where('stock_documents.type', 'Pengeluaran')
            ->whereBetween('stock_documents.document_date', [$from, $to])
            ->when($warehouseId !== null, fn ($q) => $q->where('stock_documents.warehouse_id', $warehouseId))
            ->when(isset($data['customer_id']), fn ($q) => $q->where('stock_documents.customer_id', $data['customer_id']))
            ->when(isset($data['department_id']), fn ($q) => $q->where('stock_documents.department_id', $data['department_id']))
            ->when(isset($data['project_id']), fn ($q) => $q->where('stock_documents.project_id', $data['project_id']))
            ->when(isset($data['work_order_id']), fn ($q) => $q->where('stock_documents.work_order_id', $data['work_order_id']))
            ->groupBy([
                'stock_documents.id', 'stock_documents.status', 'stock_documents.document_date',
                'stock_documents.posted_at', 'stock_documents.partner', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.project_id', 'stock_documents.warehouse_id',
                'c.name', 'c.segment', 'dep.name', 'p.name',
                'wo.no', 'wo.project_id', 'wp.name',
            ])
            ->orderBy('stock_documents.document_date')
            ->select([
                'stock_documents.id', 'stock_documents.status', 'stock_documents.document_date',
                'stock_documents.posted_at', 'stock_documents.partner', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.project_id', 'stock_documents.warehouse_id',
                'c.name as customer_name', 'c.segment as customer_segment',
                'dep.name as department_name', 'p.name as project_name',
                'wo.no as wo_no', 'wo.project_id as wo_project_id', 'wp.name as wo_project_name',
            ])
            ->selectRaw('SUM(l.qty) as qty_total, SUM(l.qty * l.unit_cost) as value_total, SUM(l.qty * l.unit_price) as revenue_total')
            ->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'status' => $r->status,
                'document_date' => Carbon::parse($r->document_date),
                'posted_at' => $r->posted_at ? Carbon::parse($r->posted_at) : null,
                'partner' => $r->partner,
                'note' => $r->note,
                'source_document_id' => $r->source_document_id !== null ? (int) $r->source_document_id : null,
                'customer_id' => $r->customer_id !== null ? (int) $r->customer_id : null,
                'department_id' => $r->department_id !== null ? (int) $r->department_id : null,
                'work_order_id' => $r->work_order_id !== null ? (int) $r->work_order_id : null,
                'project_id' => $r->project_id !== null ? (int) $r->project_id : null,
                'warehouse_id' => $r->warehouse_id !== null ? (int) $r->warehouse_id : null,
                'qty_total' => $r->qty_total, 'value_total' => $r->value_total, 'revenue_total' => $r->revenue_total,
                'customer_name' => $r->customer_name, 'customer_segment' => $r->customer_segment,
                'department_name' => $r->department_name, 'project_name' => $r->project_name,
                'wo_no' => $r->wo_no,
                'wo_project_id' => $r->wo_project_id !== null ? (int) $r->wo_project_id : null,
                'wo_project_name' => $r->wo_project_name,
                '_tujuan' => null,
            ])
            ->map(function (array $d) use ($classify) {
                $d['_tujuan'] = $classify($d);

                return $d;
            });

        if (isset($data['jenis_tujuan'])) {
            $baseDocs = $baseDocs->filter(fn (array $d) => $d['_tujuan']['jenis'] === $data['jenis_tujuan'])->values();
        }

        $posted = $baseDocs->where('status', 'Selesai')->values();
        $tertahan = $baseDocs->whereIn('status', ['Draft', 'Menunggu Approval', 'Dalam Perjalanan'])->values();

        $absQty = fn (array $d): int => abs((int) ($d['qty_total'] ?? 0));
        $absNilai = fn (array $d): float => round(abs((float) ($d['value_total'] ?? 0)), 2);
        // Omzet = harga jual × qty (null bila baris tanpa harga jual).
        $absOmzet = fn (array $d): ?float => $d['revenue_total'] !== null ? round(abs((float) $d['revenue_total']), 2) : null;

        // ---- Ringkasan + MoM (dekomposisi volume vs rata-rata nilai) ----
        $totalNilai = round($posted->sum($absNilai), 2);
        $totalQty = $posted->sum($absQty);
        $perBulan = [];
        foreach ($posted as $d) {
            /** @var Carbon $tgl */
            $tgl = $d['document_date'];
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
            $t = $d['_tujuan'];
            $key = $tujuanKey($t);
            $aggTujuan[$key] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggTujuan[$key]['qty'] += $absQty($d);
            $aggTujuan[$key]['nilai'] = round($aggTujuan[$key]['nilai'] + $absNilai($d), 2);
            $aggTujuan[$key]['dokumen']++;

            $bulan = $d['document_date']->format('Y-m');
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
            $t = $d['_tujuan'];
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
            $bulan = $d['document_date']->format('Y-m');
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
        // W3: baris skalar seperti $baseDocs (tanpa with lines/relasi).
        $returs = StockDocument::query()
            ->leftJoin('stock_document_lines as l', 'l.document_id', '=', 'stock_documents.id')
            ->leftJoin('customers as c', 'c.id', '=', 'stock_documents.customer_id')
            ->leftJoin('departments as dep', 'dep.id', '=', 'stock_documents.department_id')
            ->leftJoin('projects as p', 'p.id', '=', 'stock_documents.project_id')
            ->leftJoin('work_orders as wo', 'wo.id', '=', 'stock_documents.work_order_id')
            ->leftJoin('projects as wp', 'wp.id', '=', 'wo.project_id')
            ->where('stock_documents.type', 'Retur Penjualan')
            ->where('stock_documents.status', 'Selesai')
            ->whereBetween('stock_documents.document_date', [$from, $to])
            ->when($warehouseId !== null, fn ($q) => $q->where('stock_documents.warehouse_id', $warehouseId))
            ->groupBy([
                'stock_documents.id', 'stock_documents.document_date', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.project_id', 'stock_documents.partner',
                'c.name', 'c.segment', 'dep.name', 'p.name',
                'wo.no', 'wo.project_id', 'wp.name',
            ])
            ->select([
                'stock_documents.id', 'stock_documents.document_date', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.project_id', 'stock_documents.partner',
                'c.name as customer_name', 'c.segment as customer_segment',
                'dep.name as department_name', 'p.name as project_name',
                'wo.no as wo_no', 'wo.project_id as wo_project_id', 'wp.name as wo_project_name',
            ])
            ->selectRaw('SUM(l.qty) as qty_total, SUM(l.qty * l.unit_cost) as value_total, SUM(l.qty * l.unit_price) as revenue_total')
            ->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'document_date' => Carbon::parse($r->document_date),
                'note' => $r->note,
                'source_document_id' => $r->source_document_id !== null ? (int) $r->source_document_id : null,
                'customer_id' => $r->customer_id !== null ? (int) $r->customer_id : null,
                'department_id' => $r->department_id !== null ? (int) $r->department_id : null,
                'work_order_id' => $r->work_order_id !== null ? (int) $r->work_order_id : null,
                'project_id' => $r->project_id !== null ? (int) $r->project_id : null,
                'partner' => $r->partner,
                'qty_total' => $r->qty_total, 'value_total' => $r->value_total, 'revenue_total' => $r->revenue_total,
                'customer_name' => $r->customer_name, 'customer_segment' => $r->customer_segment,
                'department_name' => $r->department_name, 'project_name' => $r->project_name,
                'wo_no' => $r->wo_no,
                'wo_project_id' => $r->wo_project_id !== null ? (int) $r->wo_project_id : null,
                'wo_project_name' => $r->wo_project_name,
            ]);
        $returQty = 0;
        $returNilai = 0.0;
        $returOmzet = 0.0;
        $perAlasan = [];
        $returPerTujuan = [];
        $returPerItem = [];
        $sourceDocIds = $returs->pluck('source_document_id')->filter()->unique()->values();
        // Sumber cukup kolom klasifikasi + nama (untuk $classify fallback) —
        // tanpa hidrasi model penuh.
        $sourceDocs = $sourceDocIds->isNotEmpty()
            ? StockDocument::query()
                ->leftJoin('customers as c', 'c.id', '=', 'stock_documents.customer_id')
                ->leftJoin('departments as dep', 'dep.id', '=', 'stock_documents.department_id')
                ->leftJoin('projects as p', 'p.id', '=', 'stock_documents.project_id')
                ->leftJoin('work_orders as wo', 'wo.id', '=', 'stock_documents.work_order_id')
                ->leftJoin('projects as wp', 'wp.id', '=', 'wo.project_id')
                ->whereIn('stock_documents.id', $sourceDocIds)
                ->select([
                    'stock_documents.id', 'stock_documents.customer_id',
                    'stock_documents.department_id', 'stock_documents.work_order_id',
                    'stock_documents.project_id', 'stock_documents.partner',
                    'c.name as customer_name', 'c.segment as customer_segment',
                    'dep.name as department_name', 'p.name as project_name',
                    'wo.no as wo_no', 'wo.project_id as wo_project_id', 'wp.name as wo_project_name',
                ])
                ->get()
                ->mapWithKeys(fn ($r) => [(int) $r->id => [
                    'customer_id' => $r->customer_id !== null ? (int) $r->customer_id : null,
                    'department_id' => $r->department_id !== null ? (int) $r->department_id : null,
                    'work_order_id' => $r->work_order_id !== null ? (int) $r->work_order_id : null,
                    'project_id' => $r->project_id !== null ? (int) $r->project_id : null,
                    'partner' => $r->partner,
                    'customer_name' => $r->customer_name, 'customer_segment' => $r->customer_segment,
                    'department_name' => $r->department_name, 'project_name' => $r->project_name,
                    'wo_no' => $r->wo_no,
                    'wo_project_id' => $r->wo_project_id !== null ? (int) $r->wo_project_id : null,
                    'wo_project_name' => $r->wo_project_name,
                ]])
            : collect();
        foreach ($returs as $r) {
            $q = abs((int) ($r['qty_total'] ?? 0));
            $n = round(abs((float) ($r['value_total'] ?? 0)), 2);
            $returQty += $q;
            $returNilai = round($returNilai + $n, 2);
            if ($r['revenue_total'] !== null) {
                $returOmzet = round($returOmzet + abs((float) $r['revenue_total']), 2);
            }

            $alasan = 'Tanpa Alasan';
            if (preg_match('/^Alasan:\s*([^\r\n;]+)/m', (string) $r['note'], $m)) {
                $alasan = trim($m[1]);
            }
            $perAlasan[$alasan] ??= ['alasan' => $alasan, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $perAlasan[$alasan]['qty'] += $q;
            $perAlasan[$alasan]['nilai'] = round($perAlasan[$alasan]['nilai'] + $n, 2);
            $perAlasan[$alasan]['dokumen']++;

            // Tujuan retur = tujuan dokumen Pengeluaran sumber (fallback: tujuan
            // retur itu sendiri — customer/departemen/work_order warisan server).
            $src = $r['source_document_id'] ? $sourceDocs->get($r['source_document_id']) : null;
            $t = $src ? $classify($src) : $classify($r);
            $rk = $t['jenis'].'|'.($t['id'] ?? 'null').'|'.$t['nama'];
            $returPerTujuan[$rk] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $returPerTujuan[$rk]['qty'] += $q;
            $returPerTujuan[$rk]['nilai'] = round($returPerTujuan[$rk]['nilai'] + $n, 2);
            $returPerTujuan[$rk]['dokumen']++;
        }
        // Per-item retur: SATU query GROUP BY atas lines retur periode ini
        // (dulu: eager load SEMUA lines sebagai model + fold PHP).
        $returIds = $returs->pluck('id');
        if ($returIds->isNotEmpty()) {
            $returLineRows = StockDocumentLine::query()->whereIn('document_id', $returIds)
                ->selectRaw('item_id, SUM(ABS(qty)) as qty, SUM(ABS(qty) * unit_cost) as nilai')
                ->groupBy('item_id')
                ->get();
            foreach ($returLineRows as $ln) {
                $iid = (int) $ln->item_id;
                $returPerItem[$iid] ??= ['item_id' => $iid, 'qty' => 0, 'nilai' => 0.0];
                $returPerItem[$iid]['qty'] += (int) $ln->qty;
                $returPerItem[$iid]['nilai'] = round($returPerItem[$iid]['nilai'] + (float) $ln->nilai, 2);
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
        // Fase 2.3: tanggal terakhir per tujuan dihitung dalam satu pass O(T)
        // (dulu: $posted->filter per tujuan = O(D×T)). Key klasifikasi tetap
        // dari PHP — tidak direplikasi ke SQL agar semantik identik.
        $terakhirPerTujuan = [];
        foreach ($posted as $d) {
            $k = $tujuanKey($d['_tujuan']);
            $tgl = $d['document_date'];
            if (! isset($terakhirPerTujuan[$k]) || $tgl->gt($terakhirPerTujuan[$k])) {
                $terakhirPerTujuan[$k] = $tgl;
            }
        }
        $aktivitas = [];
        foreach ($aggTujuan as $key => $a) {
            $last = $terakhirPerTujuan[$key] ?? null;
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
            if ($d['posted_at'] && $d['document_date']) {
                $leadDays[] = max(0, $d['document_date']->diffInDays($d['posted_at'], true));
            }
        }
        sort($leadDays);
        $aging = ['0-7 hari' => ['count' => 0, 'nilai' => 0.0], '8-30 hari' => ['count' => 0, 'nilai' => 0.0], '>30 hari' => ['count' => 0, 'nilai' => 0.0]];
        $tertahanNilai = 0.0;
        foreach ($tertahan as $d) {
            $n = $absNilai($d);
            $tertahanNilai = round($tertahanNilai + $n, 2);
            $age = (int) floor($to->diffInDays($d['document_date'], true));
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
        // Dikelompokkan per proyek induk: BK bertujuan WO (via
        // work_order.project_id) + BK proyek-arsip (project_id). Shape agregat
        // dipertahankan agar respons API tidak berubah.
        $proyekOut = [];
        $projBuckets = [];
        foreach ($posted as $d) {
            $pid = $d['work_order_id'] !== null ? $d['wo_project_id'] : $d['project_id'];
            if ($pid === null) {
                continue;
            }
            $key = 'proyek|'.$pid;
            if (! isset($projBuckets[$key])) {
                $nama = $d['work_order_id'] !== null
                    ? ($d['wo_project_name'] ?? $d['partner'] ?? '—')
                    : ($d['project_name'] ?? $d['partner'] ?? '—');
                $projBuckets[$key] = ['jenis' => 'proyek', 'id' => (int) $pid, 'nama' => $nama, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            }
            $projBuckets[$key]['qty'] += abs((int) ($d['qty_total'] ?? 0));
            $projBuckets[$key]['nilai'] = round($projBuckets[$key]['nilai'] + abs((float) ($d['value_total'] ?? 0)), 2);
            $projBuckets[$key]['dokumen']++;
        }
        $projKeys = collect(array_values($projBuckets));
        if ($projKeys->isNotEmpty()) {
            $projModels = Project::whereIn('id', $projKeys->pluck('id')->filter()->values())->get()->keyBy('id');

            // Fase 2.3: petakan dokumen posted ke key bucket proyek dalam satu
            // pass O(T), lalu 3 query batch untuk SEMUA proyek. Kunci bucket
            // sama dengan $tujuanKey($a) dari entri $projKeys di atas.
            $projKeyByDocId = [];
            foreach ($posted as $d) {
                $pid = $d['work_order_id'] !== null ? $d['wo_project_id'] : $d['project_id'];
                if ($pid === null) {
                    continue;
                }
                $bkey = 'proyek|'.$pid;
                if (! isset($projBuckets[$bkey])) {
                    continue;
                }
                $a = $projBuckets[$bkey];
                $projKeyByDocId[$d['id']] = $a['jenis'].'|'.($a['id'] ?? 'null').'|'.$a['nama'];
            }
            // [projKey][item_id] => ['qty', 'nilai'] — diakumulasi per chunk agar
            // whereIn tetap kecil; pembulatan akhir 2 desimal sama seperti dulu.
            $linesByProjItem = [];
            foreach (array_chunk(array_keys($projKeyByDocId), 1000) as $chunk) {
                if ($chunk === []) {
                    continue;
                }
                $rows = StockDocumentLine::query()->whereIn('document_id', $chunk)
                    ->selectRaw('document_id, item_id, SUM(ABS(qty)) as qty, SUM(ABS(qty) * unit_cost) as nilai')
                    ->groupBy('document_id', 'item_id')
                    ->get();
                foreach ($rows as $r) {
                    $pk = $projKeyByDocId[$r->document_id] ?? null;
                    if ($pk === null) {
                        continue;
                    }
                    $linesByProjItem[$pk][$r->item_id] ??= ['qty' => 0, 'nilai' => 0.0];
                    $linesByProjItem[$pk][$r->item_id]['qty'] += (int) $r->qty;
                    $linesByProjItem[$pk][$r->item_id]['nilai'] += (float) $r->nilai;
                }
            }
            $woByProject = WorkOrder::with('item.unit')
                ->whereIn('project_id', $projKeys->pluck('id')->filter()->values())
                ->get()
                ->groupBy('project_id');
            $neededItemIds = collect($linesByProjItem)->flatMap(fn ($perItem) => array_keys($perItem))
                ->merge($woByProject->flatten()->pluck('item_id'))
                ->unique()->values();
            $itemMasterAll = $neededItemIds->isNotEmpty()
                ? Item::with('unit')->whereIn('id', $neededItemIds)->get()->keyBy('id')
                : collect();

            foreach ($projKeys as $a) {
                $keluarPerItem = collect($linesByProjItem[$tujuanKey($a)] ?? []);
                $pm = $a['id'] !== null ? $projModels->get($a['id']) : null;
                $targets = $a['id'] !== null
                    ? ($woByProject->get($a['id']) ?? collect())
                    : collect();
                $items = [];
                foreach ($targets as $wo) {
                    $kel = $keluarPerItem->get($wo->item_id);
                    $kelQty = $kel ? (int) $kel['qty'] : 0;
                    $tgt = (int) ($wo->target_qty ?? 0);
                    $var = $tgt > 0 ? round(($kelQty - $tgt) / $tgt * 100, 1) : null;
                    $items[] = [
                        'item_id' => (int) $wo->item_id,
                        'sku' => $wo->item?->sku,
                        'nama' => $wo->item?->name ?? "Item #{$wo->item_id}",
                        'satuan' => $wo->item?->unit?->name,
                        'target_qty' => $tgt,
                        'keluar_qty' => $kelQty,
                        'nilai_keluar' => $kel ? round((float) $kel['nilai'], 2) : 0.0,
                        'varians_pct' => $var,
                        'flag' => $var !== null && abs($var) > $band,
                        'work_order' => $wo->no,
                    ];
                }
                // Item keluar tanpa WO tercatat (serapan tak terencana).
                $woItemIds = $targets->pluck('item_id')->map(fn ($v) => (int) $v)->all();
                $itemMaster = $itemMasterAll;
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
                        'keluar_qty' => (int) $kel['qty'],
                        'nilai_keluar' => round((float) $kel['nilai'], 2),
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

    /**
     * Analitik generik laporan transaksi: Penerimaan, Transfer Gudang,
     * Retur Pembelian, Retur Penjualan. (Pengeluaran dilayani endpoint
     * khusus keluarAnalytics yang dibekukan — tidak didedupe di sini.)
     *
     * Dimensi "pihak" per tipe: supplier (Masuk/RP, via name-match karena
     * tanpa FK), gudang tujuan (Transfer, via FK), customer (RJ, via FK).
     * Semua "nilai" = nilai pokok persediaan (qty × unit_cost), BUKAN omzet.
     * Angka keputusan hanya dari dokumen Selesai; sisanya masuk `proses`.
     */
    public function transaksiAnalytics(TransaksiAnalyticsRequest $request): JsonResponse
    {
        $data = $request->validated();
        $type = $data['type'];

        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $atRiskDays = (int) ($data['at_risk_days'] ?? 90);

        $supplierMap = Supplier::query()->pluck('id', 'name')
            ->mapWithKeys(fn ($id, $name) => [mb_strtolower(trim((string) $name)) => ['id' => $id, 'name' => $name]]);
        $customerMap = Customer::query()->pluck('id', 'name')
            ->mapWithKeys(fn ($id, $name) => [mb_strtolower(trim((string) $name)) => ['id' => $id, 'name' => $name]]);

        $matchSupplier = function (?string $partner) use ($supplierMap): array {
            $key = mb_strtolower(trim((string) $partner));
            if ($key !== '' && isset($supplierMap[$key])) {
                return ['jenis' => 'supplier', 'id' => (int) $supplierMap[$key]['id'], 'nama' => $supplierMap[$key]['name']];
            }

            return ['jenis' => 'lainnya', 'id' => null, 'nama' => $partner ?? '—'];
        };

        $classify = function (array $d) use ($type, $matchSupplier, $customerMap): array {
            if ($type === 'Transfer Gudang') {
                return ['jenis' => 'gudang', 'id' => $d['destination_warehouse_id'] !== null ? (int) $d['destination_warehouse_id'] : null, 'nama' => $d['destination_name'] ?? '—'];
            }
            if ($type === 'Retur Penjualan') {
                if ($d['customer_id']) {
                    return ['jenis' => 'customer', 'id' => (int) $d['customer_id'], 'nama' => $d['customer_name'] ?? $d['partner'] ?? '—'];
                }
                if ($d['department_id']) {
                    return ['jenis' => 'departemen', 'id' => (int) $d['department_id'], 'nama' => $d['department_name'] ?? $d['partner'] ?? '—'];
                }
                if ($d['work_order_id']) {
                    $nama = $d['wo_no'] ? $d['wo_no'].($d['wo_project_name'] ? ' · '.$d['wo_project_name'] : '') : ($d['partner'] ?? '—');

                    return ['jenis' => 'work_order', 'id' => (int) $d['work_order_id'], 'nama' => $nama];
                }
                $key = mb_strtolower(trim((string) $d['partner']));
                if ($key !== '' && isset($customerMap[$key])) {
                    return ['jenis' => 'customer', 'id' => (int) $customerMap[$key]['id'], 'nama' => $customerMap[$key]['name']];
                }

                return ['jenis' => 'lainnya', 'id' => null, 'nama' => $d['partner'] ?? '—'];
            }

            // Penerimaan & Retur Pembelian: pihak = supplier (snapshot teks).
            return $matchSupplier($d['partner']);
        };
        $pihakKey = fn (array $t): string => TransaksiAnalytics::pihakKey($t['jenis'], $t['id'], $t['nama']);

        // W3: baris skalar agregat-SQL seperti keluarAnalytics — tanpa
        // hidrasi model, tanpa eager load, tanpa withSum.
        $docs = StockDocument::query()
            ->leftJoin('stock_document_lines as l', 'l.document_id', '=', 'stock_documents.id')
            ->leftJoin('customers as c', 'c.id', '=', 'stock_documents.customer_id')
            ->leftJoin('departments as dep', 'dep.id', '=', 'stock_documents.department_id')
            ->leftJoin('work_orders as wo', 'wo.id', '=', 'stock_documents.work_order_id')
            ->leftJoin('projects as wp', 'wp.id', '=', 'wo.project_id')
            ->leftJoin('warehouses as w', 'w.id', '=', 'stock_documents.warehouse_id')
            ->leftJoin('warehouses as dw', 'dw.id', '=', 'stock_documents.destination_warehouse_id')
            ->where('stock_documents.type', $type)
            ->whereBetween('stock_documents.document_date', [$from, $to])
            ->when($warehouseId !== null, fn ($q) => $q->where('stock_documents.warehouse_id', $warehouseId))
            ->when(
                $type === 'Transfer Gudang' && isset($data['destination_warehouse_id']),
                fn ($q) => $q->where('stock_documents.destination_warehouse_id', $data['destination_warehouse_id'])
            )
            ->groupBy([
                'stock_documents.id', 'stock_documents.status', 'stock_documents.document_date',
                'stock_documents.posted_at', 'stock_documents.partner', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.warehouse_id', 'stock_documents.destination_warehouse_id',
                'c.name', 'dep.name', 'wo.no', 'wp.name', 'w.name', 'dw.name',
            ])
            ->orderBy('stock_documents.document_date')
            ->select([
                'stock_documents.id', 'stock_documents.status', 'stock_documents.document_date',
                'stock_documents.posted_at', 'stock_documents.partner', 'stock_documents.note',
                'stock_documents.source_document_id', 'stock_documents.customer_id',
                'stock_documents.department_id', 'stock_documents.work_order_id',
                'stock_documents.warehouse_id', 'stock_documents.destination_warehouse_id',
                'c.name as customer_name', 'dep.name as department_name',
                'wo.no as wo_no', 'wp.name as wo_project_name',
                'w.name as warehouse_name', 'dw.name as destination_name',
            ])
            ->selectRaw('SUM(l.qty) as qty_total, SUM(l.qty * l.unit_cost) as value_total, SUM(l.qty * l.unit_price) as revenue_total')
            ->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'status' => $r->status,
                'document_date' => Carbon::parse($r->document_date),
                'posted_at' => $r->posted_at ? Carbon::parse($r->posted_at) : null,
                'partner' => $r->partner,
                'note' => $r->note,
                'source_document_id' => $r->source_document_id !== null ? (int) $r->source_document_id : null,
                'customer_id' => $r->customer_id !== null ? (int) $r->customer_id : null,
                'department_id' => $r->department_id !== null ? (int) $r->department_id : null,
                'work_order_id' => $r->work_order_id !== null ? (int) $r->work_order_id : null,
                'warehouse_id' => $r->warehouse_id !== null ? (int) $r->warehouse_id : null,
                'destination_warehouse_id' => $r->destination_warehouse_id !== null ? (int) $r->destination_warehouse_id : null,
                'qty_total' => $r->qty_total, 'value_total' => $r->value_total, 'revenue_total' => $r->revenue_total,
                'customer_name' => $r->customer_name, 'department_name' => $r->department_name,
                'wo_no' => $r->wo_no, 'wo_project_name' => $r->wo_project_name,
                'warehouse_name' => $r->warehouse_name, 'destination_name' => $r->destination_name,
                '_pihak' => null,
            ])
            ->map(function (array $d) use ($classify) {
                $d['_pihak'] = $classify($d);

                return $d;
            });

        $posted = $docs->where('status', 'Selesai')->values();
        $tertahan = $docs->whereIn('status', ['Draft', 'Menunggu Approval', 'Dalam Perjalanan'])->values();

        $absQty = fn (array $d): int => abs((int) ($d['qty_total'] ?? 0));
        $absNilai = fn (array $d): float => round(abs((float) ($d['value_total'] ?? 0)), 2);

        // ---- Ringkasan + MoM ----
        $totalNilai = round($posted->sum($absNilai), 2);
        $totalQty = $posted->sum($absQty);
        $perBulan = [];
        foreach ($posted as $d) {
            $key = $d['document_date']->format('Y-m');
            $perBulan[$key] ??= ['bulan' => $key, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $perBulan[$key]['qty'] += $absQty($d);
            $perBulan[$key]['nilai'] = round($perBulan[$key]['nilai'] + $absNilai($d), 2);
            $perBulan[$key]['dokumen']++;
        }
        ksort($perBulan);
        $perBulan = array_values($perBulan);

        // ---- Agregat per pihak ----
        $aggPihak = [];
        $aggPihakBulan = [];
        foreach ($posted as $d) {
            $t = $d['_pihak'];
            $key = $pihakKey($t);
            $aggPihak[$key] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggPihak[$key]['qty'] += $absQty($d);
            $aggPihak[$key]['nilai'] = round($aggPihak[$key]['nilai'] + $absNilai($d), 2);
            $aggPihak[$key]['dokumen']++;

            $bulan = $d['document_date']->format('Y-m');
            $bk = $key.'|'.$bulan;
            $aggPihakBulan[$bk] ??= ['jenis' => $t['jenis'], 'id' => $t['id'], 'nama' => $t['nama'], 'bulan' => $bulan, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
            $aggPihakBulan[$bk]['qty'] += $absQty($d);
            $aggPihakBulan[$bk]['nilai'] = round($aggPihakBulan[$bk]['nilai'] + $absNilai($d), 2);
            $aggPihakBulan[$bk]['dokumen']++;
        }
        $sortedPihak = collect(array_values($aggPihak))->sortByDesc('nilai')->values()->all();
        $topPihak = TransaksiAnalytics::pareto($sortedPihak, 'nilai', $totalNilai);
        $perPihakBulan = collect(array_values($aggPihakBulan))->sortBy([['bulan', 'asc'], ['nilai', 'desc']])->values()->all();

        // ---- Retur: tertaut vs tanpa sumber + alasan + per item (RP & RJ) ----
        $retur = null;
        if (in_array($type, ['Retur Pembelian', 'Retur Penjualan'], true)) {
            $tertautQty = 0;
            $tertautNilai = 0.0;
            $bebasQty = 0;
            $bebasNilai = 0.0;
            $perAlasan = [];
            $perItem = [];
            foreach ($posted as $r) {
                $q = $absQty($r);
                $n = $absNilai($r);
                if ($r['source_document_id']) {
                    $tertautQty += $q;
                    $tertautNilai = round($tertautNilai + $n, 2);
                } else {
                    $bebasQty += $q;
                    $bebasNilai = round($bebasNilai + $n, 2);
                }
                $alasan = TransaksiAnalytics::parseAlasan($r['note']);
                $perAlasan[$alasan] ??= ['alasan' => $alasan, 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
                $perAlasan[$alasan]['qty'] += $q;
                $perAlasan[$alasan]['nilai'] = round($perAlasan[$alasan]['nilai'] + $n, 2);
                $perAlasan[$alasan]['dokumen']++;
            }
            $postedIds = $posted->pluck('id');
            if ($postedIds->isNotEmpty()) {
                $rows = StockDocumentLine::query()->whereIn('document_id', $postedIds)
                    ->selectRaw('item_id, SUM(ABS(qty)) as qty, SUM(ABS(qty) * unit_cost) as nilai')
                    ->groupBy('item_id')
                    ->orderByDesc(DB::raw('SUM(ABS(qty) * unit_cost)'))
                    ->limit(10)
                    ->get();
                $items = Item::with('unit')->whereIn('id', $rows->pluck('item_id'))->get()->keyBy('id');
                foreach ($rows as $row) {
                    $it = $items->get($row->item_id);
                    $perItem[] = [
                        'item_id' => (int) $row->item_id,
                        'sku' => $it?->sku,
                        'nama' => $it?->name ?? "Item #{$row->item_id}",
                        'satuan' => $it?->unit?->name,
                        'qty' => (int) $row->qty,
                        'nilai' => round((float) $row->nilai, 2),
                    ];
                }
            }
            // Rate vs dokumen lawan arah periode sama (Penerimaan utk RP, Pengeluaran utk RJ).
            $lawan = $type === 'Retur Pembelian' ? 'Penerimaan' : 'Pengeluaran';
            $lawanQty = (int) abs((float) StockDocument::query()
                ->join('stock_document_lines', 'stock_document_lines.document_id', '=', 'stock_documents.id')
                ->where('stock_documents.type', $lawan)
                ->where('stock_documents.status', 'Selesai')
                ->whereBetween('stock_documents.document_date', [$from, $to])
                ->when($warehouseId !== null, fn ($q) => $q->where('stock_documents.warehouse_id', $warehouseId))
                ->sum(DB::raw('stock_document_lines.qty')));
            $retur = [
                'tertaut_qty' => $tertautQty,
                'tertaut_nilai' => $tertautNilai,
                'tanpa_sumber_qty' => $bebasQty,
                'tanpa_sumber_nilai' => $bebasNilai,
                'rate_qty' => $lawanQty > 0 ? round(($tertautQty + $bebasQty) / $lawanQty * 100, 2) : 0,
                'per_alasan' => collect(array_values($perAlasan))->sortByDesc('nilai')->values()->all(),
                'per_item' => $perItem,
            ];
        }

        // ---- Varians harga beli per supplier (khusus Penerimaan) ----
        $variansHarga = null;
        if ($type === 'Penerimaan') {
            $postedIds = $posted->pluck('id');
            $variansHarga = [];
            if ($postedIds->isNotEmpty()) {
                // Fase 2.3: agregat per (partner, item) di SQL — dulu load SEMUA
                // baris sebagai model Eloquent lalu fold di PHP (bom memori
                // terbesar endpoint ini). Pemetaan partner→supplier tetap via
                // $matchSupplier di PHP agar semantik name-match identik
                // (untuk Penerimaan, klasifikasi dokumen = matchSupplier(partner)).
                $grouped = [];
                foreach (array_chunk($postedIds->all(), 1000) as $chunk) {
                    $rows = StockDocumentLine::query()->whereIn('document_id', $chunk)
                        ->join('stock_documents', 'stock_documents.id', '=', 'stock_document_lines.document_id')
                        ->selectRaw('stock_documents.partner as partner, stock_document_lines.item_id as item_id, SUM(ABS(stock_document_lines.qty)) as qty, SUM(ABS(stock_document_lines.qty) * stock_document_lines.unit_cost) as nilai')
                        ->groupBy('stock_documents.partner', 'stock_document_lines.item_id')
                        ->get();
                    foreach ($rows as $r) {
                        $gk = ($r->partner ?? '').'|'.$r->item_id;
                        $grouped[$gk] ??= ['partner' => $r->partner, 'item_id' => (int) $r->item_id, 'qty' => 0, 'nilai' => 0.0];
                        $grouped[$gk]['qty'] += (int) $r->qty;
                        $grouped[$gk]['nilai'] += (float) $r->nilai;
                    }
                }
                $itemMaster = collect();
                foreach (array_chunk(collect($grouped)->pluck('item_id')->unique()->values()->all(), 5000) as $chunk) {
                    if ($chunk === []) {
                        continue;
                    }
                    foreach (Item::whereIn('id', $chunk)->get()->keyBy('id') as $id => $it) {
                        $itemMaster[$id] = $it;
                    }
                }
                $agg = [];
                foreach ($grouped as $g) {
                    $t = $matchSupplier($g['partner']);
                    $k = $pihakKey($t).'|'.$g['item_id'];
                    $agg[$k] ??= ['jenis' => $t['jenis'], 'supplier_id' => $t['id'], 'supplier' => $t['nama'], 'item_id' => (int) $g['item_id'], 'qty' => 0, 'nilai' => 0.0];
                    $agg[$k]['qty'] += $g['qty'];
                    $agg[$k]['nilai'] = round($agg[$k]['nilai'] + $g['nilai'], 2);
                }
                foreach ($agg as $row) {
                    $master = $itemMaster->get($row['item_id']);
                    $avgHarga = $row['qty'] > 0 ? round($row['nilai'] / $row['qty'], 2) : 0;
                    $masterCost = $master ? (float) $master->cost : 0;
                    $variansHarga[] = [
                        'supplier' => $row['supplier'],
                        'supplier_id' => $row['supplier_id'],
                        'item_id' => $row['item_id'],
                        'sku' => $master?->sku,
                        'nama' => $master?->name ?? "Item #{$row['item_id']}",
                        'qty' => $row['qty'],
                        'avg_harga' => $avgHarga,
                        'master_cost' => $masterCost,
                        'varians_pct' => $masterCost > 0 ? round(($avgHarga - $masterCost) / $masterCost * 100, 1) : null,
                    ];
                }
                usort($variansHarga, fn ($x, $y) => abs($y['varians_pct'] ?? 0) <=> abs($x['varians_pct'] ?? 0));
                $variansHarga = array_slice($variansHarga, 0, 20);
            }
        }

        // ---- Arus gudang (khusus Transfer): lane + net flow ----
        $arus = null;
        if ($type === 'Transfer Gudang') {
            $lanes = [];
            $net = [];
            foreach ($posted as $d) {
                $fromId = $d['warehouse_id'] !== null ? (int) $d['warehouse_id'] : null;
                $fromName = $d['warehouse_name'] ?? '—';
                $t = $d['_pihak'];
                $lk = ($fromId ?? 'null').'|'.($t['id'] ?? 'null');
                $lanes[$lk] ??= ['from_id' => $fromId, 'dari' => $fromName, 'to_id' => $t['id'], 'ke' => $t['nama'], 'qty' => 0, 'nilai' => 0.0, 'dokumen' => 0];
                $lanes[$lk]['qty'] += $absQty($d);
                $lanes[$lk]['nilai'] = round($lanes[$lk]['nilai'] + $absNilai($d), 2);
                $lanes[$lk]['dokumen']++;
                $net[$fromId ?? 0] ??= ['warehouse_id' => $fromId, 'nama' => $fromName, 'keluar' => 0, 'masuk' => 0];
                $net[$fromId ?? 0]['keluar'] += $absQty($d);
                $net[$t['id'] ?? 0] ??= ['warehouse_id' => $t['id'], 'nama' => $t['nama'], 'keluar' => 0, 'masuk' => 0];
                $net[$t['id'] ?? 0]['masuk'] += $absQty($d);
            }
            $arus = [
                'lanes' => collect(array_values($lanes))->sortByDesc('qty')->values()->all(),
                'net' => collect(array_values($net))->map(fn ($r) => $r + ['net' => $r['masuk'] - $r['keluar']])->sortBy('net')->values()->all(),
            ];
        }

        // ---- Aktivitas pihak ----
        // Fase 2.3: satu pass O(T) seperti aktivitas tujuan di keluarAnalytics.
        $terakhirPerPihak = [];
        foreach ($posted as $d) {
            $k = $pihakKey($d['_pihak']);
            $tgl = $d['document_date'];
            if (! isset($terakhirPerPihak[$k]) || $tgl->gt($terakhirPerPihak[$k])) {
                $terakhirPerPihak[$k] = $tgl;
            }
        }
        $aktivitas = [];
        foreach ($aggPihak as $key => $ap) {
            $last = $terakhirPerPihak[$key] ?? null;
            $days = $last ? $to->diffInDays($last, true) : null;
            $aktivitas[] = [
                'jenis' => $ap['jenis'],
                'id' => $ap['id'],
                'nama' => $ap['nama'],
                'dokumen' => $ap['dokumen'],
                'nilai' => $ap['nilai'],
                'terakhir' => $last ? $last->toDateString() : null,
                'hari_sejak_terakhir' => $days !== null ? (int) floor($days) : null,
                'status' => $ap['dokumen'] <= 1 ? 'baru' : (($days !== null && $days > $atRiskDays) ? 'at-risk' : 'aktif'),
            ];
        }
        usort($aktivitas, fn ($a, $b) => $b['nilai'] <=> $a['nilai']);

        // ---- Kecepatan proses ----
        $leadDays = [];
        foreach ($posted as $d) {
            if ($d['posted_at'] && $d['document_date']) {
                $leadDays[] = max(0, $d['document_date']->diffInDays($d['posted_at'], true));
            }
        }
        sort($leadDays);
        $aging = ['0-7 hari' => ['count' => 0, 'nilai' => 0.0], '8-30 hari' => ['count' => 0, 'nilai' => 0.0], '>30 hari' => ['count' => 0, 'nilai' => 0.0]];
        $tertahanNilai = 0.0;
        foreach ($tertahan as $d) {
            $n = $absNilai($d);
            $tertahanNilai = round($tertahanNilai + $n, 2);
            $bucket = TransaksiAnalytics::agingBucket((int) floor($to->diffInDays($d['document_date'], true)));
            $aging[$bucket]['count']++;
            $aging[$bucket]['nilai'] = round($aging[$bucket]['nilai'] + $n, 2);
        }

        return response()->json(['data' => [
            'type' => $type,
            'periode' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'ringkasan' => [
                'nilai' => $totalNilai,
                'qty' => $totalQty,
                'dokumen' => $posted->count(),
                'rata_nilai' => $posted->count() > 0 ? round($totalNilai / $posted->count(), 2) : 0,
                'mom' => TransaksiAnalytics::mom($perBulan),
            ],
            'per_bulan' => $perBulan,
            'per_pihak_per_bulan' => collect(array_values($aggPihakBulan))->sortBy([['bulan', 'asc'], ['nilai', 'desc']])->values()->all(),
            'top_pihak' => array_slice($topPihak, 0, 10),
            'retur' => $retur,
            'varians_harga' => $variansHarga,
            'arus' => $arus,
            'aktivitas' => $aktivitas,
            'proses' => [
                'lead_median_hari' => $leadDays !== [] ? round($leadDays[(int) floor((count($leadDays) - 1) / 2)], 1) : null,
                'lead_avg_hari' => $leadDays !== [] ? round(array_sum($leadDays) / count($leadDays), 1) : null,
                'tertahan_dokumen' => $tertahan->count(),
                'tertahan_nilai' => $tertahanNilai,
                'aging' => array_map(fn ($k, $v) => ['rentang' => $k, 'dokumen' => $v['count'], 'nilai' => $v['nilai']], array_keys($aging), array_values($aging)),
            ],
        ]]);
    }
}
