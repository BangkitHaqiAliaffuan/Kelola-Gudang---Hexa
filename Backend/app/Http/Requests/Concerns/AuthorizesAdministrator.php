<?php

namespace App\Http\Requests\Concerns;

/**
 * Defense-in-depth (follow-up F2) untuk endpoint yang digate
 * `role.administrator` di route: memastikan `authorize()` FormRequest
 * mencerminkan gate middleware yang sama, sehingga bila suatu saat route
 * lupa dibungkus middleware, otorisasi tetap ditolak.
 *
 * Digunakan pada 4 request "istimewa" yang mengelola identitas & hak akses:
 * StoreUserRequest, UpdateUserRequest, StoreRoleRequest, UpdateRoleRequest,
 * SettingUpdateRequest.
 *
 * Chokepoint utama tetap middleware `role.administrator` (S1). Role
 * Administrator adalah role sistem bawaan; tidak ada nama role lain yang
 * di-hardcode selain ini (konsisten dengan EnsureAdministrator).
 */
trait AuthorizesAdministrator
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->role === 'Administrator';
    }
}
