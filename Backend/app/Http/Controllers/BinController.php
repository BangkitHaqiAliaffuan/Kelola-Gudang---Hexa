<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBinRequest;
use App\Http\Requests\UpdateBinRequest;
use App\Http\Resources\BinResource;
use App\Models\Bin;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BinController extends Controller
{
    public function index(Request $request)
    {
        $query = Bin::query()->with('rack.warehouse')->withCount('items');

        if ($rackId = $request->query('rack_id')) {
            $query->where('rack_id', $rackId);
        }

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $bins = $query->paginate((int) $request->query('per_page', 20));

        return BinResource::collection($bins);
    }

    public function store(StoreBinRequest $request): BinResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $bin = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Bin::class, 'BIN');

            return Bin::create($data);
        });

        return new BinResource($bin->load('rack.warehouse')->loadCount('items'));
    }

    public function show(Bin $bin): BinResource
    {
        $bin->load('rack.warehouse')->loadCount('items');

        return new BinResource($bin);
    }

    public function update(UpdateBinRequest $request, Bin $bin): BinResource
    {
        $bin->update($request->validated());

        return new BinResource($bin->fresh()->load('rack.warehouse')->loadCount('items'));
    }

    public function destroy(Bin $bin): JsonResponse
    {
        if ($bin->items()->exists()) {
            return response()->json([
                'message' => 'Bin tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $bin->delete();

        return response()->json(['message' => 'Bin berhasil dihapus.'], 200);
    }
}
