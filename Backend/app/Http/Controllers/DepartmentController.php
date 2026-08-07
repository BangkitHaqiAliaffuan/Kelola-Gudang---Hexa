<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdateDepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $query = Department::query()->with('head');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $departments = $query->paginate((int) $request->query('per_page', 20));

        return DepartmentResource::collection($departments);
    }

    public function store(StoreDepartmentRequest $request): DepartmentResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $department = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Department::class, 'DEP');

            return Department::create($data);
        });

        return new DepartmentResource($department->load('head'));
    }

    public function show(Department $department): DepartmentResource
    {
        return new DepartmentResource($department->load('head'));
    }

    public function update(UpdateDepartmentRequest $request, Department $department): DepartmentResource
    {
        $department->update($request->validated());

        return new DepartmentResource($department->fresh()->load('head'));
    }

    public function destroy(Department $department): JsonResponse
    {
        $department->delete();

        return response()->json(['message' => 'Departemen berhasil dihapus.'], 200);
    }
}
