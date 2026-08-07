<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubCategoryRequest;
use App\Http\Requests\UpdateSubCategoryRequest;
use App\Http\Resources\SubCategoryResource;
use App\Models\SubCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubCategoryController extends Controller
{
    public function index(Request $request)
    {
        $query = SubCategory::query()->with('category');

        if ($categoryId = $request->query('category_id')) {
            $query->where('category_id', $categoryId);
        }

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $subCategories = $query->paginate((int) $request->query('per_page', 20));

        return SubCategoryResource::collection($subCategories);
    }

    public function store(StoreSubCategoryRequest $request): SubCategoryResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;
        $subCategory = SubCategory::create($data);

        return new SubCategoryResource($subCategory->load('category'));
    }

    public function show(SubCategory $subCategory): SubCategoryResource
    {
        return new SubCategoryResource($subCategory->load('category'));
    }

    public function update(UpdateSubCategoryRequest $request, SubCategory $subCategory): SubCategoryResource
    {
        $subCategory->update($request->validated());

        return new SubCategoryResource($subCategory->fresh()->load('category'));
    }

    public function destroy(SubCategory $subCategory): JsonResponse
    {
        if ($subCategory->items()->exists()) {
            return response()->json([
                'message' => 'Sub kategori tidak dapat dihapus karena masih memiliki barang.',
            ], 422);
        }

        $subCategory->delete();

        return response()->json(['message' => 'Sub kategori berhasil dihapus.'], 200);
    }
}
