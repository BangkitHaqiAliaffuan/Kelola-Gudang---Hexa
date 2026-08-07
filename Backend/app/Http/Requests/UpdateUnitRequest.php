<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUnitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $unit = $this->route('unit');

        return [
            'code' => ['required', 'string', 'max:20', Rule::unique('units', 'code')->ignore($unit)],
            'name' => ['required', 'string', 'max:50', Rule::unique('units', 'name')->ignore($unit)],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
