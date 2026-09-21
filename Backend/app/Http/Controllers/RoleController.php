<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRoleRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Models\RolePermission;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class RoleController extends Controller
{
    public function index()
    {
        return RoleResource::collection(Role::query()->orderBy('id')->get());
    }

    public function store(StoreRoleRequest $request): RoleResource|JsonResponse
    {
        $validated = $request->validated();

        $role = DB::transaction(function () use ($validated) {
            $role = Role::create([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'can_review' => $validated['can_review'] ?? false,
                'warehouse_scope_mode' => $validated['warehouse_scope_mode'] ?? 'Semua',
            ]);

            // Role baru lahir dengan NOL baris permission = tolak semua modul
            // (deny-by-default) sampai diberi akses eksplisit.
            foreach ($validated['access'] ?? [] as $entry) {
                RolePermission::create([
                    'role' => $role->name,
                    'module' => $entry['module'],
                    'level' => $entry['level'],
                ]);
            }

            return $role;
        });

        AuditLogger::record([
            'action' => 'Create',
            'module' => 'System',
            'auditable_type' => 'Role',
            'record_no' => "Role: {$role->name}",
            'new_values' => $validated,
        ]);

        return (new RoleResource($role->fresh()))->response()->setStatusCode(201);
    }

    public function update(string $role, UpdateRoleRequest $request): RoleResource|JsonResponse
    {
        $record = Role::query()->where('name', $role)->first();

        if (! $record) {
            return response()->json([
                'message' => 'Role tidak ditemukan.',
            ], 404);
        }

        $validated = $request->validated();
        $newName = $validated['name'] ?? $record->name;

        // Guard nama role sistem (W1 pasca-audit): gate administrator
        // (EnsureAdministrator/AuthorizesAdministrator/guardLastAdministrator)
        // mencocokkan string 'Administrator'. Rename role ini mempropagasi ke
        // users.role (di bawah) sehingga seketika nol admin → lockout total
        // yang hanya pulih via DB/console. Nama immutable; deskripsi/akses
        // tetap boleh diubah.
        if ($record->name === 'Administrator' && $newName !== 'Administrator') {
            return response()->json([
                'message' => 'Role sistem Administrator tidak dapat diubah namanya.',
                'errors' => ['name' => ['Role sistem Administrator tidak dapat diubah namanya.']],
            ], 422);
        }

        // Self-lockout guard: user tak boleh mencabut System/Kelola dari
        // role-nya sendiri (akan mengunci diri keluar dari manajemen akses).
        $authUser = $request->user('sanctum') ?? $request->user();
        if ($authUser && $authUser->role === $record->name && array_key_exists('access', $validated)) {
            $keepsSystem = collect($validated['access'])->contains(
                fn (array $entry) => $entry['module'] === 'System' && $entry['level'] === 'Kelola'
            );

            if (! $keepsSystem) {
                return response()->json([
                    'message' => 'Role Anda sendiri wajib mempertahankan akses System Kelola.',
                    'errors' => ['access' => ['Role Anda sendiri wajib mempertahankan akses System Kelola.']],
                ], 422);
            }
        }

        DB::transaction(function () use ($record, $role, $newName, $validated) {
            $record->update([
                'name' => $newName,
                'description' => $validated['description'] ?? $record->description,
                'can_review' => $validated['can_review'] ?? $record->can_review,
                'warehouse_scope_mode' => $validated['warehouse_scope_mode'] ?? $record->warehouse_scope_mode,
            ]);

            // Rename berpropagasi ke users + permission dalam satu transaksi
            // (kolom string tanpa FK — audit_logs adalah snapshot historis
            // dan SENGAJA tidak ikut di-rewrite).
            if ($newName !== $role) {
                DB::table('users')->where('role', $role)->update(['role' => $newName]);
                RolePermission::query()->where('role', $role)->update(['role' => $newName]);
            }

            if (array_key_exists('access', $validated)) {
                RolePermission::query()->where('role', $newName)->delete();

                foreach ($validated['access'] as $entry) {
                    RolePermission::create([
                        'role' => $newName,
                        'module' => $entry['module'],
                        'level' => $entry['level'],
                    ]);
                }
            }
        });

        AuditLogger::record([
            'action' => 'Update',
            'module' => 'System',
            'auditable_type' => 'Role',
            'record_no' => "Role: {$record->name}",
            'new_values' => $validated,
        ]);

        return new RoleResource(Role::query()->where('name', $newName)->first());
    }

    public function destroy(string $role): JsonResponse
    {
        $record = Role::query()->where('name', $role)->first();

        if (! $record) {
            return response()->json([
                'message' => 'Role tidak ditemukan.',
            ], 404);
        }

        $userCount = $record->userCount();

        if ($userCount > 0) {
            return response()->json([
                'message' => "Role masih dipakai {$userCount} user — pindahkan atau nonaktifkan user-nya dulu.",
                'errors' => ['role' => ["Role masih dipakai {$userCount} user."]],
            ], 422);
        }

        DB::transaction(function () use ($record) {
            RolePermission::query()->where('role', $record->name)->delete();
            $record->delete();
        });

        AuditLogger::record([
            'action' => 'Delete',
            'module' => 'System',
            'auditable_type' => 'Role',
            'record_no' => "Role: {$record->name}",
        ]);

        return response()->json(['message' => 'Role dihapus.']);
    }
}
