<?php

namespace App\Http\Requests;

use App\Rules\ValidNpwp;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreVendorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('vendors', 'code')],
            'name' => ['required', 'string', 'max:150', Rule::unique('vendors', 'name')],
            'legal_name' => ['nullable', 'string', 'max:200'],
            'nib' => ['nullable', 'string', 'regex:/^\d{13}$/'],
            'npwp' => ['nullable', 'string', new ValidNpwp],
            'service_type' => ['nullable', Rule::in(['Ekspedisi', 'Maintenance', 'Kalibrasi', 'Cleaning'])],
            'contact_phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'string', 'email', 'max:150'],
            'pic_name' => ['nullable', 'string', 'max:150'],
            'website' => ['nullable', 'url', 'max:255'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account_no' => ['nullable', 'string', 'max:50'],
            'bank_account_name' => ['nullable', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
