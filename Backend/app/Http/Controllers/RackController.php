<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRackRequest;
use App\Http\Requests\UpdateRackRequest;
use App\Http\Resources\RackResource;
use App\Models\ItemStock;
use App\Models\Rack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RackController extends Controller
{
    public function index(Request $request)
    {
        $query = Rack::query()->with('warehouse')->withCount('bins');

        if ($warehouseId = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $warehouseId);
        }

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $racks = $query->paginate((int) $request->query('per_page', 20));

        return RackResource::collection($racks);
    }

    public function store(StoreRackRequest $request): RackResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;
        $data['code'] = $data['aisle'].'-'.$data['bay'];
        $data['name'] = $this->resolveName($data['name'] ?? null, $data['code']);

        $rack = Rack::create($data);

        return new RackResource($rack->load('warehouse')->loadCount('bins'));
    }

    public function show(Rack $rack): RackResource
    {
        $rack->load('warehouse')->loadCount('bins');

        return new RackResource($rack);
    }

    public function update(UpdateRackRequest $request, Rack $rack): RackResource
    {
        $data = $request->validated();
        
        if (isset($data['warehouse_id']) && (int) $data['warehouse_id'] !== (int) $rack->warehouse_id) {
            $binIds = $rack->bins()->pluck('id');
            $hasStock = $binIds->isNotEmpty() && ItemStock::whereIn('bin_id', $binIds)->where('stock', '>', 0)->exists();
            if ($hasStock) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'warehouse_id' => 'Rak tidak dapat dipindah ke gudang lain karena masih terikat riwayat stok.'
                ]);
            }
        }

        $data['code'] = $data['aisle'].'-'.$data['bay'];
        $data['name'] = $this->resolveName($data['name'] ?? null, $data['code']);
        $rack->update($data);

        return new RackResource($rack->fresh()->load('warehouse')->loadCount('bins'));
    }

    public function destroy(Rack $rack): JsonResponse
    {
        if ($rack->bins()->exists()) {
            return response()->json([
                'message' => 'Rak tidak dapat dihapus karena masih memiliki bin.',
            ], 422);
        }

        if ($rack->items()->exists()) {
            return response()->json([
                'message' => 'Rak tidak dapat dihapus karena masih digunakan oleh barang.',
            ], 422);
        }

        $rack->delete();

        return response()->json(['message' => 'Rak berhasil dihapus.'], 200);
    }

    private function resolveName(?string $name, string $code): string
    {
        $trimmed = trim((string) $name);

        return $trimmed === '' ? 'Rak '.$code : $trimmed;
    }
}
