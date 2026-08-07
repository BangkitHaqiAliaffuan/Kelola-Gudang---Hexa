<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreVendorRequest;
use App\Http\Requests\UpdateVendorRequest;
use App\Http\Resources\VendorResource;
use App\Models\Vendor;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VendorController extends Controller
{
    public function index(Request $request)
    {
        $query = Vendor::query();

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(service_type) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $vendors = $query->paginate((int) $request->query('per_page', 20));

        return VendorResource::collection($vendors);
    }

    public function store(StoreVendorRequest $request): VendorResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $vendor = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Vendor::class, 'VDR');

            return Vendor::create($data);
        });

        return new VendorResource($vendor->refresh());
    }

    public function show(Vendor $vendor): VendorResource
    {
        return new VendorResource($vendor);
    }

    public function update(UpdateVendorRequest $request, Vendor $vendor): VendorResource
    {
        $data = $request->validated();

        if (($data['verification_status'] ?? null) === 'verified' && $vendor->verification_status !== 'verified') {
            $data['verified_at'] = now();
        } elseif (($data['verification_status'] ?? null) !== 'verified') {
            $data['verified_at'] = null;
        }

        $vendor->update($data);

        return new VendorResource($vendor->fresh());
    }

    public function destroy(Vendor $vendor): JsonResponse
    {
        $vendor->delete();

        return response()->json(['message' => 'Vendor berhasil dihapus.'], 200);
    }
}
