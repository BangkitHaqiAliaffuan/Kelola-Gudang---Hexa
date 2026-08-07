<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateVendorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $vendor = $this->route('vendor');

        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('vendors', 'code')->ignore($vendor)],
            'name' => ['required', 'string', 'max:150', Rule::unique('vendors', 'name')->ignore($vendor)],
            'service_type' => ['nullable', Rule::in(['Ekspedisi', 'Maintenance', 'Kalibrasi', 'Cleaning'])],
            'contact_phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'string', 'email', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
