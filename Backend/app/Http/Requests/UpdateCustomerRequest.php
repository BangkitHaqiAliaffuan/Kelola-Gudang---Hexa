<?php

namespace App\Http\Requests;

use App\Rules\ValidNpwp;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $customer = $this->route('customer');

        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('customers', 'code')->ignore($customer)],
            'name' => ['required', 'string', 'max:150', Rule::unique('customers', 'name')->ignore($customer)],
            'legal_name' => ['nullable', 'string', 'max:200'],
            'nib' => ['nullable', 'string', 'regex:/^\d{13}$/'],
            'npwp' => ['nullable', 'string', new ValidNpwp],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'string', 'email', 'max:150'],
            'pic_name' => ['nullable', 'string', 'max:150'],
            'website' => ['nullable', 'url', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'segment' => ['nullable', Rule::in(['Retail', 'Distributor', 'Proyek', 'Korporat'])],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account_no' => ['nullable', 'string', 'max:50'],
            'bank_account_name' => ['nullable', 'string', 'max:150'],
            'verification_status' => ['nullable', Rule::in(['unverified', 'verified', 'rejected'])],
            'verification_note' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
