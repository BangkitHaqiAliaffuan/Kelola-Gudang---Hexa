<?php

namespace App\Http\Requests;

use App\Models\RolePermission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'access' => ['present', 'array'],
            'access.*.module' => ['required', 'string', Rule::in(RolePermission::MODULES)],
            'access.*.level' => ['required', Rule::in(RolePermission::LEVELS)],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $modules = array_column($this->input('access', []), 'module');

            if (count($modules) !== count(array_unique($modules))) {
                $validator->errors()->add('access', 'Tidak boleh ada modul yang sama lebih dari sekali.');
            }
        });
    }
}
