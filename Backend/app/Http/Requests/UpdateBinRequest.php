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

    protected function prepareForValidation(): void
    {
        $this->merge([
            'code' => $this->input('level').'-'.$this->input('position'),
        ]);
    }

    public function rules(): array
    {
        $bin = $this->route('bin');

        return [
            'rack_id' => ['required', 'integer', 'exists:racks,id'],
            'level' => ['required', 'string', 'regex:/^\d{2}$/'],
            'position' => ['required', 'string', 'regex:/^\d{2}$/'],
            'code' => [
                'nullable',
                'string',
                'max:20',
                Rule::unique('bins', 'code')
                    ->where(fn ($q) => $q->where('rack_id', $this->input('rack_id')))
                    ->ignore($bin),
            ],
            'name' => ['required', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
