<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkItemDeleteRequest;
use App\Http\Requests\BulkItemStatusRequest;
use App\Http\Requests\CostDriftRequest;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\Item;
use App\Models\Merk;
use App\Models\ProcDocLine;
use App\Models\StockDocumentLine;
use App\Models\Unit;
use App\Models\WorkOrder;
use App\Support\CodeGenerator;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $query = Item::query()->with(['category', 'subCategory', 'brand', 'unit', 'warehouse', 'rack', 'bin', 'supplier']);

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(sku) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(barcode) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(internal_barcode) LIKE ?', ["%{$needle}%"]);
            });
        }

        if ($categoryId = $request->query('category_id')) {
            $query->where('category_id', $categoryId);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $query->orderBy('name');

        $items = $query->paginate((int) $request->query('per_page', 20));

        return ItemResource::collection($items);
    }

    /**
     * Resolusi scan barcode server-side (fallback bila daftar lokal frontend
     * tidak cocok, mis. katalog > PER_PAGE). Exact match prioritas:
     * internal_barcode > barcode produk > sku. Barcode produk boleh dipakai
     * banyak barang → kembalikan array kandidat + match_source per kandidat;
     * frontend menampilkan dialog disambiguasi bila >1.
     */
    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:60']]);
        $needle = mb_strtolower(trim($data['code']));

        if ($needle === '') {
            return response()->json(['data' => []]);
        }

        $items = Item::query()
            ->with(['category', 'subCategory', 'brand', 'unit', 'warehouse', 'rack', 'bin', 'supplier'])
            ->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(internal_barcode) = ?', [$needle])
                    ->orWhereRaw('LOWER(barcode) = ?', [$needle])
                    ->orWhereRaw('LOWER(sku) = ?', [$needle]);
            })
            ->orderBy('name')
            ->limit(20)
            ->get();

        $rank = ['internal' => 0, 'produk' => 1, 'sku' => 2];
        $rows = $items
            ->map(function (Item $item) use ($needle) {
                if (mb_strtolower((string) $item->internal_barcode) === $needle) {
                    $source = 'internal';
                } elseif (mb_strtolower((string) $item->barcode) === $needle) {
                    $source = 'produk';
                } else {
                    $source = 'sku';
                }

                return ['item' => $item, 'source' => $source];
            })
            ->sortBy(fn ($row) => $rank[$row['source']].'|'.$row['item']->name)
            ->values();

        return response()->json([
            'data' => $rows->map(fn ($row) => array_merge(
                (new ItemResource($row['item']))->toArray($request),
                ['match_source' => $row['source']]
            ))->values(),
        ]);
    }

    public function store(StoreItemRequest $request): ItemResource
    {
        $data = $request->validated();
        $data['stock'] = $data['stock'] ?? 0;
        $data['reserved'] = $data['reserved'] ?? 0;

        $item = DB::transaction(function () use ($data) {
            $data['internal_barcode'] = $data['internal_barcode']
                ?? CodeGenerator::next(Item::class, 'IB', 'internal_barcode');

            return Item::create($data);
        });

        return new ItemResource($item->load(['category', 'subCategory', 'brand', 'unit', 'warehouse', 'rack', 'bin', 'supplier']));
    }

    public function show(Item $item): ItemResource
    {
        return new ItemResource($item->load(['category', 'subCategory', 'brand', 'unit', 'warehouse', 'rack', 'bin', 'supplier']));
    }

    public function update(UpdateItemRequest $request, Item $item): ItemResource
    {
        $item->update($request->validated());

        return new ItemResource($item->fresh()->load(['category', 'subCategory', 'brand', 'unit', 'warehouse', 'rack', 'bin']));
    }

    public function destroy(Item $item): JsonResponse
    {
        if (WorkOrder::where('item_id', $item->id)->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena masih digunakan oleh work order.',
            ], 422);
        }

        if (StockDocumentLine::where('item_id', $item->id)->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena memiliki riwayat transaksi stock (mutasi/dokumen persediaan).',
            ], 422);
        }

        if (ProcDocLine::where('item_id', $item->id)->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena masih digunakan pada dokumen pengadaan (PR/PO).',
            ], 422);
        }

        try {
            $item->delete();
        } catch (QueryException $e) {
            if ((int) ($e->getCode()) === 23001 || str_contains($e->getMessage(), 'stock_document_lines')) {
                return response()->json([
                    'message' => 'Barang tidak dapat dihapus karena masih memiliki riwayat transaksi stock.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Barang berhasil dihapus.'], 200);
    }

    public function bulkDestroy(BulkItemDeleteRequest $request): JsonResponse
    {
        $ids = $request->validated('ids');

        $inUse = WorkOrder::whereIn('item_id', $ids)->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena masih digunakan oleh work order.',
            ], 422);
        }

        if (StockDocumentLine::whereIn('item_id', $ids)->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena memiliki riwayat transaksi stock (mutasi/dokumen persediaan).',
            ], 422);
        }

        if (ProcDocLine::whereIn('item_id', $ids)->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena masih digunakan pada dokumen pengadaan (PR/PO).',
            ], 422);
        }

        try {
            $deleted = Item::whereIn('id', $ids)->delete();
        } catch (QueryException $e) {
            if ((int) ($e->getCode()) === 23001 || str_contains($e->getMessage(), 'stock_document_lines')) {
                return response()->json([
                    'message' => 'Barang tidak dapat dihapus karena memiliki riwayat transaksi stock.',
                ], 422);
            }
            throw $e;
        }

        return response()->json([
            'message' => "{$deleted} barang berhasil dihapus.",
            'deleted' => $deleted,
        ], 200);
    }

    public function bulkUpdateStatus(BulkItemStatusRequest $request): JsonResponse
    {
        $status = $request->validated('status');
        $updated = Item::whereIn('id', $request->validated('ids'))
            ->where('status', '!=', $status)
            ->update(['status' => $status]);

        return response()->json([
            'message' => "Status {$updated} barang diperbarui.",
            'updated' => $updated,
        ]);
    }

    /**
     * Drift Harga Pokok: selisih Harga Pokok master vs rata-rata berjalan
     * ledger (tertimbang qty lintas gudang+bin, termasuk lantai). Dasar agenda
     * review periodik agar master tidak basi seperti kasus BK/2026/01852.
     * Read-only; perubahan dilakukan via syncCost (dicatat old/new per item).
     */
    public function costDrift(CostDriftRequest $request): JsonResponse
    {
        $data = $request->validated();
        $threshold = (float) ($data['threshold_pct'] ?? 10);

        $avgs = DB::table('item_stock')
            ->join('items', 'items.id', '=', 'item_stock.item_id')
            ->groupBy('item_stock.item_id', 'items.sku', 'items.name', 'items.cost')
            ->havingRaw('SUM(item_stock.stock) > 0')
            ->selectRaw(
                'item_stock.item_id as item_id,
                 items.sku as sku,
                 items.name as name,
                 items.cost as master_cost,
                 SUM(item_stock.stock) as stock,
                 SUM(item_stock.stock * item_stock.unit_cost_avg) / SUM(item_stock.stock) as avg_cost'
            )
            ->when(! empty($data['search'] ?? null), function ($q) use ($data) {
                $needle = strtolower((string) $data['search']);
                $q->where(function ($w) use ($needle) {
                    $w->whereRaw('LOWER(items.name) LIKE ?', ["%{$needle}%"])
                        ->orWhereRaw('LOWER(items.sku) LIKE ?', ["%{$needle}%"]);
                });
            })
            ->get()
            ->map(function ($r) {
                $avg = round((float) $r->avg_cost, 2);
                $master = (float) $r->master_cost;
                $drift = $master > 0 ? round(($avg - $master) / $master * 100, 1) : null;

                return [
                    'item_id' => (int) $r->item_id,
                    'sku' => $r->sku,
                    'name' => $r->name,
                    'master_cost' => $master,
                    'avg_cost' => $avg,
                    'stock' => (int) $r->stock,
                    'drift_pct' => $drift,
                ];
            })
            ->filter(fn ($r) => $r['drift_pct'] !== null && abs($r['drift_pct']) >= $threshold)
            ->sortByDesc(fn ($r) => abs($r['drift_pct']))
            ->values();

        return response()->json(['data' => $avgs]);
    }

    /**
     * Selaraskan Harga Pokok master ke rata-rata berjalan ledger untuk ids
     * terpilih. Mengembalikan old/new per item sebagai jejak (siapa/kapan
     * tercatat di log aplikasi oleh pemanggil bila perlu).
     */
    public function syncCost(BulkItemDeleteRequest $request): JsonResponse
    {
        $applied = [];
        $items = Item::whereIn('id', $request->validated('ids'))->get();
        foreach ($items as $item) {
            $agg = DB::table('item_stock')
                ->where('item_id', $item->id)
                ->selectRaw('SUM(stock) as stock, SUM(stock * unit_cost_avg) as value')
                ->first();
            if (! $agg || (int) $agg->stock <= 0) {
                continue;
            }
            $avg = round((float) $agg->value / (int) $agg->stock, 2);
            if (abs($avg - (float) $item->cost) < 0.01) {
                continue;
            }
            $old = (float) $item->cost;
            $item->update(['cost' => $avg]);
            $applied[] = ['item_id' => $item->id, 'sku' => $item->sku, 'old_cost' => $old, 'new_cost' => $avg];
        }

        return response()->json([
            'message' => 'Harga Pokok '.count($applied).' barang diselaraskan ke rata-rata berjalan.',
            'applied' => $applied,
        ]);
    }

    public function bulkImport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.sku' => ['nullable', 'string', 'max:30'],
            'items.*.barcode' => ['nullable', 'string', 'max:30'],
            'items.*.name' => ['required', 'string', 'max:200'],
            'items.*.category_id' => ['nullable', 'integer'],
            'items.*.category_name' => ['nullable', 'string', 'max:150'],
            'items.*.sub_category_id' => ['nullable', 'integer', 'exists:sub_categories,id'],
            'items.*.brand_id' => ['nullable', 'integer'],
            'items.*.brand_name' => ['nullable', 'string', 'max:150'],
            'items.*.unit_id' => ['nullable', 'integer'],
            'items.*.unit_name' => ['nullable', 'string', 'max:50'],
            'items.*.preferred_supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'items.*.default_warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'items.*.default_rack_id' => ['nullable', 'integer', 'exists:racks,id'],
            'items.*.default_bin_id' => ['nullable', 'integer', 'exists:bins,id'],
            'items.*.cost' => ['required', 'numeric', 'min:100'],
            'items.*.price' => ['required', 'numeric', 'min:100'],
            'items.*.min_stock' => ['required', 'integer', 'min:0'],
            'items.*.max_stock' => ['nullable', 'integer', 'min:0'],
            'items.*.lead_time' => ['nullable', 'integer', 'min:0'],
            'items.*.weight' => ['nullable', 'numeric', 'min:0'],
            'items.*.dimension' => ['nullable', 'string', 'max:60'],
            'items.*.status' => ['required', 'string', 'in:Aktif,Nonaktif'],
            'items.*.action' => ['required', 'string', 'in:create'],
        ]);

        // Auto-generate SKU kosong (format A SKU-10001-001 series) + block duplikat intra-file
        DB::selectOne('SELECT pg_advisory_xact_lock(hashtext(?))', ['code:items:sku:SKU']);
        $allSeen = [];
        foreach (Item::pluck('sku') as $s) {
            $allSeen[strtoupper(trim($s))] = true;
        }
        $firstOcc = [];
        foreach (array_keys($allSeen) as $k) {
            $firstOcc[$k] = ['idx' => -1, 'name' => 'database'];
        }
        $rowErrors = [];
        foreach ($data['items'] as $idx => &$row) {
            $sku = trim($row['sku'] ?? '');
            $name = trim($row['name'] ?? 'tanpa nama');
            if ($sku === '') {
                $sku = $this->nextSkuSeries($allSeen);
                $row['sku'] = $sku;
            }
            $upper = strtoupper($sku);
            if (isset($allSeen[$upper])) {
                $first = $firstOcc[$upper];
                $firstLabel = $first['idx'] >= 0 ? 'baris '.($first['idx'] + 1)." ('{$first['name']}')" : 'database';
                $rowErrors[$idx] = "SKU '{$sku}' duplikat di file dengan {$firstLabel} — barang '{$name}' baris ".($idx + 1);
            }
            if (! isset($firstOcc[$upper])) {
                $firstOcc[$upper] = ['idx' => $idx, 'name' => $name];
            }
            $allSeen[$upper] = true;
        }
        unset($row);
        if (! empty($rowErrors)) {
            return response()->json(['message' => 'Validasi gagal.', 'errors' => $rowErrors], 422);
        }
        $rowErrors = [];
        foreach ($data['items'] as $index => $row) {
            if (empty($row['category_id']) && empty($row['category_name'])) {
                $rowErrors[$index] = 'Kategori wajib diisi (category_id atau category_name).';
            }
        }
        if (! empty($rowErrors)) {
            return response()->json(['message' => 'Validasi gagal.', 'errors' => $rowErrors], 422);
        }

        // Resolve name→id maps (dedupe + create in one pass per entity type)
        $catMap = [];
        $merkMap = [];
        $unitMap = [];
        $created = 0;
        $updated = 0;
        $errors = [];

        // Peringatan barcode produk ganda (non-blocking): barcode kemasan boleh
        // sama di banyak barang — laporkan agar operator sadar, jangan gagalkan.
        $warnings = [];
        $fileCodes = [];
        foreach ($data['items'] as $idx => $row) {
            $code = trim((string) ($row['barcode'] ?? ''));
            if ($code !== '') {
                $fileCodes[mb_strtoupper($code)][] = $idx;
            }
        }
        $dbByUpper = collect();
        if ($fileCodes !== []) {
            $uppers = array_keys($fileCodes);
            $placeholders = implode(',', array_fill(0, count($uppers), '?'));
            $dbByUpper = Item::whereRaw("UPPER(barcode) IN ({$placeholders})", $uppers)
                ->get(['id', 'name', 'sku', 'barcode'])
                ->groupBy(fn ($it) => mb_strtoupper((string) $it->barcode));
        }
        foreach ($fileCodes as $upper => $idxs) {
            $notes = [];
            if (count($idxs) > 1) {
                $lines = array_map(fn ($i) => 'baris '.($i + 1), $idxs);
                $notes[] = 'duplikat di file ('.implode(', ', $lines).')';
            }
            foreach ($dbByUpper->get($upper, collect()) as $other) {
                $notes[] = "{$other->name} ({$other->sku})";
            }
            if ($notes !== []) {
                foreach ($idxs as $i) {
                    $warnings[$i] = 'Barcode dipakai bersama: '.implode('; ', $notes).'.';
                }
            }
        }

        DB::beginTransaction();

        try {
            // Resolve categories
            foreach ($data['items'] as $row) {
                $id = $row['category_id'] ?? null;
                $name = trim($row['category_name'] ?? '');
                if ($id) {
                    $catMap[(string) $id] = (int) $id;
                } elseif ($name !== '' && ! isset($catMap[strtolower($name)])) {
                    $existing = Category::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $catMap[strtolower($name)] = $existing->id;
                    } else {
                        $cat = Category::create([
                            'code' => CodeGenerator::next(Category::class, 'KAT'),
                            'name' => $name,
                            'is_active' => true,
                        ]);
                        $catMap[strtolower($name)] = $cat->id;
                    }
                }
            }

            // Resolve merks
            foreach ($data['items'] as $row) {
                $id = $row['brand_id'] ?? null;
                $name = trim($row['brand_name'] ?? '');
                if ($id) {
                    $merkMap[(string) $id] = (int) $id;
                } elseif ($name !== '' && ! isset($merkMap[strtolower($name)])) {
                    $existing = Merk::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $merkMap[strtolower($name)] = $existing->id;
                    } else {
                        $merk = Merk::create([
                            'code' => CodeGenerator::next(Merk::class, 'MRK'),
                            'name' => $name,
                            'is_active' => true,
                        ]);
                        $merkMap[strtolower($name)] = $merk->id;
                    }
                }
            }

            // Resolve units
            foreach ($data['items'] as $row) {
                $id = $row['unit_id'] ?? null;
                $name = trim($row['unit_name'] ?? '');
                if ($id) {
                    $unitMap[(string) $id] = (int) $id;
                } elseif ($name !== '' && ! isset($unitMap[strtolower($name)])) {
                    $existing = Unit::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $unitMap[strtolower($name)] = $existing->id;
                    } else {
                        $unit = Unit::create([
                            'code' => CodeGenerator::next(Unit::class, 'UNT'),
                            'name' => $name,
                            'is_active' => true,
                        ]);
                        $unitMap[strtolower($name)] = $unit->id;
                    }
                }
            }

            // Process items
            foreach ($data['items'] as $index => $row) {
                $action = $row['action'];
                $sku = $row['sku'];

                // Resolve category_id
                $catId = $row['category_id'] ?? null;
                if (! $catId && ! empty($row['category_name'])) {
                    $catId = $catMap[strtolower(trim($row['category_name']))] ?? null;
                }

                // Resolve brand_id
                $brandId = $row['brand_id'] ?? null;
                if (! $brandId && ! empty($row['brand_name'])) {
                    $brandId = $merkMap[strtolower(trim($row['brand_name']))] ?? null;
                }

                // Resolve unit_id
                $unitId = $row['unit_id'] ?? null;
                if (! $unitId && ! empty($row['unit_name'])) {
                    $unitId = $unitMap[strtolower(trim($row['unit_name']))] ?? null;
                }

                // Row-level: category must resolve
                if (! $catId) {
                    $errors[$index] = "Kategori '".($row['category_name'] ?? '')."' tidak ditemukan.";

                    continue;
                }

                $payload = collect($row)
                    ->except(['action', 'category_name', 'brand_name', 'unit_name'])
                    ->filter()
                    ->toArray();
                $payload['category_id'] = $catId;
                if ($brandId) {
                    $payload['brand_id'] = $brandId;
                }
                if ($unitId) {
                    $payload['unit_id'] = $unitId;
                }

                try {
                    if (Item::where('sku', $sku)->exists()) {
                        $errors[$index] = "SKU '{$sku}' sudah ada.";

                        continue;
                    }
                    $payload['internal_barcode'] = $payload['internal_barcode']
                        ?? CodeGenerator::next(Item::class, 'IB', 'internal_barcode');
                    Item::create($payload);
                    $created++;
                } catch (\Exception $e) {
                    $errors[$index] = 'Baris '.($index + 1).': '.$e->getMessage();
                }
            }

            DB::commit();

            return response()->json([
                'message' => "{$created} barang ditambahkan, {$updated} barang diperbarui.",
                'created' => $created,
                'updated' => $updated,
                'errors' => $errors,
                'warnings' => $warnings,
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }

    private function nextSkuSeries(array $allSeen): string
    {
        $bestSeries = 10000;
        $bestSeq = 0;
        foreach (array_keys($allSeen) as $code) {
            if (! preg_match('/^SKU-(\d+)-(\d{3})$/', $code, $m)) {
                continue;
            }
            $series = (int) $m[1];
            $seq = (int) $m[2];
            if ($series > $bestSeries || ($series === $bestSeries && $seq > $bestSeq)) {
                $bestSeries = $series;
                $bestSeq = $seq;
            }
        }
        if ($bestSeries === 10000 && $bestSeq === 0) {
            return 'SKU-10001-001';
        }
        if ($bestSeq >= 999) {
            return 'SKU-'.($bestSeries + 1).'-001';
        }

        return 'SKU-'.$bestSeries.'-'.str_pad((string) ($bestSeq + 1), 3, '0', STR_PAD_LEFT);
    }
}
