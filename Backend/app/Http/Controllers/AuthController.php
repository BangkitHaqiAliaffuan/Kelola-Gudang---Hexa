<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Kredensial yang Anda masukkan tidak cocok.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Akun ini telah dinonaktifkan. Hubungi administrator.'],
            ]);
        }

        $user->load('defaultWarehouse');
        $token = $user->createToken('kg-session')->plainTextToken;

        return response()->json([
            'data' => (new UserResource($user))->resolve(),
            'access' => RolePermission::accessForRole($user->role),
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Berhasil keluar.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('defaultWarehouse');

        return response()->json([
            'data' => (new UserResource($user))->resolve(),
            'access' => RolePermission::accessForRole($user->role),
        ]);
    }
}
