<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesAdministrator;
use App\Models\RolePermission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRoleRequest extends FormRequest
{
    use AuthorizesAdministrator;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Nama dipakai di URL (…/roles/{role}) — tanpa slash agar routing aman.
            'name' => ['required', 'string', 'max:100', 'not_regex:/\//', Rule::unique('roles', 'name')],
            'description' => ['nullable', 'string', 'max:500'],
            'can_review' => ['sometimes', 'boolean'],
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
