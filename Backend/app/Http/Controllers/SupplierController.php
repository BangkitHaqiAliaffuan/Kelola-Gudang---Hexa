<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSupplierRequest;
use App\Http\Requests\UpdateSupplierRequest;
use App\Http\Resources\SupplierResource;
use App\Models\Supplier;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $query = Supplier::query()->withCount('items');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(city) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $suppliers = $query->paginate((int) $request->query('per_page', 20));

        return SupplierResource::collection($suppliers);
    }

    public function store(StoreSupplierRequest $request): SupplierResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $supplier = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Supplier::class, 'SUP');

            return Supplier::create($data);
        });

        return new SupplierResource($supplier);
    }

    public function show(Supplier $supplier): SupplierResource
    {
        $supplier->loadCount('items');

        return new SupplierResource($supplier);
    }

    public function update(UpdateSupplierRequest $request, Supplier $supplier): SupplierResource
    {
        $supplier->update($request->validated());

        return new SupplierResource($supplier->fresh()->loadCount('items'));
    }

    public function destroy(Supplier $supplier): JsonResponse
    {
        if ($supplier->items()->exists()) {
            return response()->json([
                'message' => 'Supplier tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $supplier->delete();

        return response()->json(['message' => 'Supplier berhasil dihapus.'], 200);
    }
}
