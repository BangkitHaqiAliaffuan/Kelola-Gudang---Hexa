<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $category = $this->route('category');

        return [
            'code' => ['required', 'string', 'max:20', Rule::unique('categories', 'code')->ignore($category)],
            'name' => ['required', 'string', 'max:150', Rule::unique('categories', 'name')->ignore($category)],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
