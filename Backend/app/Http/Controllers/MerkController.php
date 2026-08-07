<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreMerkRequest;
use App\Http\Requests\UpdateMerkRequest;
use App\Http\Resources\MerkResource;
use App\Models\Merk;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MerkController extends Controller
{
    public function index(Request $request)
    {
        $query = Merk::query()->withCount('items');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $merks = $query->paginate((int) $request->query('per_page', 20));

        return MerkResource::collection($merks);
    }

    public function store(StoreMerkRequest $request): MerkResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $merk = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Merk::class, 'MRK');

            return Merk::create($data);
        });

        return new MerkResource($merk);
    }

    public function show(Merk $merk): MerkResource
    {
        $merk->loadCount('items');

        return new MerkResource($merk);
    }

    public function update(UpdateMerkRequest $request, Merk $merk): MerkResource
    {
        $merk->update($request->validated());

        return new MerkResource($merk->fresh()->loadCount('items'));
    }

    public function destroy(Merk $merk): JsonResponse
    {
        if ($merk->items()->exists()) {
            return response()->json([
                'message' => 'Merk tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $merk->delete();

        return response()->json(['message' => 'Merk berhasil dihapus.'], 200);
    }
}
