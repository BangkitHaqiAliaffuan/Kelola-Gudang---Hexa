<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rack = $this->route('rack');

        return [
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('racks', 'code')->ignore($rack)],
            'name' => ['required', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
