<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CostDriftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Ambang selisih persen untuk menyaring (|avg - cost| / cost * 100).
            'threshold_pct' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ];
    }
}
