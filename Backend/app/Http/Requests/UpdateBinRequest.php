<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBinRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $bin = $this->route('bin');

        return [
            'rack_id' => ['required', 'integer', 'exists:racks,id'],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('bins', 'code')->ignore($bin)],
            'name' => ['required', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
