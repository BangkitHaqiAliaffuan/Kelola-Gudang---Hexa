<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $department = $this->route('department');

        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('departments', 'code')->ignore($department)],
            'name' => ['required', 'string', 'max:150', Rule::unique('departments', 'name')->ignore($department)],
            'head_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
