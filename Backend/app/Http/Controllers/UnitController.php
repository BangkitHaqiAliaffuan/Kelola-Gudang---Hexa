<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUnitRequest;
use App\Http\Requests\UpdateUnitRequest;
use App\Http\Resources\UnitResource;
use App\Models\Unit;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UnitController extends Controller
{
    public function index(Request $request)
    {
        $query = Unit::query()->withCount('items');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $units = $query->paginate((int) $request->query('per_page', 20));

        return UnitResource::collection($units);
    }

    public function store(StoreUnitRequest $request): UnitResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $unit = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Unit::class, 'UNT');

            return Unit::create($data);
        });

        return new UnitResource($unit);
    }

    public function show(Unit $unit): UnitResource
    {
        $unit->loadCount('items');

        return new UnitResource($unit);
    }

    public function update(UpdateUnitRequest $request, Unit $unit): UnitResource
    {
        $unit->update($request->validated());

        return new UnitResource($unit->fresh()->loadCount('items'));
    }

    public function destroy(Unit $unit): JsonResponse
    {
        if ($unit->items()->exists()) {
            return response()->json([
                'message' => 'Satuan tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $unit->delete();

        return response()->json(['message' => 'Satuan berhasil dihapus.'], 200);
    }
}
