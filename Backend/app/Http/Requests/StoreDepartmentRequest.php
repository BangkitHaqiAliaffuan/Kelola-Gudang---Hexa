<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('departments', 'code')],
            'name' => ['required', 'string', 'max:150', Rule::unique('departments', 'name')],
            'head_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($q) => $q->where('role', '!=', 'Administrator')->where('is_active', true)),
            ],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'head_user_id.exists' => 'Administrator tidak boleh menjadi kepala departemen atau user tidak aktif.',
        ];
    }
}
