<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWarehouseRequest;
use App\Http\Requests\UpdateWarehouseRequest;
use App\Http\Resources\WarehouseResource;
use App\Models\Warehouse;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WarehouseController extends Controller
{
    public function index(Request $request)
    {
        $query = Warehouse::query()->withCount('items');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $warehouses = $query->paginate((int) $request->query('per_page', 20));

        return WarehouseResource::collection($warehouses);
    }

    public function store(StoreWarehouseRequest $request): WarehouseResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $warehouse = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Warehouse::class, 'GDG');

            return Warehouse::create($data);
        });

        return new WarehouseResource($warehouse);
    }

    public function show(Warehouse $warehouse): WarehouseResource
    {
        $warehouse->loadCount('items');

        return new WarehouseResource($warehouse);
    }

    public function update(UpdateWarehouseRequest $request, Warehouse $warehouse): WarehouseResource
    {
        $warehouse->update($request->validated());

        return new WarehouseResource($warehouse->fresh()->loadCount('items'));
    }

    public function destroy(Warehouse $warehouse): JsonResponse
    {
        if ($warehouse->items()->exists()) {
            return response()->json([
                'message' => 'Gudang tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $warehouse->delete();

        return response()->json(['message' => 'Gudang berhasil dihapus.'], 200);
    }
}
