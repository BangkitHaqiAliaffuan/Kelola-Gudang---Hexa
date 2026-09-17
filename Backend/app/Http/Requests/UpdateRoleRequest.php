<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesAdministrator;
use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
{
    use AuthorizesAdministrator;

    public function rules(): array
    {
        $current = $this->route('role');

        return [
            // Rename opsional: berpropagasi ke users + role_permissions.
            'name' => ['sometimes', 'string', 'max:100', 'not_regex:/\//', Rule::unique('roles', 'name')->ignore($current, 'name')],
            'description' => ['nullable', 'string', 'max:500'],
            'can_review' => ['sometimes', 'boolean'],
            'warehouse_scope_mode' => ['sometimes', 'string', Rule::in(Role::WAREHOUSE_SCOPES)],
            'access' => ['sometimes', 'array'],
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
