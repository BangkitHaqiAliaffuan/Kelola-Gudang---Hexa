<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('suppliers', 'code')],
            'name' => ['required', 'string', 'max:150', Rule::unique('suppliers', 'name')],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'string', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'payment_terms' => ['nullable', Rule::in(['NET 30', 'NET 14', 'COD', 'NET 45'])],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
