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

    protected function prepareForValidation(): void
    {
        $this->merge([
            'code' => $this->input('aisle').'-'.$this->input('bay'),
        ]);
    }

    public function rules(): array
    {
        $rack = $this->route('rack');

        return [
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'aisle' => ['required', 'string', 'regex:/^[A-Z]$/'],
            'bay' => ['required', 'string', 'regex:/^\d{2}$/'],
            'code' => [
                'nullable',
                'string',
                'max:20',
                Rule::unique('racks', 'code')
                    ->where(fn ($q) => $q->where('warehouse_id', $this->input('warehouse_id')))
                    ->ignore($rack),
            ],
            'name' => ['required', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
