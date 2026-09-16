<?php

namespace App\Http\Requests\Concerns;

use App\Support\RoleAccessLevels;

/**
 * Defense-in-depth (F2 parsial): cek (module, level) di level FormRequest
 * untuk endpoint non-standar yang tidak tercakup pola apiResource biasa.
 *
 * Chokepoint utama tetap middleware `role.access` (S1); trait ini hanya
 * lapisan kedua bila suatu saat ada route yang lupa dibungkus middleware.
 * Tidak ada nama role yang di-hardcode — role dinamis aman.
 */
trait AuthorizesModule
{
    protected string $module = 'Master Data';

    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user) {
            return false;
        }

        return RoleAccessLevels::roleHasLevel(
            $user->role,
            $this->module,
            RoleAccessLevels::requiredLevelForMethod($this->method())
        );
    }
}
