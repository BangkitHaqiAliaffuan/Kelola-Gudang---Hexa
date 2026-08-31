<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function index(Request $request)
    {
        $query = Project::query()->with(['pic', 'vendor'])->withCount('workOrders');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"])
                    ->orWhereHas('pic', fn ($pic) => $pic->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]))
                    ->orWhereHas('vendor', fn ($v) => $v->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]));
            });
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $query->orderBy('name');

        $projects = $query->paginate((int) $request->query('per_page', 20));

        return ProjectResource::collection($projects);
    }

    public function store(StoreProjectRequest $request): ProjectResource
    {
        $data = $request->validated();
        $data['status'] = $data['status'] ?? 'Perencanaan';

        $project = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Project::class, 'PRJ');

            return Project::create($data);
        });

        return new ProjectResource($project->load(['pic', 'vendor'])->loadCount('workOrders'));
    }

    public function show(Project $project): ProjectResource
    {
        return new ProjectResource($project->load(['pic', 'vendor'])->loadCount('workOrders'));
    }

    public function update(UpdateProjectRequest $request, Project $project): ProjectResource
    {
        $project->update($request->validated());

        return new ProjectResource($project->fresh()->load(['pic', 'vendor'])->loadCount('workOrders'));
    }

    public function destroy(Project $project): JsonResponse
    {
        if ($project->workOrders()->exists()) {
            return response()->json([
                'message' => 'Proyek tidak dapat dihapus karena masih memiliki work order.',
            ], 422);
        }

        $project->delete();

        return response()->json(['message' => 'Proyek berhasil dihapus.'], 200);
    }
}
