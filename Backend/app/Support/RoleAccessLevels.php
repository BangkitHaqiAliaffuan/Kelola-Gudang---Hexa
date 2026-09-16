<?php

namespace App\Support;

use App\Models\RolePermission;

/**
 * Single source of truth untuk pemetaan HTTP verb → level akses
 * (Baca/Tulis/Kelola) dan pengecekan (role, module) → level.
 *
 * Dipakai bersama oleh middleware `EnsureRoleAccess` dan trait
 * `AuthorizesModule` (FormRequest) agar keduanya tidak pernah drift.
 * Otorisasi utama tetap di middleware (S1); trait hanya lapisan kedua.
 */
final class RoleAccessLevels
{
    public const LEVEL_RANK = [
        'Baca' => 1,
        'Tulis' => 2,
        'Kelola' => 3,
    ];

    public static function requiredLevelForMethod(string $method): int
    {
        return match (strtoupper($method)) {
            'GET', 'HEAD' => 1,
            'POST', 'PUT', 'PATCH' => 2,
            'DELETE' => 3,
            default => 2,
        };
    }

    public static function roleHasLevel(string $role, string $module, int $required): bool
    {
        foreach (RolePermission::accessForRole($role) as $permission) {
            if ($permission['module'] !== $module) {
                continue;
            }

            return (self::LEVEL_RANK[$permission['level']] ?? 0) >= $required;
        }

        return false;
    }
}
