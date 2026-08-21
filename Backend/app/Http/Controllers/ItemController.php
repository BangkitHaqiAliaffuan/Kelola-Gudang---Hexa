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
}
