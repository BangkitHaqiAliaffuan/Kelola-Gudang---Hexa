<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $user = $this->route('user');

        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('users', 'code')->ignore($user)],
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'role' => ['required', Rule::in(StoreUserRequest::ROLES)],
            'password' => ['nullable', 'string', 'min:8', 'max:64', 'confirmed'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
