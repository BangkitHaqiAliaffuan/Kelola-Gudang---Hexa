<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkItemDeleteRequest;
use App\Http\Requests\BulkItemImportRequest;
use App\Http\Requests\BulkItemStatusRequest;
use App\Http\Requests\CostDriftRequest;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\SyncItemCostRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\Item;
use App\Models\Merk;
use App\Models\ProcDocLine;
use App\Models\StockDocumentLine;
use App\Models\SubCategory;
use App\Models\Unit;
use App\Models\WorkOrder;
use App\Support\CodeGenerator;
use App\Support\WarehouseScope;
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

        // Filter Fase 4 (server pagination halaman Barang): sub-kategori
        // (FK nullable) + merk (`brand_id` menyimpan id merk sebagai string).
        if ($subCategoryId = $request->query('sub_category_id')) {
            $query->where('sub_category_id', $subCategoryId);
        }

        if ($brandId = $request->query('brand_id')) {
            $query->where('brand_id', $brandId);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $query->orderBy('name');

        $request->validate([
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'sub_category_id' => ['nullable', 'integer', 'exists:sub_categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:merks,id'],
        ]);

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
        // F7.3: query builder bypass global scope — batasi manual.
        $allowed = WarehouseScope::effectiveIdsFor($request->user());

        $avgs = DB::table('item_stock')
            ->join('items', 'items.id', '=', 'item_stock.item_id')
            ->when($allowed !== null, fn ($q) => $q->whereIn('item_stock.warehouse_id', $allowed))
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
    public function syncCost(SyncItemCostRequest $request): JsonResponse
    {
        $applied = [];
        // F7.3: query builder bypass global scope — batasi manual.
        $allowed = WarehouseScope::effectiveIdsFor($request->user());
        $items = Item::whereIn('id', $request->validated('ids'))->get();
        foreach ($items as $item) {
            $agg = DB::table('item_stock')
                ->where('item_id', $item->id)
                ->when($allowed !== null, fn ($q) => $q->whereIn('item_stock.warehouse_id', $allowed))
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

    public function bulkImport(BulkItemImportRequest $request): JsonResponse
    {
        $data = $request->validated();

        // Auto-generate SKU kosong (format A SKU-10001-001 series) + block duplikat intra-file.
        //
        // PENTING: transaksi DIBUKA SEBELUM advisory lock. `pg_advisory_xact_lock`
        // bersifat transaction-scoped — bila diambil dalam mode autocommit (tanpa
        // transaksi aktif) lock langsung dilepas pada statement yang sama sehingga
        // TIDAK menyerialkan read-modify-write SKU antar-import paralel (dulu bug:
        // dua import bersamaan bisa menghasilkan SKU duplikat). Transaksi mengapit
        // seluruh blok agar lock benar-benar tertahan sampai commit/rollback.
        DB::beginTransaction();

        try {
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
                DB::rollBack();

                return response()->json(['message' => 'Validasi gagal.', 'errors' => $rowErrors], 422);
            }
            $rowErrors = [];
            foreach ($data['items'] as $index => $row) {
                if (empty($row['category_id']) && empty($row['category_name'])) {
                    $rowErrors[$index] = 'Kategori wajib diisi (category_id atau category_name).';
                }
            }
            if (! empty($rowErrors)) {
                DB::rollBack();

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

                // Row-level: sub-kategori harus milik kategori ter-resolve
                // (aturan exists polos di atas tidak men-scope ke kategori,
                // tidak seperti StoreItemRequest).
                $subId = $row['sub_category_id'] ?? null;
                if ($subId && ! SubCategory::where('id', $subId)->where('category_id', $catId)->exists()) {
                    $subName = SubCategory::where('id', $subId)->value('name') ?? $subId;
                    $catName = Category::where('id', $catId)->value('name') ?? $catId;
                    $errors[$index] = "Sub Kategori '{$subName}' bukan bagian dari Kategori '{$catName}'.";

                    continue;
                }

                $payload = collect($row)
                    ->except(['action', 'category_name', 'brand_name', 'unit_name'])
                    // Hanya buang null/string kosong — nilai falsy valid (0)
                    // harus lolos (filter() polos akan menghapus min_stock: 0).
                    ->reject(fn ($v) => $v === null || $v === '')
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
                } catch (QueryException $e) {
                    report($e);
                    $errors[$index] = $this->friendlyImportDbError($e, $index, $sku);
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

    /**
     * Pesan DB-error spesifik per baris import (bukan "gagal disimpan" generik).
     * Menyebut constraint/relasi pelanggar agar operator tahu yang harus dibetulkan.
     */
    private function friendlyImportDbError(QueryException $e, int $index, string $sku): string
    {
        $rowLabel = 'Baris '.($index + 1)." (SKU '{$sku}')";
        $msg = $e->getMessage();

        if (
            str_contains($msg, 'items_sku_unique')
            || preg_match('/duplicate key value[^;]*"sku"/i', $msg) === 1
        ) {
            return "{$rowLabel}: SKU sudah dipakai barang lain (terdaftar saat import berjalan).";
        }

        if (
            str_contains($msg, 'items_internal_barcode_unique')
            || preg_match('/duplicate key value[^;]*"internal_barcode"/i', $msg) === 1
        ) {
            return "{$rowLabel}: barcode internal bentrok dengan barang lain.";
        }

        if (preg_match('/foreign key constraint "items_(\w+)_foreign"/', $msg, $m) === 1) {
            $labels = [
                'category_id' => 'Kategori',
                'sub_category_id' => 'Sub Kategori',
                'brand_id' => 'Merk',
                'unit_id' => 'Satuan',
                'preferred_supplier_id' => 'Supplier',
                'default_warehouse_id' => 'Gudang Default',
                'default_rack_id' => 'Rak Default',
                'default_bin_id' => 'Bin Default',
            ];
            $label = $labels[$m[1]] ?? $m[1];

            return "{$rowLabel}: {$label} tidak valid (data master berubah saat import berjalan).";
        }

        return "{$rowLabel}: gagal disimpan (kemungkinan data duplikat/tidak valid).";
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
