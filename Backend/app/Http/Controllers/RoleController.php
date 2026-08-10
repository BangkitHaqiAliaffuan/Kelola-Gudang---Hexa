<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Resources\RoleResource;
use App\Models\User;

class RoleController extends Controller
{
    public function index()
    {
        $roles = collect(StoreUserRequest::ROLES)->map(fn (string $role, int $index) => [
            'id' => $index + 1,
            'name' => $role,
            'user_count' => User::query()->where('role', $role)->count(),
            'active_user_count' => User::query()->where('role', $role)->where('is_active', true)->count(),
        ]);

        return RoleResource::collection($roles);
    }
}
