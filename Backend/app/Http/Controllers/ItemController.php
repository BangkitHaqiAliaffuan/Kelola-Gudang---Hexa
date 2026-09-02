<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkItemDeleteRequest;
use App\Http\Requests\BulkItemStatusRequest;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\ProcDocLine;
use App\Models\StockDocumentLine;
use App\Models\WorkOrder;
use App\Support\CodeGenerator;
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
        } catch (\Illuminate\Database\QueryException $e) {
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
        } catch (\Illuminate\Database\QueryException $e) {
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
        ], 200);
    }

    public function bulkImport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.sku' => ['required', 'string', 'max:30'],
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
            'items.*.action' => ['required', 'string', 'in:create,update'],
        ]);

        // Row-level: at least one of id or name must exist for category/brand/unit
        $rowErrors = [];
        foreach ($data['items'] as $index => $row) {
            if (empty($row['category_id']) && empty($row['category_name'])) {
                $rowErrors[$index] = 'Kategori wajib diisi (category_id atau category_name).';
            }
        }
        if (!empty($rowErrors)) {
            return response()->json(['message' => 'Validasi gagal.', 'errors' => $rowErrors], 422);
        }

        // Resolve name→id maps (dedupe + create in one pass per entity type)
        $catMap = [];
        $merkMap = [];
        $unitMap = [];
        $created = 0;
        $updated = 0;
        $errors = [];

        DB::beginTransaction();

        try {
            // Resolve categories
            foreach ($data['items'] as $row) {
                $id = $row['category_id'] ?? null;
                $name = trim($row['category_name'] ?? '');
                if ($id) {
                    $catMap[(string) $id] = (int) $id;
                } elseif ($name !== '' && !isset($catMap[strtolower($name)])) {
                    $existing = \App\Models\Category::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $catMap[strtolower($name)] = $existing->id;
                    } else {
                        $cat = \App\Models\Category::create([
                            'code' => \App\Support\CodeGenerator::next(\App\Models\Category::class, 'KAT'),
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
                } elseif ($name !== '' && !isset($merkMap[strtolower($name)])) {
                    $existing = \App\Models\Merk::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $merkMap[strtolower($name)] = $existing->id;
                    } else {
                        $merk = \App\Models\Merk::create([
                            'code' => \App\Support\CodeGenerator::next(\App\Models\Merk::class, 'MRK'),
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
                } elseif ($name !== '' && !isset($unitMap[strtolower($name)])) {
                    $existing = \App\Models\Unit::whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                    if ($existing) {
                        $unitMap[strtolower($name)] = $existing->id;
                    } else {
                        $unit = \App\Models\Unit::create([
                            'code' => \App\Support\CodeGenerator::next(\App\Models\Unit::class, 'UNT'),
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
                if (!$catId && !empty($row['category_name'])) {
                    $catId = $catMap[strtolower(trim($row['category_name']))] ?? null;
                }

                // Resolve brand_id
                $brandId = $row['brand_id'] ?? null;
                if (!$brandId && !empty($row['brand_name'])) {
                    $brandId = $merkMap[strtolower(trim($row['brand_name']))] ?? null;
                }

                // Resolve unit_id
                $unitId = $row['unit_id'] ?? null;
                if (!$unitId && !empty($row['unit_name'])) {
                    $unitId = $unitMap[strtolower(trim($row['unit_name']))] ?? null;
                }

                // Row-level: category must resolve
                if (!$catId) {
                    $errors[$index] = "Kategori '" . ($row['category_name'] ?? '') . "' tidak ditemukan.";
                    continue;
                }

                $payload = collect($row)
                    ->except(['action', 'category_name', 'brand_name', 'unit_name'])
                    ->filter()
                    ->toArray();
                $payload['category_id'] = $catId;
                if ($brandId) $payload['brand_id'] = $brandId;
                if ($unitId) $payload['unit_id'] = $unitId;

                try {
                    if ($action === 'update') {
                        $existing = Item::where('sku', $sku)->first();
                        if (!$existing) {
                            $errors[$index] = "SKU '{$sku}' tidak ditemukan untuk update.";
                            continue;
                        }
                        $existing->update($payload);
                        $updated++;
                    } else {
                        if (Item::where('sku', $sku)->exists()) {
                            $errors[$index] = "SKU '{$sku}' sudah ada.";
                            continue;
                        }
                        $payload['internal_barcode'] = $payload['internal_barcode']
                            ?? \App\Support\CodeGenerator::next(Item::class, 'IB', 'internal_barcode');
                        Item::create($payload);
                        $created++;
                    }
                } catch (\Exception $e) {
                    $errors[$index] = "Baris " . ($index + 1) . ": " . $e->getMessage();
                }
            }

            DB::commit();

            return response()->json([
                'message' => "{$created} barang ditambahkan, {$updated} barang diperbarui.",
                'created' => $created,
                'updated' => $updated,
                'errors' => $errors,
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }
}
