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
            // Logo sebagai data-URL PNG/JPEG (frontend mengecilkan ke ≤500KB biner
            // ≈ 700.000 karakter base64; `max` string menghitung karakter).
            'company.logo' => ['sometimes', 'nullable', 'string', 'max:700000', 'regex:/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/'],
        ];
    }
}
