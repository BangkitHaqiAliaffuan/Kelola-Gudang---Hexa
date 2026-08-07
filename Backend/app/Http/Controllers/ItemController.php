<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkItemDeleteRequest;
use App\Http\Requests\BulkItemStatusRequest;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $query = Item::query()->with(['category', 'subCategory', 'brand', 'unit', 'warehouse']);

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(sku) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(barcode) LIKE ?', ["%{$needle}%"]);
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
        $item = Item::create($data);

        return new ItemResource($item->load(['category', 'subCategory', 'brand', 'unit', 'warehouse']));
    }

    public function show(Item $item): ItemResource
    {
        return new ItemResource($item->load(['category', 'subCategory', 'brand', 'unit', 'warehouse']));
    }

    public function update(UpdateItemRequest $request, Item $item): ItemResource
    {
        $item->update($request->validated());

        return new ItemResource($item->fresh()->load(['category', 'subCategory', 'brand', 'unit', 'warehouse']));
    }

    public function destroy(Item $item): JsonResponse
    {
        $item->delete();

        return response()->json(['message' => 'Barang berhasil dihapus.'], 200);
    }

    public function bulkDestroy(BulkItemDeleteRequest $request): JsonResponse
    {
        $deleted = Item::whereIn('id', $request->validated('ids'))->delete();

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
