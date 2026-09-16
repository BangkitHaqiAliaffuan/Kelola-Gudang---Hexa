<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSubCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $subCategory = $this->route('sub_category');

        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'code' => ['required', 'string', 'max:20', Rule::unique('sub_categories', 'code')->ignore($subCategory)],
            'name' => ['required', 'string', 'max:150', Rule::unique('sub_categories', 'name')->where(fn ($q) => $q->where('category_id', $this->input('category_id')))->ignore($subCategory)],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
