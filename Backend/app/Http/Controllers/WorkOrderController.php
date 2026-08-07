<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWorkOrderRequest;
use App\Http\Requests\UpdateWorkOrderRequest;
use App\Http\Resources\WorkOrderResource;
use App\Models\WorkOrder;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkOrderController extends Controller
{
    public function index(Request $request)
    {
        $query = WorkOrder::query()->with(['project', 'item', 'unit', 'pic']);

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(no) LIKE ?', ["%{$needle}%"])
                    ->orWhereHas('project', fn ($project) => $project->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]))
                    ->orWhereHas('item', fn ($item) => $item->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]));
            });
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($projectId = $request->query('project_id')) {
            $query->where('project_id', $projectId);
        }

        $query->orderByDesc('id');

        $workOrders = $query->paginate((int) $request->query('per_page', 20));

        return WorkOrderResource::collection($workOrders);
    }

    public function store(StoreWorkOrderRequest $request): WorkOrderResource
    {
        $data = $request->validated();
        $data['status'] = $data['status'] ?? 'Perencanaan';

        $workOrder = DB::transaction(function () use ($data) {
            $data['no'] = $data['no'] ?? CodeGenerator::next(WorkOrder::class, 'WO', 'no');

            return WorkOrder::create($data);
        });

        return new WorkOrderResource($workOrder->load(['project', 'item', 'unit', 'pic']));
    }

    public function show(WorkOrder $workOrder): WorkOrderResource
    {
        return new WorkOrderResource($workOrder->load(['project', 'item', 'unit', 'pic']));
    }

    public function update(UpdateWorkOrderRequest $request, WorkOrder $workOrder): WorkOrderResource
    {
        $workOrder->update($request->validated());

        return new WorkOrderResource($workOrder->fresh()->load(['project', 'item', 'unit', 'pic']));
    }

    public function destroy(WorkOrder $workOrder): JsonResponse
    {
        $workOrder->delete();

        return response()->json(['message' => 'Work order berhasil dihapus.'], 200);
    }
}
