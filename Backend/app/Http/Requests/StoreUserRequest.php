<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesAdministrator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    use AuthorizesAdministrator;

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('users', 'code')],
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['required', 'string', Rule::exists('roles', 'name')],
            'default_warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')],
            'password' => ['required', 'string', 'min:8', 'max:64', 'confirmed'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
