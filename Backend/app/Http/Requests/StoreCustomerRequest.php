<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('customers', 'code')],
            'name' => ['required', 'string', 'max:150', Rule::unique('customers', 'name')],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'string', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'segment' => ['nullable', Rule::in(['Retail', 'Distributor', 'Proyek', 'Korporat'])],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
