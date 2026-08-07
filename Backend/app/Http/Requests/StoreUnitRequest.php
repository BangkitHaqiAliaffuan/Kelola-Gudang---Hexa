<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUnitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('units', 'code')],
            'name' => ['required', 'string', 'max:50', Rule::unique('units', 'name')],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
