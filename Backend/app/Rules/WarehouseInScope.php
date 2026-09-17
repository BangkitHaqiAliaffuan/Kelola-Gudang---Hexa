<?php

namespace App\Rules;

use App\Support\WarehouseScope;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Gudang asal harus berada dalam lingkup user (F7.4).
 * Mode 'Semua' → lolos; 'Terbatas' → warehouse_id wajib ∈ allowed.
 * Gudang TUJUAN transfer bebas (W8) — rule ini hanya dipasang di
 * field gudang asal.
 */
class WarehouseInScope implements ValidationRule
{
    /**
     * @param  Closure(string): void  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $user = request()->user();

        if (! $user) {
            return;
        }

        $allowed = WarehouseScope::effectiveIdsFor($user);

        if ($allowed === null) {
            return;
        }

        if (! in_array((int) $value, $allowed, true)) {
            $fail('Gudang di luar lingkup akses Anda.');
        }
    }
}
