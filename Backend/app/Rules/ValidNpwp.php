<?php

namespace App\Rules;

use App\Support\Npwp;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidNpwp implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! Npwp::isValid($value)) {
            $fail('Format NPWP tidak valid (15/16 digit dengan checksum yang benar).');
        }
    }
}
