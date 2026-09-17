<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query()->with('defaultWarehouse');

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(email) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $request->validate(['per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);

        $users = $query->paginate((int) $request->query('per_page', 20));

        return UserResource::collection($users);
    }

    public function store(StoreUserRequest $request): UserResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;
        $warehouseIds = $data['warehouse_ids'] ?? null;
        unset($data['warehouse_ids']);
        $this->assertScopeCoverage($data['role'], $warehouseIds, $data['default_warehouse_id'] ?? null);

        $user = DB::transaction(function () use ($data, $warehouseIds) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(User::class, 'USR');
            $user = User::create($data);
            if ($warehouseIds !== null) {
                $user->warehouses()->sync($warehouseIds);
            }

            return $user;
        });

        $user->load('defaultWarehouse', 'warehouses');

        return new UserResource($user);
    }

    public function show(User $user): UserResource
    {
        $user->load('defaultWarehouse', 'warehouses');

        return new UserResource($user);
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $data = $request->validated();

        if (empty($data['password'])) {
            unset($data['password']);
        }

        $warehouseIds = $data['warehouse_ids'] ?? null;
        unset($data['warehouse_ids']);
        $this->assertScopeCoverage(
            $data['role'] ?? $user->role,
            $warehouseIds ?? $user->warehouses()->pluck('warehouses.id')->all(),
            $data['default_warehouse_id'] ?? $user->default_warehouse_id
        );

        $user->update($data);
        if ($warehouseIds !== null) {
            $user->warehouses()->sync($warehouseIds);
        }

        return new UserResource($user->fresh()->load('defaultWarehouse', 'warehouses'));
    }

    /**
     * Validasi W4 + kesamaan default-tugasan: user ber-role 'Terbatas' wajib
     * punya ≥1 gudang di pivot atau `default_warehouse_id` (fallback W5);
     * bila pivot non-kosong, default wajib salah satu gudang tugasan.
     * Selain itu bebas.
     *
     * @param  int[]|null  $warehouseIds
     */
    private function assertScopeCoverage(string $role, ?array $warehouseIds, ?int $defaultWarehouseId): void
    {
        $record = Role::query()->where('name', $role)->first();

        if (! $record || $record->warehouse_scope_mode !== 'Terbatas') {
            return;
        }

        if (($warehouseIds === null || $warehouseIds === []) && $defaultWarehouseId === null) {
            throw ValidationException::withMessages([
                'warehouse_ids' => ['User ber-role Terbatas wajib memiliki minimal 1 gudang atau gudang default.'],
            ]);
        }

        $ids = array_map('intval', $warehouseIds ?? []);
        if ($ids !== [] && $defaultWarehouseId !== null && ! in_array($defaultWarehouseId, $ids, true)) {
            throw ValidationException::withMessages([
                'default_warehouse_id' => ['Gudang Default harus salah satu gudang tugasan user.'],
            ]);
        }
    }

    public function destroy(User $user): JsonResponse
    {
        $user->delete();

        return response()->json(['message' => 'User berhasil dihapus.'], 200);
    }
}
