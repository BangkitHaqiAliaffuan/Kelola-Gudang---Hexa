<?php

namespace App\Http\Requests;

use App\Rules\ValidNpwp;
use Illuminate\Foundation\Http\FormRequest;

class SettingUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company.name' => ['sometimes', 'string', 'max:120'],
            'company.npwp' => ['sometimes', 'nullable', 'string', 'max:32', new ValidNpwp],
            'company.address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'company.phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'company.email' => ['sometimes', 'nullable', 'email', 'max:120'],
            'company.currency' => ['sometimes', 'nullable', 'string', 'max:16'],
        ];
    }
}
