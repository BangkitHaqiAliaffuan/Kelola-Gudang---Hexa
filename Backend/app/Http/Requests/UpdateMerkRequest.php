<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMerkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $merk = $this->route('merk');

        return [
            'code' => ['required', 'string', 'max:20', Rule::unique('merks', 'code')->ignore($merk)],
            'name' => ['required', 'string', 'max:150', Rule::unique('merks', 'name')->ignore($merk)],
            'country' => ['nullable', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
