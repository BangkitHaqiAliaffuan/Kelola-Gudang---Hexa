<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class RoleController extends Controller
{
    public function index()
    {
        return RoleResource::collection($this->roleCatalog());
    }

    public function update(string $role, UpdateRoleRequest $request): RoleResource|JsonResponse
    {
        if (! in_array($role, StoreUserRequest::ROLES, true)) {
            return response()->json([
                'message' => 'Role tidak ditemukan.',
                'errors' => ['role' => ['Role tidak ditemukan.']],
            ], 422);
        }

        $access = $request->validated('access');

        DB::transaction(function () use ($role, $access) {
            RolePermission::query()->where('role', $role)->delete();

            foreach ($access as $entry) {
                RolePermission::create([
                    'role' => $role,
                    'module' => $entry['module'],
                    'level' => $entry['level'],
                ]);
            }
        });

        return new RoleResource($this->roleCatalog()->firstWhere('name', $role));
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function roleCatalog()
    {
        return collect(StoreUserRequest::ROLES)->map(fn (string $role, int $index) => [
            'id' => $index + 1,
            'name' => $role,
            'user_count' => User::query()->where('role', $role)->count(),
            'active_user_count' => User::query()->where('role', $role)->where('is_active', true)->count(),
            'access' => RolePermission::accessForRole($role),
        ]);
    }
}
